// @vitest-environment jsdom

/**
 * Session-layer conversation history (D5). The core scenarios run against BOTH
 * the real Runtype provider (over a fake `/v1/client/*` backend) and the real
 * in-memory demo provider: anything that needs a Runtype special case here is a
 * seam defect, not a test problem.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AgentWidgetSession,
  SessionHistoryError,
  type SessionHistoryNotice,
  type SessionHistoryState,
} from './session';
import { createDemoHistoryProvider } from './internal/demo-history-provider';
import { createRuntypeHistoryProvider } from './internal/runtype-history-provider';
import type { HistoryProvider } from './internal/history-provider';
import {
  createVisitorStore,
  visitorStoreKeys,
  type VisitorStore,
} from './utils/visitor-store';
import type {
  AgentWidgetMessage,
  ClientChatRequest,
  PendingDisplayProjections,
  WidgetHistoryInternals,
} from './types';

const CLIENT_TOKEN = 'ct_session_history';
const API_URL = 'https://api.runtype.com';
const WELCOME = 'Welcome! How can I help?';
const PAGE_SIZE = 2;

const T = (minute: number) =>
  new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString();

type SeedMessage = {
  id: string;
  role: 'user' | 'assistant';
  /** Visitor-visible projection. */
  display: string;
  /** Model channel as the API stored it; diverges from `display` when set. */
  model?: string;
  createdAt: string;
};

type SeedConversation = {
  id: string;
  title: string;
  targetId: string;
  messages: SeedMessage[];
};

const SEEDS: SeedConversation[] = [
  {
    id: 'conv-a',
    title: 'Conversation A',
    targetId: 'flow_1',
    messages: [
      {
        id: 'a1',
        role: 'user',
        display: 'Where is my order?',
        model: '{"intent":"order_status","orderId":41822}',
        createdAt: T(0),
      },
      {
        id: 'a2',
        role: 'assistant',
        display: 'It ships Thursday.',
        createdAt: T(1),
      },
    ],
  },
  {
    id: 'conv-b',
    title: 'Conversation B',
    targetId: 'flow_1',
    messages: [
      { id: 'b1', role: 'user', display: 'turn one', createdAt: T(10) },
      { id: 'b2', role: 'assistant', display: 'turn two', createdAt: T(11) },
      { id: 'b3', role: 'user', display: 'turn three', createdAt: T(12) },
      { id: 'b4', role: 'assistant', display: 'turn four', createdAt: T(13) },
      { id: 'b5', role: 'user', display: 'turn five', createdAt: T(14) },
    ],
  },
];

// ── Fake Runtype backend ──────────────────────────────────────────────────

type FailableOperation =
  | 'list'
  | 'getPage'
  | 'prepareOpen'
  | 'prepareStartNew'
  | 'delete'
  | 'deleteAll';

type BackendConversation = {
  id: string;
  title: string;
  targetId: string;
  createdAt: string;
  updatedAt: string;
  revision: string;
  messages: Array<{
    id: string;
    role: string;
    content?: string;
    displayContent?: string;
    displayAvailable: boolean;
    timestamp: string;
  }>;
};

type RecordedRequest = {
  url: string;
  method: string;
  body?: Record<string, unknown>;
};

const futureIso = () => new Date(Date.now() + 10 * 60_000).toISOString();

const respond = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {
    get: (name: string) =>
      name.toLowerCase() === 'x-history-identity-status' ? 'not_provided' : null,
  },
  json: async () => body,
});

const sseOk = (text: string) => {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }),
    json: async () => ({}),
  };
};

