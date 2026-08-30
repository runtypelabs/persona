// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { AgentWidgetClient, HistoryClientError } from './client';
import { createAgentExperience } from './ui';
import { visitorStoreKeys, createVisitorStore, type VisitorStore } from './utils/visitor-store';
import type {
  AgentWidgetConfig,
  AgentWidgetStoredState,
  ClientInitResponse,
  ClientSession,
  WidgetHistoryInternals,
} from './types';

const CLIENT_TOKEN = 'ct_live_history';
const KEY_PREFIX = 'persona-';
const API_URL = 'https://api.runtype.com';
const INIT_URL = `${API_URL}/v1/client/init`;

type RecordedRequest = {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
};

type FetchResult = { ok: boolean; status: number; json: () => Promise<unknown> };

const futureIso = () => new Date(Date.now() + 5 * 60_000).toISOString();

const initBody = (overrides: Partial<ClientInitResponse> = {}): ClientInitResponse => ({
  sessionId: 'sess_1',
  expiresAt: futureIso(),
  flow: { id: 'flow_1', name: 'Flow', description: null },
  conversationId: 'conv_1',
  targetId: 'flow_1',
  conversationRevision: 'rev_1',
  durableRecovery: { enabled: true },
  config: { welcomeMessage: null, placeholder: 'Ask...', theme: null },
  ...overrides,
});

const ok = (overrides: Partial<ClientInitResponse> = {}): (() => FetchResult) => () => ({
  ok: true,
  status: 200,
  json: async () => initBody(overrides),
});

const fail = (status: number, payload: Record<string, unknown>): (() => FetchResult) => () => ({
  ok: false,
  status,
  json: async () => payload,
});

let requests: RecordedRequest[] = [];

