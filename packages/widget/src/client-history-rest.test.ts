// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { AgentWidgetClient } from './client';
import { createVisitorStore, visitorStoreKeys, type VisitorStore } from './utils/visitor-store';
import type {
  AgentWidgetConfig,
  AgentWidgetEvent,
  ClientInitResponse,
  ClientVisitorGrant,
  HistoryIdentityStatus,
  WidgetHistoryInternals,
} from './types';

const CLIENT_TOKEN = 'ct_live_history';
const KEY_PREFIX = 'persona-';
const API_URL = 'https://api.runtype.com';
const INIT_URL = `${API_URL}/v1/client/init`;
const CONVERSATIONS_URL = `${API_URL}/v1/client/conversations`;

type RecordedRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
  keepalive?: boolean;
};

type FakeResponse = {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json: () => Promise<unknown>;
};

const futureIso = () => new Date(Date.now() + 5 * 60_000).toISOString();

const respond = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): FakeResponse => {
  const lowered: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) lowered[key.toLowerCase()] = value;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lowered[name.toLowerCase()] ?? null },
    json: async () => body,
  };
};

const initBody = (overrides: Partial<ClientInitResponse> = {}): ClientInitResponse => ({
  sessionId: 'sess_1',
  expiresAt: futureIso(),
  flow: { id: 'flow_1', name: 'Flow', description: null },
  conversationId: 'conv_1',
  targetId: 'flow_1',
  conversationRevision: 'rev_1',
  config: { welcomeMessage: null, placeholder: 'Ask...', theme: null },
  ...overrides,
});

const initOk = (overrides: Partial<ClientInitResponse> = {}) => () =>
  respond(200, initBody(overrides));

/** Bound visitor: verified operations skip the pre-flight bind init. */
const boundVisitor: ClientVisitorGrant = {
  id: 'vis_1',
  expiresAt: futureIso(),
  endUserId: 'user_1',
  identityStatus: 'admitted',
};

const listOk = (
  identityStatus: string | null = 'not_provided',
  data: unknown[] = [],
  nextCursor: string | null = null
) => () =>
  respond(
    200,
    { data, nextCursor },
    identityStatus ? { 'X-History-Identity-Status': identityStatus } : {}
  );

let requests: RecordedRequest[] = [];

/** Serves `queue` in order; an extra request is a test failure, not a hang. */
const installFetch = (queue: Array<() => FakeResponse | Promise<FakeResponse>>) => {
  global.fetch = vi.fn(
    async (
      url: unknown,
      options: {
        method?: string;
        body?: string;
        headers: Record<string, string>;
        keepalive?: boolean;
      }
    ) => {
      requests.push({
        url: String(url),
        method: options.method ?? 'GET',
        headers: options.headers,
        ...(options.body
          ? { body: JSON.parse(options.body) as Record<string, unknown> }
          : {}),
        ...(options.keepalive !== undefined ? { keepalive: options.keepalive } : {}),
      });
      const next = queue.shift();
      if (!next) throw new Error(`Unexpected fetch: ${String(url)}`);
      return next();
    }
  ) as unknown as typeof fetch;
};

const storageKeyFor = async () => (await visitorStoreKeys(CLIENT_TOKEN, KEY_PREFIX)).storageKey;

const seedToken = async (token: string) => {
  window.localStorage.setItem(await storageKeyFor(), token);
};

const readStoredToken = async () => window.localStorage.getItem(await storageKeyFor());

/** Cross-tab write: jsdom does not emit `storage` for same-window writes. */
const externalTokenChange = async (token: string | null) => {
  const key = await storageKeyFor();
  if (token === null) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, token);
  window.dispatchEvent(new StorageEvent('storage', { key, newValue: token }));
};

type Harness = {
  client: AgentWidgetClient;
  store: VisitorStore;
  storedSessionId: string | null;
  storedConversationId: string | null;
  storedRevision: string | null;
  statuses: HistoryIdentityStatus[];
};