function createRuntypeBackend() {
  const conversations = new Map<string, BackendConversation>();
  const sessions = new Map<string, string>();
  const requests: RecordedRequest[] = [];
  const failures = new Map<FailableOperation, number>();
  const chatQueue: Array<() => unknown> = [];
  let sessionSeq = 0;
  let convSeq = 0;
  let revisionSeq = 0;

  const nextRevision = () => `rev-${(revisionSeq += 1)}`;

  for (const seed of SEEDS) {
    conversations.set(seed.id, {
      id: seed.id,
      title: seed.title,
      targetId: seed.targetId,
      createdAt: seed.messages[0].createdAt,
      updatedAt: seed.messages[seed.messages.length - 1].createdAt,
      revision: nextRevision(),
      messages: seed.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.model ?? message.display,
        ...(message.model ? { displayContent: message.display } : {}),
        displayAvailable: true,
        timestamp: message.createdAt,
      })),
    });
  }

  const shouldFail = (operation: FailableOperation): boolean => {
    const remaining = failures.get(operation) ?? 0;
    if (remaining <= 0) return false;
    failures.set(operation, remaining - 1);
    return true;
  };

  const summarize = (conversation: BackendConversation) => ({
    id: conversation.id,
    title: conversation.title,
    targetId: conversation.targetId,
    flowId: conversation.targetId,
    preview: null,
    messageCount: conversation.messages.length,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  });

  const fetchImpl = async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : undefined;
    requests.push({ url, method, ...(body ? { body } : {}) });
    const path = new URL(url).pathname;
    const query = new URL(url).searchParams;

    if (path === '/v1/client/init') {
      const resumeId = body?.conversationId as string | undefined;
      if (resumeId && shouldFail('prepareOpen')) {
        return respond(500, { error: 'init failed' });
      }
      if (!resumeId && !body?.sessionId && shouldFail('prepareStartNew')) {
        return respond(500, { error: 'init failed' });
      }
      let conversationId: string;
      if (resumeId) {
        if (!conversations.has(resumeId)) {
          return respond(404, { error: 'not_found' });
        }
        conversationId = resumeId;
      } else if (body?.sessionId && sessions.has(String(body.sessionId))) {
        conversationId = sessions.get(String(body.sessionId))!;
      } else {
        convSeq += 1;
        conversationId = `conv-new-${convSeq}`;
        const created = new Date().toISOString();
        conversations.set(conversationId, {
          id: conversationId,
          title: 'New conversation',
          targetId: 'flow_1',
          createdAt: created,
          updatedAt: created,
          revision: nextRevision(),
          messages: [],
        });
      }
      sessionSeq += 1;
      const sessionId = `sess-${sessionSeq}`;
      sessions.set(sessionId, conversationId);
      return respond(200, {
        sessionId,
        expiresAt: futureIso(),
        flow: { id: 'flow_1', name: 'Flow', description: null },
        conversationId,
        targetId: 'flow_1',
        conversationRevision: conversations.get(conversationId)!.revision,
        config: { welcomeMessage: WELCOME, placeholder: 'Ask…', theme: null },
      });
    }

    if (path === '/v1/client/chat') {
      const next = chatQueue.shift();
      if (next) return next();
      return sseOk('data: {"type":"status","status":"idle","terminal":true}\n\n');
    }

    if (path === '/v1/client/visitor/reset') {
      return respond(200, { reset: true });
    }

    if (path === '/v1/client/conversations' && method === 'GET') {
      if (shouldFail('list')) return respond(500, { error: 'list failed' });
      const targetId = query.get('targetId');
      const rows = [...conversations.values()]
        .filter((conversation) => conversation.messages.length > 0)
        .filter(
          (conversation) => !targetId || conversation.targetId === targetId
        );
      return respond(200, { data: rows.map(summarize), nextCursor: null });
    }

    if (path === '/v1/client/conversations' && method === 'DELETE') {
      if (shouldFail('deleteAll')) return respond(500, { error: 'delete failed' });
      const targetId = query.get('targetId');
      let deleted = 0;
      for (const conversation of [...conversations.values()]) {
        if (targetId && conversation.targetId !== targetId) continue;
        conversations.delete(conversation.id);
        deleted += 1;
      }
      return respond(200, { deleted });
    }

    const detailMatch = /^\/v1\/client\/conversations\/([^/]+)$/.exec(path);
    if (detailMatch) {
      const conversation = conversations.get(decodeURIComponent(detailMatch[1]));
      if (method === 'DELETE') {
        if (shouldFail('delete')) return respond(500, { error: 'delete failed' });
        if (!conversation) return respond(404, { error: 'not_found' });
        conversations.delete(conversation.id);
        return respond(200, { deleted: 1 });
      }
      if (shouldFail('getPage')) return respond(500, { error: 'detail failed' });
      if (!conversation) return respond(404, { error: 'not_found' });
      const cursor = query.get('messageCursor');
      const end = cursor ? Number(cursor) : conversation.messages.length;
      const start = Math.max(0, end - PAGE_SIZE);
      return respond(200, {
        conversation: summarize(conversation),
        messages: conversation.messages.slice(start, end),
        nextMessageCursor: start > 0 ? String(start) : null,
        conversationRevision: conversation.revision,
      });
    }

    const projectionMatch =
      /^\/v1\/client\/conversations\/([^/]+)\/display-projections$/.exec(path);
    if (projectionMatch) {
      const conversation = conversations.get(
        decodeURIComponent(projectionMatch[1])
      );
      if (!conversation) return respond(404, { error: 'not_found' });
      const batch = (body?.messages ?? []) as Array<{
        id: string;
        displayContent: string;
      }>;
      for (const item of batch) {
        const stored = conversation.messages.find((row) => row.id === item.id);
        if (stored) stored.displayContent = item.displayContent;
      }
      conversation.revision = nextRevision();
      return respond(200, { conversationRevision: conversation.revision });
    }

    return respond(404, { error: 'unhandled' });
  };

  return {
    conversations,
    requests,
    fetchImpl,
    failNext(operation: FailableOperation, times = 1) {
      failures.set(operation, (failures.get(operation) ?? 0) + times);
    },
    queueChat(responder: () => unknown) {
      chatQueue.push(responder);
    },
    appendMessage(conversationId: string, message: BackendConversation['messages'][number]) {
      const conversation = conversations.get(conversationId);
      if (!conversation) throw new Error(`unknown conversation ${conversationId}`);
      conversation.messages.push(message);
      conversation.revision = nextRevision();
      conversation.updatedAt = message.timestamp;
    },
    revisionOf(conversationId: string) {
      return conversations.get(conversationId)?.revision ?? null;
    },
    chatRequests(): ClientChatRequest[] {
      return requests
        .filter((request) => request.url.includes('/v1/client/chat'))
        .map((request) => request.body as unknown as ClientChatRequest);
    },
  };
}

type Backend = ReturnType<typeof createRuntypeBackend>;

// ── Harness ───────────────────────────────────────────────────────────────

type Harness = {
  session: AgentWidgetSession;
  provider: HistoryProvider;
  messages: () => AgentWidgetMessage[];
  renderCount: () => number;
  notices: SessionHistoryNotice[];
  states: SessionHistoryState[];
  meta: Record<string, unknown>;
  failNext: (operation: FailableOperation) => void;
  backend: Backend | null;
  store: VisitorStore | null;
  /** The RAW internals bag; re-composing an already-composed one double-wraps. */
  rawInternals: WidgetHistoryInternals;
  destroy: () => void;
};