/** Serves `queue` in order; an extra request is a test failure, not a hang. */
const installFetch = (queue: Array<() => FetchResult | Promise<FetchResult>>) => {
  global.fetch = vi.fn(async (url: unknown, options: { body: string; headers: Record<string, string> }) => {
    requests.push({
      url: String(url),
      body: JSON.parse(options.body) as Record<string, unknown>,
      headers: options.headers,
    });
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected fetch: ${String(url)}`);
    return next();
  }) as unknown as typeof fetch;
};

const storageKeyFor = async (clientToken = CLIENT_TOKEN, prefix = KEY_PREFIX) =>
  (await visitorStoreKeys(clientToken, prefix)).storageKey;

const seedToken = async (token: string) => {
  window.localStorage.setItem(await storageKeyFor(), token);
};

const readStoredToken = async () => window.localStorage.getItem(await storageKeyFor());

type Harness = {
  client: AgentWidgetClient;
  store: VisitorStore;
  storedSessionId: string | null;
  storedConversationId: string | null;
  storedRevision: string | null;
  sessionInits: ClientSession[];
  continuity: Array<{ previousConversationId: string | null; conversationId: string }>;
  availability: boolean[];
  durableResumePending: boolean;
  resumableWrites: Array<{ executionId: string; after: string } | null>;
  writes: string[];
};

const makeClient = (options: {
  history?: boolean;
  storedSessionId?: string | null;
  storedConversationId?: string | null;
  durableResumePending?: boolean;
  historyBootstrapReady?: Promise<void>;
  config?: Partial<AgentWidgetConfig>;
}): Harness => {
  const store = createVisitorStore(CLIENT_TOKEN, KEY_PREFIX, false);
  const harness: Partial<Harness> = {
    store,
    storedSessionId: options.storedSessionId ?? null,
    storedConversationId: options.storedConversationId ?? null,
    storedRevision: null,
    sessionInits: [],
    continuity: [],
    availability: [],
    durableResumePending: options.durableResumePending ?? false,
    resumableWrites: [],
    writes: [],
  };
  const internals: WidgetHistoryInternals = {
    visitorStore: store,
    ...(options.historyBootstrapReady
      ? { historyBootstrapReady: options.historyBootstrapReady }
      : {}),
    setStoredConversationRevision: (revision) => {
      harness.storedRevision = revision;
      harness.writes!.push(`revision:${revision}`);
    },
    onHistoryAvailabilityChanged: (available) => harness.availability!.push(available),
    onHistoryContinuityChanged: (info) => {
      harness.continuity!.push(info);
      harness.writes!.push(`continuity:${info.previousConversationId}->${info.conversationId}`);
    },
    shouldResumeDurableConversation: () => harness.durableResumePending === true,
    setStoredResumableHandle: (handle) => {
      harness.durableResumePending = handle !== null;
      harness.resumableWrites!.push(handle);
    },
  };
  const config: AgentWidgetConfig = {
    apiUrl: API_URL,
    clientToken: CLIENT_TOKEN,
    ...(options.history === false ? {} : { features: { history: { enabled: true } } }),
    getStoredSessionId: () => harness.storedSessionId ?? null,
    setStoredSessionId: (sessionId) => {
      harness.storedSessionId = sessionId;
      harness.writes!.push(`session:${sessionId}`);
    },
    getStoredConversationId: () => harness.storedConversationId ?? null,
    setStoredConversationId: (conversationId) => {
      harness.storedConversationId = conversationId;
      harness.writes!.push(`conversation:${conversationId}`);
    },
    clearStoredConversationId: () => {
      harness.storedConversationId = null;
    },
    onSessionInit: (session) => harness.sessionInits!.push(session),
    ...options.config,
  };
  harness.client = new AgentWidgetClient(config, internals);
  return harness as Harness;
};

beforeEach(() => {
  requests = [];
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('client visitor history - init capability shape', () => {
  it('sends visitorHistory, the awaited stored token, and the stored session id', async () => {
    await seedToken('cvt_stored');
    installFetch([ok()]);
    const h = makeClient({ storedSessionId: 'sess_old' });

    await h.client.initSession();

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      url: INIT_URL,
      body: {
        token: CLIENT_TOKEN,
        visitorHistory: true,
        durableRecovery: true,
        visitorToken: 'cvt_stored',
        sessionId: 'sess_old',
      },
    });
    expect(requests[0].body).not.toHaveProperty('conversationId');
  });

  it('negotiates recovery without enabling the history UI', async () => {
    await seedToken('cvt_stored');
    installFetch([ok()]);
    const h = makeClient({ history: false, storedSessionId: 'sess_old' });

    await h.client.initSession();

    expect(requests[0].body).toEqual({
      token: CLIENT_TOKEN,
      durableRecovery: true,
      visitorToken: 'cvt_stored',
      sessionId: 'sess_old',
    });
    expect(requests[0].body).not.toHaveProperty('conversationId');
  });

  it('normalizes targetId, preferring the top-level field over flow.id', async () => {
    installFetch([
      ok({ targetId: 'agent_9' }),
      ok({ sessionId: 'sess_2', targetId: undefined, flow: { id: 'flow_7', name: 'F', description: null } }),
    ]);
    const first = makeClient({});
    const second = makeClient({});

    const a = await first.client.initSession();
    const b = await second.client.initSession();

    expect(a.targetId).toBe('agent_9');
    expect(a.flow.id).toBe('flow_1');
    expect(b.targetId).toBe('flow_7');
  });

  it('uses the exact visitor credential and durable cursor for reconnect', async () => {
    await seedToken('cvt_stored');
    const events = new Response('event: ping\ndata: {}\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok()())
      .mockResolvedValueOnce(events);
    global.fetch = fetchMock as unknown as typeof fetch;
    const h = makeClient({});
    await h.client.initSession();

    const controller = new AbortController();
    const response = await h.client.reconnectClientTokenStream({
      executionId: 'exec_7',
      after: '12',
      signal: controller.signal,
    });

    expect(response).toBe(events);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${API_URL}/v1/client/conversations/conv_1/executions/exec_7/events` +
        '?sessionId=sess_1&after=12'
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'GET',
      headers: {
        'X-Persona-Version': expect.any(String),
        'X-Visitor-Token': 'cvt_stored',
      },
      signal: controller.signal,
    });
  });
});