const makeClient = (options: {
  config?: Partial<AgentWidgetConfig>;
  storedSessionId?: string | null;
  storedConversationId?: string | null;
  store?: VisitorStore;
} = {}): Harness => {
  const store = options.store ?? createVisitorStore(CLIENT_TOKEN, KEY_PREFIX, false);
  const harness: Partial<Harness> = {
    store,
    storedSessionId: options.storedSessionId ?? null,
    storedConversationId: options.storedConversationId ?? null,
    storedRevision: null,
    statuses: [],
  };
  const internals: WidgetHistoryInternals = {
    visitorStore: store,
    setStoredConversationRevision: (revision) => {
      harness.storedRevision = revision;
    },
    onHistoryIdentityStatusChanged: (status) => harness.statuses!.push(status),
  };
  const config: AgentWidgetConfig = {
    apiUrl: API_URL,
    clientToken: CLIENT_TOKEN,
    features: { history: { enabled: true } },
    getStoredSessionId: () => harness.storedSessionId ?? null,
    setStoredSessionId: (sessionId) => {
      harness.storedSessionId = sessionId;
    },
    getStoredConversationId: () => harness.storedConversationId ?? null,
    setStoredConversationId: (conversationId) => {
      harness.storedConversationId = conversationId;
    },
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

describe('history REST - request shape', () => {
  it('lists conversations with the session id, cursor, limit, and target filter', async () => {
    await seedToken('cvt_stored');
    installFetch([
      initOk({ sessionId: 'sess_live' }),
      listOk('not_provided', [
        {
          id: 'conv_1',
          title: 'Placeholder title',
          flowId: 'flow_1',
          messageCount: 4,
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-02T00:00:00.000Z',
        },
      ], 'cur_next'),
    ]);
    const h = makeClient();

    const page = await h.client.listConversations({
      cursor: 'cur_1',
      limit: 25,
      targetId: 'flow_1',
    });

    const url = new URL(requests[1].url);
    expect(url.origin + url.pathname).toBe(CONVERSATIONS_URL);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      cursor: 'cur_1',
      limit: '25',
      targetId: 'flow_1',
      sessionId: 'sess_live',
    });
    expect(requests[1].method).toBe('GET');
    expect(requests[1].headers['X-Visitor-Token']).toBe('cvt_stored');
    expect(requests[1].headers['X-Persona-Version']).toBeTruthy();
    // Deprecated flowId is consumed at this boundary and never re-exposed.
    expect(page.data[0]).toEqual({
      id: 'conv_1',
      title: 'Placeholder title',
      targetId: 'flow_1',
      preview: null,
      messageCount: 4,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z',
    });
    expect(page.nextCursor).toBe('cur_next');
  });

  it('returns wire messages, the cursor, and the revision from detail', async () => {
    await seedToken('cvt_stored');
    const wire = [
      { id: 'm1', role: 'user', content: 'hi', displayAvailable: true },
      { id: 'm2', role: 'assistant', displayContent: 'hello', displayAvailable: true },
    ];
    installFetch([
      initOk({ sessionId: 'sess_live' }),
      () =>
        respond(
          200,
          {
            id: 'conv_1',
            title: 'T',
            targetId: 'flow_1',
            preview: 'hello',
            messageCount: 2,
            createdAt: 'a',
            updatedAt: 'b',
            messages: wire,
            nextMessageCursor: 'cur_older',
            conversationRevision: 'rev_9',
          },
          { 'X-History-Identity-Status': 'not_provided' }
        ),
    ]);
    const h = makeClient();

    const detail = await h.client.getConversation('conv_1', { messageCursor: 'cur_1' });

    const url = new URL(requests[1].url);
    expect(url.pathname).toBe('/v1/client/conversations/conv_1');
    expect(url.searchParams.get('messageCursor')).toBe('cur_1');
    expect(detail.messages).toEqual(wire);
    expect(detail.nextMessageCursor).toBe('cur_older');
    expect(detail.conversationRevision).toBe('rev_9');
    expect(detail.summary.targetId).toBe('flow_1');
    expect(detail.summary.preview).toBe('hello');
  });

  it('deletes one conversation and reports the deleted count', async () => {
    await seedToken('cvt_stored');
    installFetch([
      initOk({ sessionId: 'sess_live' }),
      () => respond(200, { deleted: 1 }, { 'X-History-Identity-Status': 'not_provided' }),
    ]);
    const h = makeClient();

    await expect(h.client.deleteConversation('conv_1')).resolves.toEqual({ deleted: 1 });
    expect(requests[1].method).toBe('DELETE');
    expect(new URL(requests[1].url).pathname).toBe('/v1/client/conversations/conv_1');
  });

  it('passes targetId through verbatim on delete-all', async () => {
    await seedToken('cvt_stored');
    installFetch([
      initOk({ sessionId: 'sess_live' }),
      () => respond(200, { deleted: 3 }, { 'X-History-Identity-Status': 'not_provided' }),
    ]);
    const h = makeClient();

    await expect(h.client.deleteAllConversations({ targetId: 'agent_7' })).resolves.toEqual({
      deleted: 3,
    });
    const url = new URL(requests[1].url);
    expect(url.searchParams.get('targetId')).toBe('agent_7');
    expect(requests[1].method).toBe('DELETE');
  });

  it('allows an omitted targetId on delete-all (headless client-token-wide scope)', async () => {
    await seedToken('cvt_stored');
    installFetch([
      initOk({ sessionId: 'sess_live' }),
      () => respond(200, { deleted: 0 }, { 'X-History-Identity-Status': 'not_provided' }),
    ]);
    const h = makeClient();

    await expect(h.client.deleteAllConversations()).resolves.toEqual({ deleted: 0 });
    const url = new URL(requests[1].url);
    expect(url.searchParams.has('targetId')).toBe(false);
    expect(url.searchParams.get('sessionId')).toBe('sess_live');
  });
});