function createMetadataSeam() {
  const meta: Record<string, unknown> = {};
  const read = (key: string): string | null =>
    typeof meta[key] === 'string' ? (meta[key] as string) : null;
  const write = (key: string, value: string | null) => {
    if (value === null) delete meta[key];
    else meta[key] = value;
  };
  return {
    meta,
    config: {
      getStoredSessionId: () => read('sessionId'),
      setStoredSessionId: (value: string) => write('sessionId', value),
      clearStoredSessionId: () => write('sessionId', null),
      getStoredConversationId: () => read('conversationId'),
      setStoredConversationId: (value: string) => write('conversationId', value),
      clearStoredConversationId: () => write('conversationId', null),
    },
    internals: {
      getStoredConversationRevision: () => read('conversationRevision'),
      setStoredConversationRevision: (value: string | null) =>
        write('conversationRevision', value),
      getStoredMessageCursor: () => read('messageCursor'),
      setStoredMessageCursor: (value: string | null) =>
        write('messageCursor', value),
      getPendingDisplayProjections: () =>
        (meta.pendingProjections as PendingDisplayProjections | undefined) ?? null,
      setPendingDisplayProjections: (pending: PendingDisplayProjections | null) => {
        if (pending === null) delete meta.pendingProjections;
        else meta.pendingProjections = pending;
      },
    } satisfies WidgetHistoryInternals,
  };
}

function createSessionShell(
  config: Record<string, unknown>,
  internals: WidgetHistoryInternals
) {
  let messages: AgentWidgetMessage[] = [];
  let renders = 0;
  const notices: SessionHistoryNotice[] = [];
  const states: SessionHistoryState[] = [];
  const session = new AgentWidgetSession(
    config,
    {
      onMessagesChanged: (next) => {
        messages = next;
        renders += 1;
      },
      onStatusChanged: () => {},
      onStreamingChanged: () => {},
      onHistoryStateChanged: (state) => states.push(state),
      onHistoryNotice: (notice) => notices.push(notice),
    },
    internals
  );
  return {
    session,
    messages: () => messages,
    renderCount: () => renders,
    notices,
    states,
  };
}

async function createRuntypeHarness(): Promise<Harness> {
  const backend = createRuntypeBackend();
  vi.stubGlobal('fetch', vi.fn(backend.fetchImpl));
  const store: VisitorStore = createVisitorStore(CLIENT_TOKEN, 'persona-', false);
  await store.set('cvt_session_history');

  const seam = createMetadataSeam();
  const internals: WidgetHistoryInternals = {
    ...seam.internals,
    visitorStore: store,
  };
  const shell = createSessionShell(
    {
      clientToken: CLIENT_TOKEN,
      apiUrl: API_URL,
      features: { history: { enabled: true, scope: 'browser' } },
      ...seam.config,
    },
    internals
  );

  const provider = createRuntypeHistoryProvider({
    client: shell.session.getClient(),
    getIdentityProofConfigured: () => false,
    onActivationCommitted: (clientSession) =>
      shell.session.bindActivatedSession(clientSession),
    getClient: () => shell.session.getClient(),
  });
  const rawInternals: WidgetHistoryInternals = {
    ...internals,
    historyProvider: provider,
  };
  shell.session.setHistoryInternals(rawInternals);

  return {
    ...shell,
    provider,
    meta: seam.meta,
    backend,
    store,
    rawInternals,
    failNext: (operation) => backend.failNext(operation),
    destroy: () => {
      store.destroy();
      vi.unstubAllGlobals();
    },
  };
}

async function createDemoHarness(): Promise<Harness> {
  const provider = createDemoHistoryProvider({
    pageSize: PAGE_SIZE,
    conversations: SEEDS.map((seed) => ({
      id: seed.id,
      title: seed.title,
      targetId: seed.targetId,
      createdAt: seed.messages[0].createdAt,
      updatedAt: seed.messages[seed.messages.length - 1].createdAt,
      messages: seed.messages.map((message) => ({
        id: message.id,
        role: message.role,
        // The demo provider has no model channel: content IS the projection.
        content: message.display,
        createdAt: message.createdAt,
      })),
    })),
  });

  const seam = createMetadataSeam();
  const internals: WidgetHistoryInternals = {
    ...seam.internals,
    historyProvider: provider,
  };
  const shell = createSessionShell({ apiUrl: API_URL, ...seam.config }, internals);

  return {
    ...shell,
    provider,
    meta: seam.meta,
    backend: null,
    store: null,
    rawInternals: internals,
    failNext: (operation) =>
      provider.failNext(operation, { code: 'unavailable' }),
    destroy: () => {},
  };
}

const VARIANTS: Array<[string, () => Promise<Harness>]> = [
  ['runtype provider', createRuntypeHarness],
  ['demo provider', createDemoHarness],
];