describe('client visitor history - mint persistence and immediate claim', () => {
  const mint = { id: 'vis_1', token: 'cvt_new', expiresAt: futureIso(), endUserId: null };

  it('persists a minted token then performs exactly one claim init', async () => {
    installFetch([
      ok({ sessionId: 'sess_first', visitor: mint }),
      ok({ sessionId: 'sess_claimed', conversationId: 'conv_1', conversationRevision: 'rev_2' }),
    ]);
    const h = makeClient({ storedSessionId: null });

    const session = await h.client.initSession();

    expect(await readStoredToken()).toBe('cvt_new');
    expect(requests).toHaveLength(2);
    expect(requests[0].body).not.toHaveProperty('visitorToken');
    expect(requests[1].body).toMatchObject({
      visitorHistory: true,
      visitorToken: 'cvt_new',
      sessionId: 'sess_first',
    });
    expect(session.sessionId).toBe('sess_claimed');
    expect(h.client.getClientSession()?.sessionId).toBe('sess_claimed');
    expect(h.sessionInits).toHaveLength(1);
    expect(h.sessionInits[0].sessionId).toBe('sess_claimed');
    expect(h.storedSessionId).toBe('sess_claimed');
    expect(h.storedRevision).toBe('rev_2');
  });

  it('leaves storage untouched when the response carries no token key', async () => {
    installFetch([ok({ visitor: { id: 'vis_1', expiresAt: futureIso(), endUserId: null } })]);
    const h = makeClient({});

    await h.client.initSession();

    expect(await readStoredToken()).toBeNull();
    expect(requests).toHaveLength(1);
  });

  it('falls back to the first session when the claim init fails, without a retry loop', async () => {
    installFetch([
      ok({ sessionId: 'sess_first', visitor: mint }),
      fail(500, { error: 'boom' }),
    ]);
    const h = makeClient({});

    const session = await h.client.initSession();

    expect(requests).toHaveLength(2);
    expect(session.sessionId).toBe('sess_first');
    expect(h.client.getClientSession()?.sessionId).toBe('sess_first');
    expect(h.sessionInits).toHaveLength(1);
    expect(await readStoredToken()).toBe('cvt_new');
  });
});

describe('client visitor history - bootstrap gate', () => {
  it('performs no fetch until historyBootstrapReady resolves', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    installFetch([ok()]);
    const h = makeClient({ historyBootstrapReady: gate, storedConversationId: 'conv_1' });

    const eager = h.client.initSession();
    const first = h.client.initSession();
    await Promise.resolve();
    await Promise.resolve();

    expect(requests).toHaveLength(0);

    release();
    await Promise.all([eager, first]);

    expect(requests).toHaveLength(1);
  });

  it('reads the persisted conversation id only after the gate resolves', async () => {
    await seedToken('cvt_stored');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    installFetch([ok()]);
    const h = makeClient({ historyBootstrapReady: gate });

    const pending = h.client.initSession();
    await Promise.resolve();
    // Late-arriving stored state, exactly what an async storage adapter does.
    h.storedConversationId = 'conv_late';
    release();
    await pending;

    expect(requests[0].body).toMatchObject({ conversationId: 'conv_late' });
  });
});

