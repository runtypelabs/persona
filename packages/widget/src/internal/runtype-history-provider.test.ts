// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentWidgetClient, HistoryClientError } from '../client';
import { createVisitorStore, type VisitorStore } from '../utils/visitor-store';
import type { AgentWidgetConfig, ClientSession, WidgetHistoryInternals } from '../types';
import { HistoryProviderError, type HistoryOperationContext } from './history-provider';
import { createRuntypeHistoryProvider } from './runtype-history-provider';

const CLIENT_TOKEN = 'ct_provider_test';
const API_URL = 'https://api.runtype.com';
const BROWSER: HistoryOperationContext = { scope: 'browser' };

const futureIso = () => new Date(Date.now() + 5 * 60_000).toISOString();

const respond = (
  status: number,
  body: unknown,
  headers: Record<string, string> = { 'X-History-Identity-Status': 'not_provided' }
) => {
  const lowered: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) lowered[key.toLowerCase()] = value;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lowered[name.toLowerCase()] ?? null },
    json: async () => body,
  };
};

const initOk = () =>
  respond(200, {
    sessionId: 'sess_1',
    expiresAt: futureIso(),
    flow: { id: 'flow_1', name: 'Flow', description: null },
    conversationId: 'conv_1',
    targetId: 'flow_1',
    conversationRevision: 'rev_1',
    config: { welcomeMessage: null, placeholder: '', theme: null },
  });