describe('history REST - header and scope discipline', () => {
  it('sends the visitor token as a header on every call and never in a URL', async () => {
    await seedToken('cvt_stored');
    installFetch([
      initOk({ sessionId: 'sess_live' }),
      listOk(),
      () => respond(200, { deleted: 1 }, { 'X-History-Identity-Status': 'not_provided' }),
      () => respond(200, { deleted: 2 }, { 'X-History-Identity-Status': 'not_provided' }),
    ]);
    const h = makeClient();

    await h.client.listConversations();
    await h.client.deleteConversation('conv_1');
    await h.client.deleteAllConversations({ targetId: 'flow_1' });

    for (const request of requests.slice(1)) {
      expect(request.headers['X-Visitor-Token']).toBe('cvt_stored');
      expect(request.url).not.toContain('cvt_');
    }
  });

  it('fails locally without a request when no visitor token is stored', async () => {
    installFetch([initOk({ sessionId: 'sess_live' })]);
    const h = makeClient();

    await expect(h.client.listConversations()).rejects.toMatchObject({
      code: 'visitor_token_missing',
    });
    // Only the session init ran.
    expect(requests).toHaveLength(1);
  });

  it('never calls the identity provider for browser scope', async () => {
    await seedToken('cvt_stored');
    const getIdentityProof = vi.fn(() => 'rt_eu_abc');
    installFetch([initOk({ sessionId: 'sess_live' }), listOk()]);
    const h = makeClient({ config: { getIdentityProof } });

    await h.client.listConversations({ scope: 'browser' });

    expect(getIdentityProof).not.toHaveBeenCalled();
    expect(requests[1].headers['X-Identity-Proof']).toBeUndefined();
  });

  it('resolves the proof once per logical request and reuses it across recovery', async () => {
    await seedToken('cvt_stored');
    const getIdentityProof = vi.fn(() => 'rt_eu_abc');
    installFetch([
      initOk({ sessionId: 'sess_live', visitor: boundVisitor }),
      () => respond(401, { error: 'Session not found or expired' }),
      initOk({ sessionId: 'sess_fresh', visitor: boundVisitor }),
      listOk('admitted'),
    ]);
    const h = makeClient({ config: { getIdentityProof } });

    await h.client.listConversations({ scope: 'verified-user' });

    expect(getIdentityProof).toHaveBeenCalledTimes(1);
    expect(requests[1].headers['X-Identity-Proof']).toBe('rt_eu_abc');
    expect(requests[3].headers['X-Identity-Proof']).toBe('rt_eu_abc');
    expect(requests[3].url).not.toContain('rt_eu_');
    expect(new URL(requests[3].url).searchParams.get('sessionId')).toBe('sess_fresh');
  });

  it('falls back to browser scope when the provider returns null before binding', async () => {
    await seedToken('cvt_stored');
    const getIdentityProof = vi.fn(() => null);
    installFetch([
      initOk({
        sessionId: 'sess_live',
        visitor: { id: 'vis_1', expiresAt: futureIso(), endUserId: null },
      }),
      listOk(),
    ]);
    const h = makeClient({ config: { getIdentityProof } });

    await h.client.listConversations({ scope: 'verified-user' });

    expect(requests).toHaveLength(2);
    expect(requests[1].headers['X-Identity-Proof']).toBeUndefined();
    expect(h.client.getHistoryIdentityStatus()).toEqual({
      state: 'browser_only',
      reason: 'proof_unavailable_before_binding',
    });
  });

  it('fails closed when the provider returns null for a bound visitor', async () => {
    await seedToken('cvt_stored');
    installFetch([initOk({ sessionId: 'sess_live', visitor: boundVisitor })]);
    const h = makeClient({ config: { getIdentityProof: () => null } });

    await expect(h.client.listConversations({ scope: 'verified-user' })).rejects.toMatchObject({
      code: 'authentication_required',
    });
    expect(requests).toHaveLength(1);
    expect(h.client.getHistoryIdentityStatus()).toEqual({
      state: 'authentication_required',
      reason: 'proof_unavailable_after_binding',
    });
  });

  it('surfaces a thrown provider as identity_provider_failed with no history fetch', async () => {
    await seedToken('cvt_stored');
    installFetch([initOk({ sessionId: 'sess_live', visitor: boundVisitor })]);
    const h = makeClient({
      config: {
        getIdentityProof: () => {
          throw new Error('sso down');
        },
      },
    });

    await expect(h.client.listConversations({ scope: 'verified-user' })).rejects.toMatchObject({
      code: 'identity_provider_failed',
    });
    expect(requests).toHaveLength(1);
    expect(h.client.getHistoryIdentityStatus()).toEqual({ state: 'identity_provider_failed' });
  });
});