describe('client visitor history - boot resume', () => {
  it('resumes by conversation id and never sends the stored session id', async () => {
    await seedToken('cvt_stored');
    installFetch([ok({ sessionId: 'sess_resumed' })]);
    const h = makeClient({ storedSessionId: 'sess_old', storedConversationId: 'conv_1' });

    await h.client.initSession();

    expect(requests[0].body).toEqual({
      token: CLIENT_TOKEN,
      visitorHistory: true,
      durableRecovery: true,
      visitorToken: 'cvt_stored',
      conversationId: 'conv_1',
    });
    expect(h.continuity).toHaveLength(0);
    expect(h.storedRevision).toBe('rev_1');
  });

  it('replays the stored session id when no conversation id is persisted', async () => {
    await seedToken('cvt_stored');
    installFetch([ok()]);
    const h = makeClient({ storedSessionId: 'sess_old' });

    await h.client.initSession();

    expect(requests[0].body).toMatchObject({ sessionId: 'sess_old' });
    expect(requests[0].body).not.toHaveProperty('conversationId');
  });

  it('reopens a durable conversation without enabling the history UI', async () => {
    await seedToken('cvt_stored');
    installFetch([ok({ sessionId: 'sess_resumed' })]);
    const h = makeClient({
      history: false,
      storedSessionId: 'sess_old',
      storedConversationId: 'conv_1',
      durableResumePending: true,
    });

    await h.client.initSession();

    expect(requests[0].body).toEqual({
      token: CLIENT_TOKEN,
      durableRecovery: true,
      visitorToken: 'cvt_stored',
      conversationId: 'conv_1',
    });
    expect(h.resumableWrites).toHaveLength(0);
  });

  it('preserves the stored session without history or a durable handle', async () => {
    await seedToken('cvt_stored');
    installFetch([ok({ sessionId: 'sess_ordinary', conversationId: 'conv_2' })]);
    const h = makeClient({
      history: false,
      storedSessionId: 'sess_old',
      storedConversationId: 'conv_1',
    });

    await h.client.initSession();

    expect(requests[0].body).toEqual({
      token: CLIENT_TOKEN,
      durableRecovery: true,
      visitorToken: 'cvt_stored',
      sessionId: 'sess_old',
    });
    expect(requests[0].body).not.toHaveProperty('conversationId');
  });

  it('drops a pending handle when the server does not enable recovery', async () => {
    await seedToken('cvt_stored');
    installFetch([
      ok({ sessionId: 'sess_resumed', durableRecovery: { enabled: false } }),
    ]);
    const h = makeClient({
      history: false,
      storedConversationId: 'conv_1',
      durableResumePending: true,
    });

    const session = await h.client.initSession();

    expect(requests).toHaveLength(1);
    expect(requests[0].body).toMatchObject({ conversationId: 'conv_1' });
    expect(session.durableRecovery).toEqual({ enabled: false });
    expect(h.resumableWrites).toEqual([null]);
  });

  it('drops a pending handle when an old server omits the recovery capability', async () => {
    await seedToken('cvt_stored');
    installFetch([ok({ sessionId: 'sess_legacy', durableRecovery: undefined })]);
    const h = makeClient({
      history: false,
      storedConversationId: 'conv_1',
      durableResumePending: true,
    });

    const session = await h.client.initSession();

    expect(session.durableRecovery).toBeUndefined();
    expect(h.resumableWrites).toEqual([null]);
  });

  it('clears a stale pending handle before its single ordinary fallback', async () => {
    await seedToken('cvt_stored');
    installFetch([
      fail(404, { error: 'Conversation not found' }),
      ok({ sessionId: 'sess_new', conversationId: 'conv_2' }),
    ]);
    const h = makeClient({
      history: false,
      storedSessionId: 'sess_old',
      storedConversationId: 'conv_1',
      durableResumePending: true,
    });

    await h.client.initSession();

    expect(requests).toHaveLength(2);
    expect(requests[0].body).toMatchObject({ conversationId: 'conv_1' });
    expect(requests[1].body).toMatchObject({ sessionId: 'sess_old' });
    expect(requests[1].body).not.toHaveProperty('conversationId');
    expect(h.resumableWrites).toEqual([null]);
  });

  it('falls back exactly once on a resume 404 and reports the continuity break', async () => {
    await seedToken('cvt_stored');
    installFetch([
      fail(404, { error: 'Conversation not found' }),
      ok({ sessionId: 'sess_new', conversationId: 'conv_2' }),
    ]);
    const h = makeClient({ storedSessionId: 'sess_old', storedConversationId: 'conv_1' });

    const session = await h.client.initSession();

    expect(requests).toHaveLength(2);
    expect(requests[1].body).toMatchObject({ sessionId: 'sess_old' });
    expect(requests[1].body).not.toHaveProperty('conversationId');
    expect(session.conversationId).toBe('conv_2');
    expect(h.continuity).toEqual([
      { previousConversationId: 'conv_1', conversationId: 'conv_2' },
    ]);
  });

  it('falls back exactly once on a resume 401 visitor_required', async () => {
    await seedToken('cvt_stale');
    installFetch([
      fail(401, { error: 'visitor_required' }),
      ok({ sessionId: 'sess_new', conversationId: 'conv_2' }),
    ]);
    const h = makeClient({ storedConversationId: 'conv_1' });

    await h.client.initSession();

    expect(requests).toHaveLength(2);
    expect(h.continuity).toHaveLength(1);
  });

  it('does not resume without a stored visitor token', async () => {
    installFetch([ok()]);
    const h = makeClient({ storedSessionId: 'sess_old', storedConversationId: 'conv_1' });

    await h.client.initSession();

    expect(requests[0].body).not.toHaveProperty('conversationId');
    expect(requests[0].body).toMatchObject({ sessionId: 'sess_old' });
  });
});