describe('createRuntypeHistoryProvider', () => {
  let store: VisitorStore;
  let fetchMock: ReturnType<typeof vi.fn>;
  let committed: ClientSession[];

  const build = async (config: Partial<AgentWidgetConfig> = {}) => {
    const internals: WidgetHistoryInternals = { visitorStore: store };
    const client = new AgentWidgetClient(
      {
        clientToken: CLIENT_TOKEN,
        apiUrl: API_URL,
        features: { history: { enabled: true } },
        ...config,
      },
      internals
    );
    const provider = createRuntypeHistoryProvider({
      client,
      getIdentityProofConfigured: () => Boolean(config.getIdentityProof),
      onActivationCommitted: (session) => {
        committed.push(session);
      },
    });
    return { client, provider };
  };

  beforeEach(async () => {
    window.localStorage.clear();
    committed = [];
    store = createVisitorStore(CLIENT_TOKEN, 'persona-', false);
    await store.set('cvt_test');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    store.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('advertises verified-user only when an identity proof callback exists', async () => {
    const browserOnly = await build();
    expect(browserOnly.provider.capabilities.scopes).toEqual(['browser']);

    const verified = await build({ getIdentityProof: () => 'rt_eu_token' });
    expect(verified.provider.capabilities.scopes).toEqual([
      'browser',
      'verified-user',
    ]);
  });

  it('fails locally with unsupported_scope instead of issuing a request', async () => {
    const { provider } = await build();
    fetchMock.mockImplementation(initOk);

    await expect(
      provider.list({ context: { scope: 'verified-user' } })
    ).rejects.toMatchObject({ code: 'unsupported_scope' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes targetId through on list and delete-all', async () => {
    const { provider } = await build();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/v1/client/init')) return initOk();
      if (init?.method === 'DELETE') return respond(200, { deleted: 3 });
      return respond(200, { data: [], nextCursor: null });
    });

    await provider.list({ targetId: 'flow_1', limit: 10, context: BROWSER });
    await provider.deleteAll({ targetId: 'flow_1', context: BROWSER });

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('targetId=flow_1') && url.includes('limit=10'))).toBe(
      true
    );
    const deleteCall = fetchMock.mock.calls.find(
      (call) => (call[1] as RequestInit | undefined)?.method === 'DELETE'
    );
    expect(String(deleteCall?.[0])).toContain('targetId=flow_1');
  });

  it('maps wire messages with the display projection winning and dedupes by id', async () => {
    const { provider } = await build();
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/v1/client/init')) return initOk();
      return respond(200, {
        conversation: {
          id: 'conv_1',
          title: 'Saved',
          targetId: 'flow_1',
          preview: 'Saved preview',
          messageCount: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:02:00.000Z',
        },
        messages: [
          {
            id: 'm1',
            role: 'user',
            content: '{"intent":"order_status"}',
            displayContent: 'Where is my order?',
            displayAvailable: true,
            timestamp: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'm1',
            role: 'user',
            content: 'duplicate row from a cursor overlap',
            displayContent: 'Where is my order?',
            displayAvailable: true,
            timestamp: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'm2',
            role: 'assistant',
            displayAvailable: false,
            timestamp: '2026-01-01T00:01:00.000Z',
          },
        ],
        nextMessageCursor: 'cursor_older',
        conversationRevision: 'rev_9',
      });
    });

    const page = await provider.getPage('conv_1', { context: BROWSER });

    expect(page.messages).toHaveLength(2);
    expect(page.messages[0].content).toBe('Where is my order?');
    expect(page.messages[0].llmContent).toBeUndefined();
    expect(page.messages[1].content).toBe('');
    expect(page.conversationRevision).toBe('rev_9');
    expect(page.nextCursor).toBe('cursor_older');
    expect(page.summary.targetId).toBe('flow_1');
  });

  it('forwards beforeCreatedAt so a prepended page stays earlier than the transcript', async () => {
    const { provider } = await build();
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/v1/client/init')) return initOk();
      return respond(200, {
        conversation: { id: 'conv_1', title: 'Saved', targetId: null, messageCount: 1 },
        // No timestamps: the mapper must synthesize them under the boundary.
        messages: [{ id: 'old1', role: 'user', content: 'older', displayAvailable: true }],
        nextMessageCursor: null,
        conversationRevision: 'rev_2',
      });
    });

    const page = await provider.getPage('conv_1', {
      cursor: 'c1',
      beforeCreatedAt: '2026-01-01T00:00:00.000Z',
      context: BROWSER,
    });

    expect(new Date(page.messages[0].createdAt).getTime()).toBeLessThan(
      new Date('2026-01-01T00:00:00.000Z').getTime()
    );
  });

  it('commits a prepared open through the session binding, and discard changes nothing', async () => {
    const { client, provider } = await build();
    fetchMock.mockImplementation(initOk);

    const prepared = await provider.prepareOpen('conv_1', { context: BROWSER });
    expect(prepared.conversationId).toBe('conv_1');
    expect(prepared.conversationRevision).toBe('rev_1');
    expect(client.getClientSession()).toBeNull();
    expect(committed).toHaveLength(0);

    await prepared.commit();
    expect(client.getClientSession()?.sessionId).toBe('sess_1');
    expect(committed).toHaveLength(1);

    // Settled once: a late discard cannot unwind a winning commit.
    prepared.discard();
    expect(client.getClientSession()?.sessionId).toBe('sess_1');

    const superseded = await provider.prepareStartNew({ context: BROWSER });
    superseded.discard();
    await superseded.commit();
    expect(committed).toHaveLength(1);
  });

  it('maps client errors onto the domain vocabulary without leaking HTTP text', async () => {
    const { provider } = await build();
    const cases: Array<[number, unknown, string, Record<string, string>]> = [
      [404, { error: 'not_found' }, 'not_found', {}],
      [429, { error: 'rate_limited' }, 'rate_limited', { 'Retry-After': '10' }],
      [503, { error: 'identity_proof_not_admitted' }, 'proof_not_admitted', {}],
      [500, { error: 'boom: upstream 500 at /v1/client/conversations' }, 'unavailable', {}],
    ];

    for (const [status, body, expected, headers] of cases) {
      fetchMock.mockReset();
      fetchMock.mockImplementation((url: string) => {
        if (url.includes('/v1/client/init')) return initOk();
        return respond(status, body, {
          'X-History-Identity-Status': 'not_provided',
          ...headers,
        });
      });
      const error = await provider
        .list({ context: BROWSER })
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(HistoryProviderError);
      const domain = error as HistoryProviderError;
      expect(domain.code).toBe(expected);
      expect(domain.message).not.toMatch(/\d{3}/);
      expect(domain.message.toLowerCase()).not.toContain('http');
      expect(domain.message).not.toContain('/v1/');
      if (expected === 'rate_limited') {
        expect(domain.retryAfterSeconds).toBe(10);
      }
    }
  });

  it('resolves resetDevice with remoteRevocationConfirmed false instead of rejecting', async () => {
    const { client, provider } = await build();
    const clearSpy = vi.spyOn(store, 'clear');
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/v1/client/init')) return initOk();
      return respond(500, { error: 'reset failed' });
    });

    await expect(provider.resetDevice?.()).resolves.toEqual({
      remoteRevocationConfirmed: false,
    });
    // The client clears credentials in its own `finally` regardless.
    expect(clearSpy).toHaveBeenCalled();
    expect(client.getHistoryIdentityStatus().state).toBe('browser_only');
  });

  it('bridges identity status and availability subscriptions', async () => {
    const { client, provider } = await build();
    const statuses: string[] = [];
    const availability: boolean[] = [];
    const unsubscribe = provider.subscribeIdentityStatus((status) =>
      statuses.push(status.state)
    );
    provider.subscribeAvailability?.((available) => availability.push(available));

    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/v1/client/init')) {
        return respond(403, { error: 'visitor_history_disabled' });
      }
      return respond(200, { data: [], nextCursor: null });
    });

    await provider.list({ context: BROWSER }).catch(() => undefined);
    expect(availability).toEqual([false]);
    expect(statuses).toContain('unavailable');
    expect(provider.getIdentityStatus()).toEqual(
      client.getHistoryIdentityStatus()
    );

    unsubscribe();
  });

  it('never lets a raw HistoryClientError escape the seam', async () => {
    const { provider } = await build();
    fetchMock.mockImplementation(() => respond(404, { error: 'not_found' }));

    const error = await provider
      .getPage('missing', { context: BROWSER })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HistoryProviderError);
    expect(error).not.toBeInstanceOf(HistoryClientError);
  });
});