describe('history REST - identity binding and acknowledgement', () => {
  it('binds the visitor once with the proof before the first verified request', async () => {
    await seedToken('cvt_stored');
    installFetch([
      initOk({
        sessionId: 'sess_live',
        visitor: { id: 'vis_1', expiresAt: futureIso(), endUserId: null },
      }),
      initOk({ sessionId: 'sess_bound', visitor: boundVisitor }),
      listOk('admitted'),
    ]);
    const h = makeClient({
      storedSessionId: 'sess_stored',
      config: { getIdentityProof: () => 'rt_eu_abc' },
    });

    await h.client.listConversations({ scope: 'verified-user' });

    expect(requests[1].url).toBe(INIT_URL);
    // Ordinary init body plus the proof: the bind replays the current session id.
    expect(requests[1].body).toMatchObject({
      visitorHistory: true,
      identityProof: 'rt_eu_abc',
      sessionId: 'sess_live',
    });
    expect(new URL(requests[2].url).searchParams.get('sessionId')).toBe('sess_bound');
    expect(h.client.getHistoryIdentityStatus()).toEqual({ state: 'verified' });
  });

  it('refuses verified history when the bind response reports an ignored proof', async () => {
    await seedToken('cvt_stored');
    installFetch([
      initOk({
        sessionId: 'sess_live',
        visitor: { id: 'vis_1', expiresAt: futureIso(), endUserId: null },
      }),
      initOk({
        sessionId: 'sess_bound',
        visitor: {
          id: 'vis_1',
          expiresAt: futureIso(),
          endUserId: null,
          identityStatus: 'ignored',
        },
      }),
    ]);
    const h = makeClient({ config: { getIdentityProof: () => 'rt_eu_abc' } });

    await expect(h.client.listConversations({ scope: 'verified-user' })).rejects.toMatchObject({
      code: 'proof_not_admitted',
    });
    expect(requests).toHaveLength(2);
    expect(h.client.getHistoryIdentityStatus()).toEqual({
      state: 'configuration_error',
      reason: 'proof_not_admitted',
    });
  });

  it('discards a verified 200 that acknowledges not_provided', async () => {
    await seedToken('cvt_stored');
    installFetch([
      initOk({ sessionId: 'sess_live', visitor: boundVisitor }),
      listOk('not_provided', [{ id: 'conv_1' }]),
    ]);
    const h = makeClient({ config: { getIdentityProof: () => 'rt_eu_abc' } });

    await expect(h.client.listConversations({ scope: 'verified-user' })).rejects.toMatchObject({
      code: 'proof_not_admitted',
    });
    expect(h.client.getHistoryIdentityStatus()).toEqual({
      state: 'configuration_error',
      reason: 'proof_not_admitted',
    });
  });

  it('discards a verified 200 with no acknowledgement header', async () => {
    await seedToken('cvt_stored');
    installFetch([
      initOk({ sessionId: 'sess_live', visitor: boundVisitor }),
      listOk(null, [{ id: 'conv_1' }]),
    ]);
    const h = makeClient({ config: { getIdentityProof: () => 'rt_eu_abc' } });

    await expect(h.client.listConversations({ scope: 'verified-user' })).rejects.toMatchObject({
      code: 'proof_not_admitted',
    });
  });

  it('treats a 2xx "ignored" acknowledgement as a contract violation', async () => {
    await seedToken('cvt_stored');
    installFetch([
      initOk({ sessionId: 'sess_live', visitor: boundVisitor }),
      listOk('ignored', [{ id: 'conv_1' }]),
    ]);
    const h = makeClient({ config: { getIdentityProof: () => 'rt_eu_abc' } });

    await expect(h.client.listConversations({ scope: 'verified-user' })).rejects.toMatchObject({
      code: 'identity_contract_violation',
    });
  });

  it('tolerates a missing header for browser scope and reports browser_only', async () => {
    await seedToken('cvt_stored');
    installFetch([initOk({ sessionId: 'sess_live' }), listOk(null, [{ id: 'conv_1' }])]);
    const h = makeClient();

    const page = await h.client.listConversations();

    expect(page.data).toHaveLength(1);
    expect(h.client.getHistoryIdentityStatus()).toEqual({
      state: 'browser_only',
      reason: 'no_identity_provider',
    });
  });

  it('treats "admitted" on a proof-less request as a contract violation', async () => {
    await seedToken('cvt_stored');
    installFetch([initOk({ sessionId: 'sess_live' }), listOk('admitted', [{ id: 'conv_1' }])]);
    const h = makeClient();

    await expect(h.client.listConversations()).rejects.toMatchObject({
      code: 'identity_contract_violation',
    });
  });

  it('maps a 503 identity_proof_not_admitted to the configuration state', async () => {
    await seedToken('cvt_stored');
    installFetch([
      initOk({ sessionId: 'sess_live', visitor: boundVisitor }),
      () =>
        respond(
          503,
          { error: 'identity_proof_not_admitted' },
          { 'X-History-Identity-Status': 'ignored' }
        ),
    ]);
    const h = makeClient({ config: { getIdentityProof: () => 'rt_eu_abc' } });

    await expect(h.client.deleteAllConversations({ scope: 'verified-user' })).rejects.toMatchObject(
      { code: 'proof_not_admitted' }
    );
    expect(h.client.getHistoryIdentityStatus()).toEqual({
      state: 'configuration_error',
      reason: 'proof_not_admitted',
    });
  });
});