describe('client visitor history - continuity guard', () => {
  it('announces a differing conversation id before persisting it', async () => {
    installFetch([ok({ conversationId: 'conv_b', conversationRevision: 'rev_b' })]);
    const h = makeClient({ storedConversationId: 'conv_a' });

    await h.client.initSession();

    expect(h.continuity).toEqual([
      { previousConversationId: 'conv_a', conversationId: 'conv_b' },
    ]);
    expect(h.writes.indexOf('continuity:conv_a->conv_b')).toBeLessThan(
      h.writes.indexOf('conversation:conv_b')
    );
    expect(h.storedConversationId).toBe('conv_b');
    expect(h.storedRevision).toBe('rev_b');
  });

  it('stays quiet and just refreshes the revision when the same id comes back', async () => {
    await seedToken('cvt_stored');
    installFetch([ok({ conversationId: 'conv_a', conversationRevision: 'rev_9' })]);
    const h = makeClient({ storedConversationId: 'conv_a' });

    await h.client.initSession();

    expect(h.continuity).toHaveLength(0);
    expect(h.storedRevision).toBe('rev_9');
  });
});

describe('client visitor history - prepared sessions', () => {
  it('bypasses a live cached session and sends no session id', async () => {
    await seedToken('cvt_stored');
    installFetch([ok({ sessionId: 'sess_active' }), ok({ sessionId: 'sess_prepared' })]);
    const h = makeClient({ storedSessionId: 'sess_old' });

    await h.client.initSession();
    const prepared = await h.client.prepareConversationSession('conv_other');

    expect(requests).toHaveLength(2);
    expect(requests[1].body).toEqual({
      token: CLIENT_TOKEN,
      visitorHistory: true,
      durableRecovery: true,
      visitorToken: 'cvt_stored',
      conversationId: 'conv_other',
    });
    expect(prepared.session.sessionId).toBe('sess_prepared');
    // Nothing installed and no id persisted until commit.
    expect(h.client.getClientSession()?.sessionId).toBe('sess_active');
    expect(h.storedConversationId).toBe('conv_1');
    expect(h.storedSessionId).toBe('sess_active');

    prepared.commit();
    expect(h.client.getClientSession()?.sessionId).toBe('sess_prepared');
    expect(h.storedConversationId).toBe('conv_1');
  });

  it('discard is inert and idempotent', async () => {
    await seedToken('cvt_stored');
    installFetch([ok({ sessionId: 'sess_active' }), ok({ sessionId: 'sess_prepared' })]);
    const h = makeClient({});

    await h.client.initSession();
    const prepared = await h.client.prepareConversationSession('conv_other');
    prepared.discard();
    prepared.discard();
    prepared.commit();

    expect(h.client.getClientSession()?.sessionId).toBe('sess_active');
  });

  it('sends the identity proof when one is supplied instead of a token', async () => {
    installFetch([ok({ sessionId: 'sess_prepared' })]);
    const h = makeClient({});

    await h.client.prepareConversationSession('conv_other', { proof: 'rt_eu_abc' });

    expect(requests[0].body).toMatchObject({
      conversationId: 'conv_other',
      identityProof: 'rt_eu_abc',
    });
    expect(requests[0].body).not.toHaveProperty('sessionId');
  });

  it('fails locally with a typed error and no fetch when no credential exists', async () => {
    installFetch([]);
    const h = makeClient({});

    await expect(h.client.prepareConversationSession('conv_other')).rejects.toMatchObject({
      code: 'conversation_credential_missing',
    });
    expect(requests).toHaveLength(0);
  });

  it('prepares a new conversation without session or conversation ids', async () => {
    await seedToken('cvt_stored');
    installFetch([ok({ sessionId: 'sess_new' })]);
    const h = makeClient({ storedSessionId: 'sess_old', storedConversationId: 'conv_1' });

    const prepared = await h.client.prepareNewConversationSession();

    expect(requests[0].body).toEqual({
      token: CLIENT_TOKEN,
      visitorHistory: true,
      durableRecovery: true,
      visitorToken: 'cvt_stored',
    });
    expect(prepared.session.sessionId).toBe('sess_new');
    expect(h.storedSessionId).toBe('sess_old');
  });
});