describe.each(VARIANTS)('session history core scenarios (%s)', (_name, build) => {
  let harness: Harness;

  beforeEach(async () => {
    window.localStorage.clear();
    harness = await build();
  });

  afterEach(() => {
    harness.destroy();
    vi.restoreAllMocks();
  });

  it('hydrates the newest page oldest-first and records the active record', async () => {
    const result = await harness.session.openConversation('conv-b');

    expect(harness.messages().map((message) => message.id)).toEqual(['b4', 'b5']);
    expect(result.summary.id).toBe('conv-b');
    expect(result.nextMessageCursor).toBeTruthy();
    expect(harness.session.getActiveConversationId()).toBe('conv-b');
    expect(harness.meta.conversationId).toBe('conv-b');
    expect(harness.meta.conversationRevision).toBeTruthy();
    expect(harness.session.getHistoryState().nextMessageCursor).toBe(
      result.nextMessageCursor
    );
  });

  it('keeps the display projection separate from the model channel on reopen', async () => {
    await harness.session.openConversation('conv-a');

    const [first] = harness.messages();
    expect(first.content).toBe('Where is my order?');
    expect(first.content).not.toContain('intent');
    expect(first.llmContent).toBeUndefined();
    expect(first.rawContent).toBeUndefined();
  });

  it('never injects the welcome message when reopening a conversation', async () => {
    await harness.session.openConversation('conv-a');

    expect(
      harness.messages().some((message) => message.content === WELCOME)
    ).toBe(false);
    expect(harness.messages()).toHaveLength(2);
  });

  it('refuses to switch conversations while a turn is streaming', async () => {
    harness.session.injectTestEvent({ type: 'status', status: 'connecting' });
    expect(harness.session.isStreaming()).toBe(true);

    const error = await harness.session
      .openConversation('conv-a')
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SessionHistoryError);
    expect((error as SessionHistoryError).code).toBe('conversation_busy');
    expect(harness.messages()).toHaveLength(0);

    harness.session.cancel();
  });

  it('lets the later selection win and discards the superseded one', async () => {
    const first = harness.session
      .openConversation('conv-a')
      .catch((error: unknown) => error);
    const second = await harness.session.openConversation('conv-b');
    const firstResult = await first;

    expect(second.summary.id).toBe('conv-b');
    expect(firstResult).toBeInstanceOf(SessionHistoryError);
    expect((firstResult as SessionHistoryError).code).toBe('superseded');
    expect(harness.session.getActiveConversationId()).toBe('conv-b');
    expect(harness.messages().map((message) => message.id)).toEqual(['b4', 'b5']);
  });

  it('prepends one older page with a single repaint and dedupes concurrent clicks', async () => {
    const opened = await harness.session.openConversation('conv-b');
    const before = harness.renderCount();

    const cursor = opened.nextMessageCursor as string;
    const [a, b] = await Promise.all([
      harness.session.loadOlderMessages('conv-b', cursor),
      harness.session.loadOlderMessages('conv-b', cursor),
    ]);

    expect(a).toBe(b);
    expect(harness.renderCount()).toBe(before + 1);
    expect(harness.messages().map((message) => message.id)).toEqual([
      'b2',
      'b3',
      'b4',
      'b5',
    ]);
    expect(harness.session.getHistoryState().nextMessageCursor).toBeTruthy();
  });

  it('leaves the current conversation intact when starting a new one fails', async () => {
    await harness.session.openConversation('conv-a');
    const before = harness.messages().map((message) => message.id);
    harness.failNext('prepareStartNew');

    await expect(harness.session.startNewConversation()).rejects.toBeTruthy();

    expect(harness.messages().map((message) => message.id)).toEqual(before);
    expect(harness.session.getActiveConversationId()).toBe('conv-a');
    expect(harness.meta.conversationId).toBe('conv-a');
  });

  it('clears local state and commits the replacement on a successful new conversation', async () => {
    await harness.session.openConversation('conv-a');

    await harness.session.startNewConversation();

    expect(
      harness.messages().filter((message) => message.content !== WELCOME)
    ).toHaveLength(0);
    expect(harness.session.getActiveConversationId()).not.toBe('conv-a');
    expect(harness.session.getHistoryState().nextMessageCursor).toBeNull();
    expect(harness.meta.messageCursor).toBeUndefined();
  });

  it('is non-disruptive when deleting an inactive conversation', async () => {
    await harness.session.openConversation('conv-a');
    const activeBefore = harness.session.getActiveConversationId();

    await harness.session.deleteConversation('conv-b');

    expect(harness.session.getActiveConversationId()).toBe(activeBefore);
    expect(harness.messages().map((message) => message.id)).toEqual(['a1', 'a2']);
    expect(harness.session.getHistoryState().sendBlocked).toBe(false);
  });

  it('destroys the transcript and prepares a replacement after deleting the active record', async () => {
    await harness.session.openConversation('conv-a');

    await harness.session.deleteConversation('conv-a');

    expect(
      harness.messages().filter((message) => message.content !== WELCOME)
    ).toHaveLength(0);
    expect(harness.session.getActiveConversationId()).not.toBe('conv-a');
    expect(harness.session.getHistoryState().recovery).toBeNull();
    expect(harness.session.getHistoryState().sendBlocked).toBe(false);
    // Never resurrected, even as a fallback.
    await expect(harness.session.openConversation('conv-a')).rejects.toBeTruthy();
  });

  it('enters new_conversation_required when the replacement cannot be prepared', async () => {
    await harness.session.openConversation('conv-a');
    harness.failNext('prepareStartNew');

    await harness.session.deleteConversation('conv-a');

    const state = harness.session.getHistoryState();
    expect(state.recovery).toBe('new_conversation_required');
    expect(state.sendBlocked).toBe(true);
    expect(harness.messages()).toHaveLength(0);
    expect(
      harness.notices.some(
        (notice) => notice.code === 'new_conversation_required'
      )
    ).toBe(true);

    // The next explicit action retries fresh initialization.
    await harness.session.startNewConversation();
    expect(harness.session.getHistoryState().recovery).toBeNull();
    expect(harness.session.getHistoryState().sendBlocked).toBe(false);
  });

  it('destroys the active transcript after delete-all', async () => {
    await harness.session.openConversation('conv-a');

    const result = await harness.session.clearConversationHistory({
      targetId: 'flow_1',
    });

    expect(result.deleted).toBeGreaterThan(0);
    expect(
      harness.messages().filter((message) => message.content !== WELCOME)
    ).toHaveLength(0);
    expect(harness.session.getActiveConversationId()).not.toBe('conv-a');
  });

  it('lists conversations through the seam with the active target filter', async () => {
    const page = await harness.session.listConversations({ targetId: 'flow_1' });
    expect(page.items.map((item) => item.id)).toEqual(
      expect.arrayContaining(['conv-a', 'conv-b'])
    );
  });
});