describe('history REST - identity status transitions', () => {
  it('walks browser_only to verifying to verified, dedupes, and carries no secrets', async () => {
    await seedToken('cvt_stored');
    installFetch([
      initOk({ sessionId: 'sess_live', visitor: boundVisitor }),
      listOk('admitted'),
      listOk('admitted'),
    ]);
    const h = makeClient({ config: { getIdentityProof: () => 'rt_eu_abc' } });

    await h.client.listConversations({ scope: 'verified-user' });
    await h.client.listConversations({ scope: 'verified-user' });

    expect(h.statuses).toEqual([
      { state: 'verifying' },
      { state: 'verified' },
      { state: 'verifying' },
      { state: 'verified' },
    ]);
    for (const status of h.statuses) {
      expect(Object.keys(status).every((key) => key === 'state' || key === 'reason')).toBe(true);
      expect(JSON.stringify(status)).not.toContain('rt_eu_');
      expect(JSON.stringify(status)).not.toContain('cvt_');
      expect(JSON.stringify(status)).not.toContain('user_1');
    }
  });

  it('does not re-announce an unchanged browser_only state', async () => {
    await seedToken('cvt_stored');
    installFetch([initOk({ sessionId: 'sess_live' }), listOk(), listOk()]);
    const h = makeClient();

    await h.client.listConversations();
    await h.client.listConversations();

    expect(h.statuses).toEqual([]);
    expect(h.client.getHistoryIdentityStatus()).toEqual({
      state: 'browser_only',
      reason: 'no_identity_provider',
    });
  });

  it('reports unavailable after the 403 history degrade', async () => {
    await seedToken('cvt_stored');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    installFetch([
      () => respond(403, { error: 'visitor_history_disabled' }),
      initOk({ sessionId: 'sess_plain' }),
    ]);
    const h = makeClient();

    await h.client.initSession();

    expect(h.statuses).toEqual([{ state: 'unavailable', reason: 'history_disabled' }]);
    await expect(h.client.listConversations()).rejects.toMatchObject({
      code: 'history_disabled',
    });
  });
});