describe('client visitor history - 403 degrade', () => {
  it('re-inits once without visitor fields and reports unavailability', async () => {
    await seedToken('cvt_stored');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    installFetch([
      fail(403, { error: 'visitor_history_disabled' }),
      ok({ sessionId: 'sess_plain' }),
      ok({ sessionId: 'sess_plain_2' }),
    ]);
    const h = makeClient({ storedSessionId: 'sess_old' });

    const session = await h.client.initSession();

    expect(requests).toHaveLength(2);
    expect(requests[1].body).toEqual({ token: CLIENT_TOKEN, sessionId: 'sess_old' });
    expect(session.sessionId).toBe('sess_plain');
    expect(h.availability).toEqual([false]);
    expect(warn).toHaveBeenCalledTimes(1);

    // History remains latched off, while recovery negotiates independently
    // without breaking ordinary session continuity.
    h.client.clearClientSession();
    await h.client.initSession();
    expect(requests[2].body).toEqual({
      token: CLIENT_TOKEN,
      durableRecovery: true,
      visitorToken: 'cvt_stored',
      sessionId: 'sess_plain',
    });
  });

  it('rejects rather than degrading a conversation resume into another record', async () => {
    await seedToken('cvt_stored');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    installFetch([fail(403, { error: 'visitor_history_disabled' })]);
    const h = makeClient({});

    await expect(h.client.prepareConversationSession('conv_other')).rejects.toBeInstanceOf(
      HistoryClientError
    );
    expect(requests).toHaveLength(1);
    expect(h.availability).toEqual([false]);
  });

  it('keeps the original error text for a non-history 403', async () => {
    installFetch([fail(403, { error: 'origin_not_allowed' })]);
    const h = makeClient({ history: false });

    await expect(h.client.initSession()).rejects.toThrow(/Origin not allowed/);
  });
});