// ── Runtype-specific behavior ─────────────────────────────────────────────

describe('session history (Runtype transport specifics)', () => {
  let harness: Harness;
  let backend: Backend;

  beforeEach(async () => {
    window.localStorage.clear();
    harness = await createRuntypeHarness();
    backend = harness.backend as Backend;
  });

  afterEach(() => {
    harness.destroy();
    vi.restoreAllMocks();
  });

  it('allows the welcome message after startNewConversation clears the transcript', async () => {
    await harness.session.openConversation('conv-a');
    expect(harness.messages().some((m) => m.content === WELCOME)).toBe(false);

    await harness.session.startNewConversation();

    expect(harness.messages().map((m) => m.content)).toEqual([WELCOME]);
  });

  it('bypasses the client session cache when preparing an open', async () => {
    // Prime a live ordinary session first.
    await harness.session.listConversations();
    const before = backend.requests.filter((r) =>
      r.url.endsWith('/v1/client/init')
    ).length;

    await harness.session.openConversation('conv-a');

    const initCalls = backend.requests.filter((r) =>
      r.url.endsWith('/v1/client/init')
    );
    expect(initCalls.length).toBe(before + 1);
    const forced = initCalls[initCalls.length - 1];
    expect(forced.body?.conversationId).toBe('conv-a');
    // Strict union: a resume never carries the stored session id.
    expect(forced.body?.sessionId).toBeUndefined();
  });

  it('sends the user turn display projection inline where it diverges', async () => {
    await harness.session.startNewConversation();
    harness.session.injectMessage({
      role: 'user',
      content: 'Show me the receipt',
      llmContent: '{"tool":"receipt"}',
      id: 'usr_projection',
    });

    await harness.session.continueConversation();

    const chat = backend.chatRequests().at(-1);
    const sent = chat?.messages.find((message) => message.id === 'usr_projection');
    expect(sent?.content).toBe('{"tool":"receipt"}');
    expect(sent?.displayContent).toBe('Show me the receipt');
  });

  describe('safe 410 recovery', () => {
    it('retries once with only the just-submitted user turn', async () => {
      await harness.session.openConversation('conv-a');
      backend.queueChat(() => respond(410, { error: 'conversation_deleted' }));

      await harness.session.sendMessage('please try again');

      const chats = backend.chatRequests();
      expect(chats).toHaveLength(2);
      const [first, replacement] = chats;
      expect(first.messages.length).toBeGreaterThan(1);
      expect(replacement.messages).toHaveLength(1);
      expect(replacement.messages[0].content).toBe('please try again');
      // No prior message id or content is re-sent into the fresh record. Ids
      // compare as whole values: a fresh random id can contain "a1"/"a2" as a
      // substring (usr_..._iva26z7k), which made a serialized check flaky.
      const sentIds = replacement.messages.map((message) => message.id);
      for (const id of ['a1', 'a2']) expect(sentIds).not.toContain(id);
      const serialized = JSON.stringify(replacement);
      expect(serialized).not.toContain('Where is my order?');
      expect(serialized).not.toContain('It ships Thursday.');
      expect(replacement.sessionId).not.toBe(first.sessionId);

      expect(
        harness.notices.some(
          (notice) => notice.code === 'conversation_deleted_recovered'
        )
      ).toBe(true);
      expect(harness.messages().map((m) => m.content)).toContain(
        'please try again'
      );
    });

    it('surfaces a second 410 instead of looping', async () => {
      await harness.session.openConversation('conv-a');
      const errors: Error[] = [];
      backend.queueChat(() => respond(410, { error: 'conversation_deleted' }));
      backend.queueChat(() => respond(410, { error: 'conversation_deleted' }));

      const shell = harness.session as unknown as {
        callbacks: { onError?: (error: Error) => void };
      };
      shell.callbacks.onError = (error) => errors.push(error);

      await harness.session.sendMessage('still deleted');

      expect(backend.chatRequests()).toHaveLength(2);
      expect(errors.some((error) => /deleted/i.test(error.message))).toBe(true);
    });
  });

  describe('authoritative boot reconciliation', () => {
    /** Restored transcript + persisted metadata, then the real boot init. */
    const bootWith = async (
      conversationId: string,
      persistedRevision?: string | null
    ) => {
      const conversation = backend.conversations.get(conversationId)!;
      harness.session.hydrateMessages(
        conversation.messages.map((message) => ({
          id: message.id,
          role: message.role as AgentWidgetMessage['role'],
          content: message.displayContent ?? message.content ?? '',
          createdAt: message.timestamp,
        }))
      );
      harness.meta.conversationId = conversationId;
      if (persistedRevision === null) delete harness.meta.conversationRevision;
      else if (persistedRevision !== undefined) {
        harness.meta.conversationRevision = persistedRevision;
      }
      return harness.session.initClientSession();
    };

    it('skips the detail fetch when the init revision matches the persisted one', async () => {
      await bootWith('conv-a', backend.revisionOf('conv-a'));
      const before = backend.requests.length;

      await harness.session.reconcileBootConversation();

      const detailCalls = backend.requests
        .slice(before)
        .filter((request) => /conversations\/conv-a(\?|$)/.test(request.url));
      expect(detailCalls).toHaveLength(0);
    });

    it('merges the newest page with the server projection winning on overlap', async () => {
      // Stale local transcript from the last page load.
      harness.session.hydrateMessages([
        { id: 'a1', role: 'user', content: 'Where is my order?', createdAt: T(0) },
        {
          id: 'a2',
          role: 'assistant',
          content: 'It ships Thursday.',
          createdAt: T(1),
        },
      ]);
      // The server refreshed a2's projection and appended a remote turn.
      const conversation = backend.conversations.get('conv-a')!;
      conversation.messages[1].displayContent = 'It ships Friday.';
      backend.appendMessage('conv-a', {
        id: 'a3',
        role: 'assistant',
        content: 'Added from another device.',
        displayAvailable: true,
        timestamp: T(2),
      });
      harness.meta.conversationId = 'conv-a';
      harness.meta.conversationRevision = 'rev-stale';
      await harness.session.initClientSession();

      await harness.session.reconcileBootConversation();

      const messages = harness.messages();
      expect(messages.map((message) => message.id)).toEqual(['a1', 'a2', 'a3']);
      // Older than the returned page: the local row survives untouched.
      expect(messages[0].content).toBe('Where is my order?');
      expect(messages[1].content).toBe('It ships Friday.');
      expect(messages[2].content).toBe('Added from another device.');
      expect(harness.meta.conversationRevision).toBe(backend.revisionOf('conv-a'));
    });

    it('replaces the transcript and keeps the cursor when nothing overlaps', async () => {
      harness.session.hydrateMessages([
        {
          id: 'local-only',
          role: 'user',
          content: 'from an unrelated record',
          createdAt: T(30),
        },
      ]);
      harness.meta.conversationId = 'conv-b';
      await harness.session.initClientSession();

      await harness.session.reconcileBootConversation();

      expect(harness.messages().map((message) => message.id)).toEqual([
        'b4',
        'b5',
      ]);
      expect(harness.session.getHistoryState().nextMessageCursor).toBeTruthy();
      expect(harness.meta.messageCursor).toBeTruthy();
    });

    it('blocks sending until reconciliation completes', async () => {
      await bootWith('conv-b', 'rev-stale');

      const reconcile = harness.session.reconcileBootConversation();
      expect(harness.session.getHistoryState().sendBlocked).toBe(true);
      await reconcile;
      expect(harness.session.getHistoryState().sendBlocked).toBe(false);
    });

    it('clears the persisted revision after a local mutation that returns none', async () => {
      await harness.session.openConversation('conv-a');
      expect(harness.meta.conversationRevision).toBeTruthy();

      await harness.session.sendMessage('a local mutation');

      expect(harness.meta.conversationRevision).toBeUndefined();
    });
  });

  describe('display-projection finalization', () => {
    const projectionCalls = () =>
      backend.requests.filter((request) =>
        request.url.includes('/display-projections')
      );

    /** A postprocessed assistant turn: display diverges from stored model text. */
    const streamDivergentAssistant = (id = 'ast_final') => {
      harness.session.injectTestEvent({
        type: 'message',
        message: {
          id,
          role: 'assistant',
          content: 'Rendered summary for the visitor',
          llmContent: '{"total":42}',
          createdAt: T(20),
        },
      });
      harness.session.injectTestEvent({
        type: 'status',
        status: 'idle',
        terminal: true,
      });
    };

    it('enqueues only the messages whose browser-final projection diverges', async () => {
      await harness.session.openConversation('conv-a');
      streamDivergentAssistant();
      await harness.session.awaitHistorySettled();

      const calls = projectionCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].body?.messages).toEqual([
        { id: 'ast_final', displayContent: 'Rendered summary for the visitor' },
      ]);

      // Replaying the same terminal state is a no-op once acknowledged.
      harness.session.injectTestEvent({
        type: 'status',
        status: 'idle',
        terminal: true,
      });
      await harness.session.awaitHistorySettled();
      expect(projectionCalls()).toHaveLength(1);
    });

    it('collapses duplicate terminal scans queued before the first PATCH resolves', async () => {
      await harness.session.openConversation('conv-a');
      streamDivergentAssistant();
      // Second terminal before the first PATCH acknowledges: both scans see the
      // projection unacknowledged and chain identical batches.
      harness.session.injectTestEvent({
        type: 'status',
        status: 'idle',
        terminal: true,
      });
      await harness.session.awaitHistorySettled();

      expect(projectionCalls()).toHaveLength(1);
      expect(harness.meta.pendingProjections).toBeUndefined();
    });

    it('serializes finalization against the next conversation switch', async () => {
      await harness.session.openConversation('conv-a');
      streamDivergentAssistant();

      await harness.session.openConversation('conv-b');

      // The switch waited for the in-flight finalization before committing.
      expect(projectionCalls()).toHaveLength(1);
      expect(harness.meta.pendingProjections).toBeUndefined();
      expect(harness.session.getActiveConversationId()).toBe('conv-b');
    });

    it('persists a pending marker and replays it on boot', async () => {
      await harness.session.openConversation('conv-a');
      // Fail both the initial attempt and its one retry.
      harness.session.injectTestEvent({
        type: 'message',
        message: {
          id: 'ast_pending',
          role: 'assistant',
          content: 'Visible copy',
          llmContent: '{"raw":true}',
          createdAt: T(21),
        },
      });
      const failing = vi
        .spyOn(harness.session.getClient(), 'finalizeDisplayProjections')
        .mockRejectedValue(new Error('network down'));
      harness.session.injectTestEvent({
        type: 'status',
        status: 'idle',
        terminal: true,
      });
      await harness.session.awaitHistorySettled();

      expect(failing).toHaveBeenCalledTimes(2); // one transient retry, then stop
      expect(harness.meta.pendingProjections).toEqual({
        conversationId: 'conv-a',
        messageIds: ['ast_pending'],
      });
      expect(
        harness.notices.some(
          (notice) => notice.code === 'projection_finalization_failed'
        )
      ).toBe(true);

      failing.mockRestore();
      await harness.session.replayPendingProjections();

      expect(projectionCalls().at(-1)?.body?.messages).toEqual([
        { id: 'ast_pending', displayContent: 'Visible copy' },
      ]);
      expect(harness.meta.pendingProjections).toBeUndefined();
    });

    it('serializes finalization ahead of the next dispatch', async () => {
      await harness.session.openConversation('conv-a');
      streamDivergentAssistant();

      await harness.session.sendMessage('next turn');

      const order = backend.requests.map((request) => request.url);
      const projectionIndex = order.findIndex((url) =>
        url.includes('/display-projections')
      );
      const chatIndex = order.lastIndexOf(`${API_URL}/v1/client/chat`);
      expect(projectionIndex).toBeGreaterThan(-1);
      expect(projectionIndex).toBeLessThan(chatIndex);
    });

    it('invalidates a pending marker when the active record is deleted', async () => {
      await harness.session.openConversation('conv-a');
      harness.meta.pendingProjections = {
        conversationId: 'conv-a',
        messageIds: ['a2'],
      };

      await harness.session.deleteConversation('conv-a');

      expect(harness.meta.pendingProjections).toBeUndefined();
    });

    it('drops a stale marker when the active conversation changed', async () => {
      await harness.session.openConversation('conv-a');
      harness.meta.pendingProjections = {
        conversationId: 'conv-zombie',
        messageIds: ['ghost'],
      };

      await harness.session.replayPendingProjections();

      expect(harness.meta.pendingProjections).toBeUndefined();
      expect(projectionCalls()).toHaveLength(0);
    });

    it('invalidates pending projections on device reset', async () => {
      await harness.session.openConversation('conv-a');
      harness.meta.pendingProjections = {
        conversationId: 'conv-a',
        messageIds: ['a2'],
      };

      const result = await harness.session.resetHistoryDevice();

      expect(result.remoteRevocationConfirmed).toBe(true);
      expect(harness.meta.pendingProjections).toBeUndefined();
      expect(harness.session.getActiveConversationId()).toBeNull();
      expect(harness.messages()).toHaveLength(0);
    });
  });

  describe('continuity wipe', () => {
    it('destroys local state and blocks dispatch until cleanup completes', async () => {
      await harness.session.openConversation('conv-a');
      harness.meta.pendingProjections = {
        conversationId: 'conv-a',
        messageIds: ['a2'],
      };

      // The client announces the transition through the internals bag.
      const internals = (
        harness.session as unknown as {
          historyInternals: WidgetHistoryInternals;
        }
      ).historyInternals;
      internals.onHistoryContinuityChanged?.({
        previousConversationId: 'conv-a',
        conversationId: 'conv-replacement',
      });

      expect(harness.messages()).toHaveLength(0);
      expect(harness.session.getHistoryState().sendBlocked).toBe(true);
      expect(harness.session.getActiveConversationId()).toBe('conv-replacement');
      expect(harness.meta.conversationId).toBeUndefined();
      expect(harness.meta.conversationRevision).toBeUndefined();
      expect(harness.meta.pendingProjections).toBeUndefined();
      expect(
        harness.notices.some(
          (notice) => notice.code === 'history_continuity_reset'
        )
      ).toBe(true);

      await harness.session.awaitHistorySettled();
      expect(harness.session.getHistoryState().sendBlocked).toBe(false);
    });

    it('holds a dispatch until the wipe finishes, then sends only the new turn', async () => {
      await harness.session.openConversation('conv-a');
      const before = backend.chatRequests().length;
      const internals = (
        harness.session as unknown as {
          historyInternals: WidgetHistoryInternals;
        }
      ).historyInternals;
      internals.onHistoryContinuityChanged?.({
        previousConversationId: 'conv-a',
        conversationId: 'conv-replacement',
      });

      const send = harness.session.sendMessage('after the wipe');
      expect(backend.chatRequests()).toHaveLength(before);
      await send;

      const chats = backend.chatRequests();
      expect(chats).toHaveLength(before + 1);
      expect(chats[chats.length - 1].messages).toHaveLength(1);
      expect(chats[chats.length - 1].messages[0].content).toBe('after the wipe');
      expect(harness.session.getHistoryState().sendBlocked).toBe(false);
    });
  });
});