describe('history REST - selective one-shot 401 recovery', () => {
  it('re-inits and retries once on an expired session', async () => {
    await seedToken('cvt_stored');
    installFetch([
      initOk({ sessionId: 'sess_live' }),
      () => respond(401, { error: 'Session not found or expired' }),
      () =>
        respond(200, {
          ...initBody({ sessionId: 'sess_fresh' }),
          visitor: { id: 'vis_2', token: 'cvt_replacement', expiresAt: futureIso(), endUserId: null },
        }),
      listOk(),
    ]);
    const h = makeClient();

    await h.client.listConversations();

    expect(requests).toHaveLength(4);
    // The retry uses the replacement credential and the new session.
    expect(requests[3].headers['X-Visitor-Token']).toBe('cvt_replacement');
    expect(new URL(requests[3].url).searchParams.get('sessionId')).toBe('sess_fresh');
    expect(await readStoredToken()).toBe('cvt_replacement');
  });

  it('rebinds with the same proof on visitor_identity_mismatch and retries once', async () => {
    await seedToken('cvt_stored');
    const getIdentityProof = vi.fn(() => 'rt_eu_abc');
    installFetch([
      initOk({ sessionId: 'sess_live', visitor: boundVisitor }),
      () => respond(401, { error: 'visitor_identity_mismatch' }),
      initOk({ sessionId: 'sess_rebound', visitor: boundVisitor }),
      listOk('admitted'),
    ]);
    const h = makeClient({ config: { getIdentityProof } });

    await h.client.listConversations({ scope: 'verified-user' });

    expect(requests).toHaveLength(4);
    expect(requests[2].url).toBe(INIT_URL);
    expect(requests[2].body).toMatchObject({ identityProof: 'rt_eu_abc' });
    expect(getIdentityProof).toHaveBeenCalledTimes(1);
  });

  it('never re-inits on invalid_identity_proof', async () => {
    await seedToken('cvt_stored');
    installFetch([
      initOk({ sessionId: 'sess_live', visitor: boundVisitor }),
      () => respond(401, { error: 'invalid_identity_proof' }),
    ]);
    const h = makeClient({ config: { getIdentityProof: () => 'rt_eu_abc' } });

    await expect(h.client.listConversations({ scope: 'verified-user' })).rejects.toMatchObject({
      code: 'invalid_identity_proof',
    });
    expect(requests).toHaveLength(2);
    expect(h.client.getHistoryIdentityStatus()).toEqual({
      state: 'authentication_required',
      reason: 'invalid_identity_proof',
    });
  });

  it('never retries a missing visitor token reported by the server', async () => {
    await seedToken('cvt_stored');
    installFetch([
      initOk({ sessionId: 'sess_live' }),
      () => respond(401, { error: 'Visitor token required' }),
    ]);
    const h = makeClient();

    await expect(h.client.listConversations()).rejects.toMatchObject({
      code: 'visitor_token_missing',
    });
    expect(requests).toHaveLength(2);
  });

  it('propagates a second 401 instead of recovering twice', async () => {
    await seedToken('cvt_stored');
    installFetch([
      initOk({ sessionId: 'sess_live' }),
      () => respond(401, { error: 'Session not found or expired' }),
      initOk({ sessionId: 'sess_fresh' }),
      () => respond(401, { error: 'Session not found or expired' }),
    ]);
    const h = makeClient();

    await expect(h.client.listConversations()).rejects.toMatchObject({ code: 'unauthorized' });
    expect(requests).toHaveLength(4);
  });
});

describe('history REST - typed transport errors', () => {
  it('surfaces 429 with retryAfterSeconds and no automatic retry', async () => {
    await seedToken('cvt_stored');
    installFetch([
      initOk({ sessionId: 'sess_live' }),
      () => respond(429, { error: 'rate_limited' }, { 'Retry-After': '10' }),
    ]);
    const h = makeClient();

    await expect(h.client.listConversations()).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 10,
    });
    expect(requests).toHaveLength(2);
  });

  it('surfaces 404 as not_found', async () => {
    await seedToken('cvt_stored');
    installFetch([initOk({ sessionId: 'sess_live' }), () => respond(404, { error: 'not_found' })]);
    const h = makeClient();

    await expect(h.client.getConversation('conv_gone')).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('discards a 200 whose credential changed mid-flight', async () => {
    await seedToken('cvt_stored');
    installFetch([
      initOk({ sessionId: 'sess_live' }),
      async () => {
        // Another tab resets the visitor while this response is in flight.
        await externalTokenChange('cvt_other');
        return respond(200, { data: [{ id: 'conv_1' }], nextCursor: null }, {
          'X-History-Identity-Status': 'not_provided',
        });
      },
    ]);
    const h = makeClient();

    await expect(h.client.listConversations()).rejects.toMatchObject({
      code: 'credential_changed',
    });
  });
});