describe('controller wiring', () => {
  it('gates the eager init on the async storage adapter and threads the visitor store', async () => {
    await seedToken('cvt_stored');
    installFetch([ok({ sessionId: 'sess_ui' })]);
    let releaseLoad!: (state: AgentWidgetStoredState) => void;
    const mount = document.createElement('div');
    document.body.appendChild(mount);

    const controller = createAgentExperience(mount, {
      apiUrl: API_URL,
      clientToken: CLIENT_TOKEN,
      launcher: { enabled: false },
      features: { history: { enabled: true } },
      storageAdapter: {
        load: () =>
          new Promise<AgentWidgetStoredState>((resolve) => {
            releaseLoad = resolve;
          }),
        save: () => undefined,
      },
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(requests).toHaveLength(0);

    releaseLoad({
      messages: [],
      metadata: { sessionId: 'sess_stored', conversationId: 'conv_stored' },
    });
    await vi.waitFor(() => expect(requests).toHaveLength(1));

    expect(requests[0].body).toEqual({
      token: CLIENT_TOKEN,
      visitorHistory: true,
      durableRecovery: true,
      visitorToken: 'cvt_stored',
      conversationId: 'conv_stored',
    });

    controller.destroy();
    mount.remove();
  });

  it('persists the built-in durable handle without history UI config and clears it at terminal', async () => {
    await seedToken('cvt_stored');
    installFetch([ok({ sessionId: 'sess_ui' })]);
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const controller = createAgentExperience(mount, {
      apiUrl: API_URL,
      clientToken: CLIENT_TOKEN,
      launcher: { enabled: false },
    });
    await vi.waitFor(() => expect(requests).toHaveLength(1));

    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(value) {
        streamController = value;
      },
    });
    const connected = controller.connectStream(stream);
    const encoder = new TextEncoder();
    streamController.enqueue(
      encoder.encode(
        'id: 7\nevent: text_delta\ndata: {"type":"text_delta","executionId":"exec_ui","id":"text_ui","delta":"Hi"}\n\n'
      )
    );
    await vi.waitFor(() =>
      expect(controller.getPersistentMetadata().durableResume).toEqual({
        executionId: 'exec_ui',
        after: '7',
      })
    );

    streamController.enqueue(
      encoder.encode(
        'id: 8\nevent: execution_complete\ndata: {"type":"execution_complete","executionId":"exec_ui","kind":"agent","success":true}\n\n'
      )
    );
    streamController.close();
    await connected;
    expect(controller.getPersistentMetadata()).not.toHaveProperty('durableResume');

    controller.destroy();
    mount.remove();
  });

  it('retains the built-in durable handle during page exit', async () => {
    await seedToken('cvt_stored');
    installFetch([ok({ sessionId: 'sess_ui' })]);
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const controller = createAgentExperience(mount, {
      apiUrl: API_URL,
      clientToken: CLIENT_TOKEN,
      launcher: { enabled: false },
    });
    await vi.waitFor(() => expect(requests).toHaveLength(1));

    let firstStreamController!: ReadableStreamDefaultController<Uint8Array>;
    const firstStream = new ReadableStream<Uint8Array>({
      start(value) {
        firstStreamController = value;
      },
    });
    const firstConnected = controller.connectStream(firstStream);
    const encoder = new TextEncoder();
    firstStreamController.enqueue(
      encoder.encode(
        'id: 7\nevent: text_delta\ndata: {"type":"text_delta","executionId":"exec_exit","id":"text_exit","delta":"Hi"}\n\n'
      )
    );
    await vi.waitFor(() =>
      expect(controller.getPersistentMetadata().durableResume).toEqual({
        executionId: 'exec_exit',
        after: '7',
      })
    );

    window.dispatchEvent(new Event('pagehide'));
    firstStreamController.enqueue(
      encoder.encode(
        'id: 8\nevent: execution_complete\ndata: {"type":"execution_complete","executionId":"exec_exit","kind":"agent","success":true}\n\n'
      )
    );
    firstStreamController.close();
    await firstConnected;
    expect(controller.getPersistentMetadata().durableResume).toEqual({
      executionId: 'exec_exit',
      after: '7',
    });

    controller.destroy();
    mount.remove();
  });

  it('uses Persona-owned stored recovery state to reopen the durable conversation', async () => {
    await seedToken('cvt_stored');
    global.fetch = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
      if (String(url) === INIT_URL) {
        requests.push({
          url: String(url),
          body: JSON.parse(String(options?.body)) as Record<string, unknown>,
          headers: (options?.headers ?? {}) as Record<string, string>,
        });
        return new Response(
          JSON.stringify(
            initBody({
              sessionId: 'sess_resumed',
              conversationId: 'conv_durable',
            })
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        'id: 20\nevent: execution_complete\ndata: {"type":"execution_complete","executionId":"exec_durable","kind":"agent","success":true}\n\n',
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
      );
    }) as unknown as typeof fetch;
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const controller = createAgentExperience(mount, {
      apiUrl: API_URL,
      clientToken: CLIENT_TOKEN,
      launcher: { enabled: false },
      storageAdapter: {
        load: async () => ({
          messages: [],
          metadata: {
            conversationId: 'conv_durable',
            durableResume: { executionId: 'exec_durable', after: '19' },
          },
        }),
        save: () => undefined,
      },
    });

    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].body).toMatchObject({
      durableRecovery: true,
      visitorToken: 'cvt_stored',
      conversationId: 'conv_durable',
    });
    expect(requests[0].body).not.toHaveProperty('visitorHistory');

    controller.destroy();
    mount.remove();
  });

  it('does not pass Persona-stored recovery state to a custom reconnect transport', async () => {
    await seedToken('cvt_stored');
    installFetch([ok({ sessionId: 'sess_ui' })]);
    const reconnectStream = vi.fn(
      () => new Promise<Response>(() => undefined)
    );
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const controller = createAgentExperience(mount, {
      apiUrl: API_URL,
      clientToken: CLIENT_TOKEN,
      launcher: { enabled: false },
      reconnectStream,
      storageAdapter: {
        load: async () => ({
          messages: [],
          metadata: {
            conversationId: 'conv_host',
            durableResume: { executionId: 'exec_host', after: '19' },
          },
        }),
        save: () => undefined,
      },
    });

    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].body).not.toHaveProperty('conversationId');
    expect(controller.getStatus()).toBe('idle');
    expect(reconnectStream).not.toHaveBeenCalled();

    controller.destroy();
    mount.remove();
  });
});

describe('client visitor history - dedupe', () => {
  it('deduplicates concurrent initSession calls with the new body fields', async () => {
    await seedToken('cvt_stored');
    installFetch([ok()]);
    const h = makeClient({ storedSessionId: 'sess_old' });

    const [a, b, c] = await Promise.all([
      h.client.initSession(),
      h.client.initSession(),
      h.client.initSession(),
    ]);

    expect(requests).toHaveLength(1);
    expect(requests[0].body).toMatchObject({ visitorHistory: true, visitorToken: 'cvt_stored' });
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(h.sessionInits).toHaveLength(1);
  });
});