// ── External visitor-credential change (D3 privacy boundary) ──────────────

const OTHER_CLIENT_TOKEN = 'ct_session_history_sibling';

/** Store wrapper that counts how often the session binds/releases it. */
function countingStore(base: VisitorStore) {
  const counts = { subscribes: 0, unsubscribes: 0 };
  const store: VisitorStore = {
    ...base,
    subscribe(callback) {
      counts.subscribes += 1;
      const off = base.subscribe(callback);
      return () => {
        counts.unsubscribes += 1;
        off();
      };
    },
  };
  return { store, counts };
}

describe('external visitor-credential change', () => {
  let harness: Harness;
  let backend: Backend;
  let store: VisitorStore;

  /** What a sibling tab's write looks like here: jsdom fires no storage event. */
  const externalWrite = async (
    value: string | null,
    clientToken = CLIENT_TOKEN
  ) => {
    const { storageKey } = await visitorStoreKeys(clientToken, 'persona-');
    if (value === null) window.localStorage.removeItem(storageKey);
    else window.localStorage.setItem(storageKey, value);
    window.dispatchEvent(
      new StorageEvent('storage', { key: storageKey, newValue: value })
    );
    await Promise.resolve();
  };

  const initBodies = () =>
    backend.requests
      .filter((request) => request.url.endsWith('/v1/client/init'))
      .map((request) => request.body ?? {});

  beforeEach(async () => {
    window.localStorage.clear();
    harness = await createRuntypeHarness();
    backend = harness.backend as Backend;
    store = harness.store as VisitorStore;
    await store.ready;
  });

  afterEach(() => {
    harness.destroy();
    vi.restoreAllMocks();
  });

  it('wipes local state, drops the cached session, and blocks the next dispatch on a re-init', async () => {
    await harness.session.openConversation('conv-a');
    harness.meta.pendingProjections = {
      conversationId: 'conv-a',
      messageIds: ['a2'],
    };
    const staleSessionId = harness.session.getClientSession()?.sessionId;
    expect(staleSessionId).toBeTruthy();
    expect(harness.messages()).toHaveLength(2);

    await externalWrite(null);

    expect(harness.messages()).toHaveLength(0);
    expect(harness.session.getActiveConversationId()).toBeNull();
    expect(harness.meta.conversationId).toBeUndefined();
    expect(harness.meta.sessionId).toBeUndefined();
    expect(harness.meta.conversationRevision).toBeUndefined();
    expect(harness.meta.pendingProjections).toBeUndefined();
    // No dispatch can reuse the session minted under the revoked credential.
    expect(harness.session.getClient().getClientSession()).toBeNull();
    expect(
      harness.notices.some((notice) => notice.code === 'history_continuity_reset')
    ).toBe(true);

    const initsBefore = initBodies().length;
    await harness.session.sendMessage('after the reset');

    expect(initBodies().length).toBeGreaterThan(initsBefore);
    const chat = backend.chatRequests().at(-1);
    expect(chat?.sessionId).not.toBe(staleSessionId);
    expect(
      chat?.messages.some((message) => message.content === 'after the reset')
    ).toBe(true);
    // The wiped transcript never leaks into the replacement conversation.
    expect(JSON.stringify(chat?.messages)).not.toContain('Where is my order?');
  });

  it('re-inits before the chat request rather than after it', async () => {
    await harness.session.openConversation('conv-a');
    await externalWrite(null);

    await harness.session.sendMessage('after the reset');

    const order = backend.requests.map((request) => request.url);
    const chatIndex = order.lastIndexOf(`${API_URL}/v1/client/chat`);
    const initIndex = order.lastIndexOf(`${API_URL}/v1/client/init`);
    expect(initIndex).toBeGreaterThan(-1);
    expect(initIndex).toBeLessThan(chatIndex);
  });

  it('adopts the sibling token when the credential is replaced', async () => {
    await harness.session.listConversations();

    await externalWrite('cvt_sibling');
    await harness.session.sendMessage('hello again');

    expect(initBodies().at(-1)?.visitorToken).toBe('cvt_sibling');
  });

  it('ignores this tab own mint or write', async () => {
    await harness.session.openConversation('conv-a');
    const live = harness.session.getClientSession();
    const renders = harness.renderCount();

    await store.set('cvt_local_mint');

    expect(harness.messages().map((message) => message.id)).toEqual(['a1', 'a2']);
    expect(harness.renderCount()).toBe(renders);
    expect(harness.session.getClientSession()).toBe(live);
    expect(harness.session.getActiveConversationId()).toBe('conv-a');
    expect(harness.session.getClient().getClientSession()).not.toBeNull();
  });

  it('ignores adoption out of an empty store (first-init convergence)', async () => {
    // No credential yet: the sibling's mint is convergence, not a break.
    await store.clear();
    await harness.session.sendMessage('first turn');
    const live = harness.session.getClient().getClientSession();
    const before = harness.messages().length;
    expect(before).toBeGreaterThan(0);

    await externalWrite('cvt_winner');

    expect(harness.messages()).toHaveLength(before);
    expect(harness.session.getClient().getClientSession()).toBe(live);
    expect(harness.meta.sessionId).toBeTruthy();
  });

  it('reconciles a tab with no conversation without a visible wipe', async () => {
    await harness.session.listConversations();
    expect(harness.session.getClient().getClientSession()).not.toBeNull();

    await externalWrite(null);

    expect(harness.messages()).toHaveLength(0);
    expect(
      harness.notices.some((notice) => notice.code === 'history_continuity_reset')
    ).toBe(false);
    // The cache and the revoked visitor's ids still go.
    expect(harness.session.getClient().getClientSession()).toBeNull();
    expect(harness.meta.sessionId).toBeUndefined();
    expect(harness.meta.conversationId).toBeUndefined();
  });

  it('keeps exactly one subscription across a re-key and releases it on destroy', async () => {
    const first = countingStore(store);
    harness.session.setHistoryInternals({
      ...harness.rawInternals,
      visitorStore: first.store,
    });
    // Re-threading the same store must not bind a second subscription.
    harness.session.setHistoryInternals({
      ...harness.rawInternals,
      visitorStore: first.store,
    });
    expect(first.counts.subscribes).toBe(1);
    expect(first.counts.unsubscribes).toBe(0);

    const replacement = countingStore(
      createVisitorStore(OTHER_CLIENT_TOKEN, 'persona-', false)
    );
    await replacement.store.set('cvt_other');
    harness.session.setHistoryInternals({
      ...harness.rawInternals,
      visitorStore: replacement.store,
    });
    expect(first.counts.unsubscribes).toBe(1);
    expect(replacement.counts.subscribes).toBe(1);

    await harness.session.openConversation('conv-a');

    // The detached store no longer reaches the session.
    await externalWrite(null);
    expect(harness.messages()).toHaveLength(2);
    expect(harness.notices).toHaveLength(0);

    // The current one does, exactly once.
    await externalWrite(null, OTHER_CLIENT_TOKEN);
    expect(harness.messages()).toHaveLength(0);
    expect(
      harness.notices.filter(
        (notice) => notice.code === 'history_continuity_reset'
      )
    ).toHaveLength(1);

    harness.session.destroy();
    expect(replacement.counts.unsubscribes).toBe(1);
    replacement.store.destroy();
  });
});
