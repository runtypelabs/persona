import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentWidgetClient } from './client';
import type { AgentWidgetConfig, AgentWidgetEvent } from './types';

const success = () => new Response('data: {"type":"done"}\n\n', {
  headers: { 'Content-Type': 'text/event-stream' },
});

function setup(config: Partial<AgentWidgetConfig> = {}) {
  const getIdentityProof = vi.fn<() => string | null | Promise<string | null>>()
    .mockReturnValue('fresh-proof');
  const onSessionExpired = vi.fn();
  const client = new AgentWidgetClient({
    apiUrl: 'https://example.com',
    clientToken: 'ct_test_identity',
    identityProvider: 'clerk',
    getIdentityProof,
    onSessionExpired,
    ...config,
  });
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const chat = vi.fn<() => Response>().mockImplementation(success);
  let sessionNumber = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(init.body)) });
    if (url.endsWith('/init')) {
      return Response.json({
        sessionId: `session-${++sessionNumber}`,
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        flow: { id: 'agent-1', name: 'Agent', description: null },
        config: { welcomeMessage: null, placeholder: 'Ask...', theme: null },
      });
    }
    return chat();
  }));
  const events: AgentWidgetEvent[] = [];
  const run = (signal?: AbortSignal) => client.dispatch({
    messages: [{ id: 'message-1', role: 'user', content: 'Show my orders', createdAt: '2026-09-25' }],
    signal,
  }, (event) => events.push(event));
  const chatBodies = () => requests.filter((r) => r.url.endsWith('/chat')).map((r) => r.body);
  return { client, getIdentityProof, chat, requests, run, chatBodies, events, onSessionExpired };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('client token execution identity', () => {
  it.each([undefined, false, true])('sends the first turn proof with history enabled=%s', async (enabled) => {
    const h = setup({ features: { history: { enabled } } });
    h.chat.mockImplementation(() => h.chatBodies().at(-1)?.identityProof
      ? success()
      : Response.json({ error: 'Tenant scope required' }, { status: 403 }));
    await h.run();
    expect(h.chatBodies()[0].identityProof).toEqual({ provider: 'clerk', token: 'fresh-proof' });
    expect(h.getIdentityProof).toHaveBeenCalledTimes(1);
  });

  it('gets a new proof on every turn without persisting it into session state', async () => {
    const setStoredSessionId = vi.fn();
    const h = setup({ setStoredSessionId });
    h.getIdentityProof.mockReturnValueOnce('first-proof').mockReturnValueOnce('second-proof');
    await h.run();
    await h.run();
    expect(h.chatBodies().map((b) => b.identityProof)).toEqual([
      { provider: 'clerk', token: 'first-proof' },
      { provider: 'clerk', token: 'second-proof' },
    ]);
    expect(JSON.stringify(setStoredSessionId.mock.calls)).not.toContain('proof');
    expect(h.requests.filter((r) => r.url.endsWith('/init'))).toHaveLength(1);
  });

  it('refreshes the proof when an expired session causes a retry', async () => {
    const h = setup();
    h.getIdentityProof.mockReturnValueOnce('before-renewal').mockReturnValueOnce('after-renewal');
    h.chat.mockImplementationOnce(() => Response.json({ error: 'Session not found or expired' }, { status: 401 }));
    await h.run();
    expect(h.chatBodies().map((b) => b.identityProof)).toEqual([
      { provider: 'clerk', token: 'before-renewal' },
      { provider: 'clerk', token: 'after-renewal' },
    ]);
    expect(h.chatBodies()[1].sessionId).toBe('session-2');
  });

  it('refreshes the proof on a tool registry cache-miss retry', async () => {
    const h = setup();
    (h.client as unknown as { webMcpBridge: unknown }).webMcpBridge = {
      snapshotForDispatch: () => [{ name: 'search', description: 'Search', origin: 'webmcp' }],
    };
    await h.run();
    h.getIdentityProof.mockReturnValueOnce('before-retry').mockReturnValueOnce('after-retry');
    h.chat.mockImplementationOnce(() => Response.json({ error: 'client_tools_resend_required' }, { status: 409 }));
    await h.run();
    expect(h.chatBodies().slice(1).map((b) => b.identityProof)).toEqual([
      { provider: 'clerk', token: 'before-retry' },
      { provider: 'clerk', token: 'after-retry' },
    ]);
  });

  it.each([null, ''])('does not send a chat request when the configured provider returns %s', async (proof) => {
    const h = setup();
    h.getIdentityProof.mockReturnValue(proof);
    await expect(h.run()).rejects.toThrow('identity proof');
    expect(h.chat).not.toHaveBeenCalled();
    expect(h.events.some((event) => event.type === 'error')).toBe(true);
  });

  it('fails visibly without exposing an exception from the proof callback', async () => {
    const h = setup();
    h.getIdentityProof.mockRejectedValue(new Error('secret-proof-in-provider-error'));
    await expect(h.run()).rejects.toThrow('identity proof provider failed');
    expect(h.chat).not.toHaveBeenCalled();
    expect(h.events.filter((e) => e.type === 'error').map((e) => e.error.message).join()).not.toContain('secret-proof');
  });

  it('requires a callback when a provider is configured', async () => {
    const h = setup({ getIdentityProof: undefined });
    await expect(h.run()).rejects.toThrow('getIdentityProof');
    expect(h.chat).not.toHaveBeenCalled();
  });

  it('preserves history-only callbacks when execution identity is not configured', async () => {
    const h = setup({ identityProvider: undefined });
    await h.run();
    expect(h.getIdentityProof).not.toHaveBeenCalled();
    expect(h.chatBodies()[0]).not.toHaveProperty('identityProof');
  });

  it('does not send a turn cancelled while its proof is being obtained', async () => {
    const h = setup();
    let resolveProof!: (proof: string) => void;
    h.getIdentityProof.mockReturnValue(new Promise<string>((resolve) => { resolveProof = resolve; }));
    const abort = new AbortController();
    const running = h.run(abort.signal).catch((error: unknown) => error);
    await vi.waitFor(() => expect(h.getIdentityProof).toHaveBeenCalled());
    abort.abort();
    resolveProof('late-proof');
    expect(await running).toMatchObject({ name: 'AbortError' });
    expect(h.chat).not.toHaveBeenCalled();
  });

  it('does not log the proof in debug mode', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const h = setup({ debug: true });
    await h.run();
    expect(h.chatBodies()[0].identityProof).toBeDefined();
    expect(JSON.stringify(debug.mock.calls)).not.toContain('fresh-proof');
  });

  it('reports a rejected proof without calling it a session expiry or retrying', async () => {
    const h = setup();
    h.chat.mockImplementation(() => Response.json({ error: 'invalid_identity_proof', errorDescription: 'invalid_signature' }, { status: 401 }));
    await expect(h.run()).rejects.toThrow('identity proof was rejected');
    expect(h.chat).toHaveBeenCalledTimes(1);
    expect(h.onSessionExpired).not.toHaveBeenCalled();
  });
});