describe('history REST - display projection finalization', () => {
  const projectionOk = (revision = 'rev_2') => () =>
    respond(
      200,
      { conversationRevision: revision },
      { 'X-History-Identity-Status': 'not_provided' }
    );

  it('patches projections with keepalive, browser scope, and no identity proof', async () => {
    await seedToken('cvt_stored');
    const getIdentityProof = vi.fn(() => 'rt_eu_abc');
    installFetch([initOk({ sessionId: 'sess_live' }), projectionOk()]);
    const h = makeClient({ config: { getIdentityProof } });

    const result = await h.client.finalizeDisplayProjections('conv_1', [
      { id: 'm2', displayContent: 'final answer' },
    ]);

    expect(requests[1].method).toBe('PATCH');
    expect(new URL(requests[1].url).pathname).toBe(
      '/v1/client/conversations/conv_1/display-projections'
    );
    expect(requests[1].body).toEqual({ messages: [{ id: 'm2', displayContent: 'final answer' }] });
    expect(requests[1].keepalive).toBe(true);
    expect(requests[1].headers['X-Visitor-Token']).toBe('cvt_stored');
    expect(requests[1].headers['X-Identity-Proof']).toBeUndefined();
    expect(getIdentityProof).not.toHaveBeenCalled();
    expect(result.conversationRevision).toBe('rev_2');
    expect(h.storedRevision).toBe('rev_2');
    // A transport op publishes no identity status of its own.
    expect(h.statuses).toEqual([]);
  });

  it('enforces the per-message and batch caps locally with no request', async () => {
    await seedToken('cvt_stored');
    installFetch([]);
    const h = makeClient();

    await expect(
      h.client.finalizeDisplayProjections('conv_1', [
        { id: 'm1', displayContent: 'x'.repeat(32769) },
      ])
    ).rejects.toMatchObject({ code: 'payload_too_large' });

    await expect(
      h.client.finalizeDisplayProjections('conv_1', [
        { id: 'm1', displayContent: 'x'.repeat(32768) },
        { id: 'm2', displayContent: 'y'.repeat(20000) },
      ])
    ).rejects.toMatchObject({ code: 'payload_too_large' });

    expect(requests).toHaveLength(0);
  });

  it('does not install the revision for a conversation that is no longer active', async () => {
    await seedToken('cvt_stored');
    installFetch([initOk({ sessionId: 'sess_live', conversationId: 'conv_other' }), projectionOk()]);
    const h = makeClient();

    const result = await h.client.finalizeDisplayProjections('conv_1', [
      { id: 'm2', displayContent: 'final answer' },
    ]);

    expect(result.conversationRevision).toBe('rev_2');
    // The init's revision stands: a different record cannot install this one.
    expect(h.storedRevision).toBe('rev_1');
  });

  it('does not install the revision after the credential changed', async () => {
    await seedToken('cvt_stored');
    installFetch([
      initOk({ sessionId: 'sess_live' }),
      async () => {
        await externalTokenChange('cvt_other');
        return respond(
          200,
          { conversationRevision: 'rev_2' },
          { 'X-History-Identity-Status': 'not_provided' }
        );
      },
    ]);
    const h = makeClient();

    await expect(
      h.client.finalizeDisplayProjections('conv_1', [{ id: 'm2', displayContent: 'x' }])
    ).rejects.toMatchObject({ code: 'credential_changed' });
    expect(h.storedRevision).toBe('rev_1');
  });

  it('drops a pending projection for a deleted conversation', async () => {
    await seedToken('cvt_stored');
    installFetch([initOk({ sessionId: 'sess_live' }), () => respond(404, { error: 'not_found' })]);
    const h = makeClient();

    await expect(
      h.client.finalizeDisplayProjections('conv_1', [{ id: 'm2', displayContent: 'x' }])
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(h.storedRevision).toBe('rev_1');
  });
});

describe('history REST - visitor reset', () => {
  it('sends the token when present, clears the store, and never sends a proof', async () => {
    await seedToken('cvt_stored');
    const getIdentityProof = vi.fn(() => 'rt_eu_abc');
    installFetch([
      initOk({ sessionId: 'sess_live', visitor: boundVisitor }),
      () => respond(200, { reset: true }, { 'X-History-Identity-Status': 'not_provided' }),
    ]);
    const h = makeClient({ config: { getIdentityProof } });

    await expect(h.client.resetVisitor()).resolves.toEqual({ reset: true });

    expect(requests[1].method).toBe('POST');
    expect(new URL(requests[1].url).pathname).toBe('/v1/client/visitor/reset');
    expect(new URL(requests[1].url).searchParams.get('sessionId')).toBe('sess_live');
    expect(requests[1].headers['X-Visitor-Token']).toBe('cvt_stored');
    expect(requests[1].headers['X-Identity-Proof']).toBeUndefined();
    expect(getIdentityProof).not.toHaveBeenCalled();
    expect(await readStoredToken()).toBeNull();
    expect(h.statuses[0]).toEqual({ state: 'resetting' });
    expect(h.client.getHistoryIdentityStatus()).toMatchObject({ state: 'browser_only' });
  });

  it('resets without a stored visitor token', async () => {
    installFetch([
      initOk({ sessionId: 'sess_live' }),
      () => respond(200, { reset: true }, { 'X-History-Identity-Status': 'not_provided' }),
    ]);
    const h = makeClient();

    await expect(h.client.resetVisitor()).resolves.toEqual({ reset: true });
    expect(requests[1].headers['X-Visitor-Token']).toBeUndefined();
  });

  it('still clears the store when the remote reset fails', async () => {
    await seedToken('cvt_stored');
    installFetch([initOk({ sessionId: 'sess_live' }), () => respond(500, { error: 'boom' })]);
    const h = makeClient();

    await expect(h.client.resetVisitor()).rejects.toMatchObject({ code: 'request_failed' });
    expect(await readStoredToken()).toBeNull();
  });
});

describe('history - chat 410', () => {
  it('surfaces a typed conversation_deleted error and never retries', async () => {
    await seedToken('cvt_stored');
    installFetch([
      initOk({ sessionId: 'sess_live' }),
      () => respond(410, { error: 'conversation_deleted' }),
    ]);
    const h = makeClient();
    const events: AgentWidgetEvent[] = [];

    await expect(
      h.client.dispatch(
        {
          messages: [
            {
              id: 'usr_1',
              role: 'user',
              content: 'hello',
              createdAt: '2026-08-01T00:00:00.000Z',
            },
          ],
        },
        (event) => events.push(event)
      )
    ).rejects.toMatchObject({ code: 'conversation_deleted' });

    // Init + the one chat attempt: the stale payload is never resent.
    expect(requests).toHaveLength(2);
    expect(events.filter((event) => event.type === 'error')).toHaveLength(1);
  });
});

describe('history - first-init lock', () => {
  const installFakeLocks = () => {
    const chains = new Map<string, Promise<unknown>>();
    Object.defineProperty(globalThis.navigator, 'locks', {
      configurable: true,
      value: {
        request: async <T>(name: string, callback: () => Promise<T>): Promise<T> => {
          const previous = chains.get(name) ?? Promise.resolve();
          let release!: () => void;
          const held = new Promise<void>((resolve) => {
            release = resolve;
          });
          chains.set(name, previous.then(() => held));
          await previous;
          try {
            return await callback();
          } finally {
            release();
          }
        },
      },
    });
    return () => {
      Reflect.deleteProperty(globalThis.navigator as unknown as object, 'locks');
    };
  };

  it('holds the lock across mint, write, and claim while a waiter joins the visitor', async () => {
    const removeLocks = installFakeLocks();
    let releaseMint!: () => void;
    const mintGate = new Promise<void>((resolve) => {
      releaseMint = resolve;
    });
    installFetch([
      async () => {
        await mintGate;
        return respond(
          200,
          initBody({
            sessionId: 'sess_first',
            visitor: { id: 'vis_1', token: 'cvt_new', expiresAt: futureIso(), endUserId: null },
          })
        );
      },
      initOk({ sessionId: 'sess_claimed' }),
      initOk({ sessionId: 'sess_second' }),
    ]);
    const winner = makeClient();
    const waiter = makeClient({ store: createVisitorStore(CLIENT_TOKEN, KEY_PREFIX, false) });

    const first = winner.client.initSession();
    const second = waiter.client.initSession();
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();

    // The waiter cannot mint a second visitor while the winner holds the lock.
    expect(requests).toHaveLength(1);

    releaseMint();
    await Promise.all([first, second]);

    expect(requests.map((request) => request.body?.sessionId)).toEqual([
      undefined,
      'sess_first',
      undefined,
    ]);
    // The waiter re-read the winner's token inside the lock instead of minting.
    expect(requests[2].body).toMatchObject({ visitorToken: 'cvt_new' });
    expect(requests[1].body).toMatchObject({ visitorToken: 'cvt_new' });
    removeLocks();
  });
});
