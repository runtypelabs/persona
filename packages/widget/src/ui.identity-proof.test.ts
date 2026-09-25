// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { createAgentExperience } from './ui';

let controller: ReturnType<typeof createAgentExperience> | undefined;

afterEach(() => {
  controller?.destroy();
  controller = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('forwards verified identity from the embedded composer on the first turn with history disabled', async () => {
  const chatBodies: Array<Record<string, unknown>> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (url.endsWith('/init')) {
      return Response.json({
        sessionId: 'session-1',
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        flow: { id: 'agent-1', name: 'Agent', description: null },
        config: { welcomeMessage: null, placeholder: 'Ask...', theme: null },
      });
    }
    chatBodies.push(body);
    if (!body.identityProof) {
      return Response.json({ error: 'Tenant scope required' }, { status: 403 });
    }
    return new Response('data: {"type":"done"}\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }));
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  const getIdentityProof = vi.fn().mockResolvedValue('signed-organization-proof');
  controller = createAgentExperience(mount, {
    apiUrl: 'https://example.com',
    clientToken: 'ct_test_identity',
    agentId: 'agent-1',
    identityProvider: 'clerk',
    getIdentityProof,
    features: { history: { enabled: false } },
    launcher: { enabled: false },
    persistState: false,
  });
  const textarea = mount.querySelector<HTMLTextAreaElement>('[data-persona-composer-input]')!;
  textarea.value = 'Show my orders';
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  mount.querySelector<HTMLFormElement>('[data-persona-composer-form]')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(chatBodies).toHaveLength(1));
  expect(chatBodies[0].identityProof).toEqual({ provider: 'clerk', token: 'signed-organization-proof' });
  expect(getIdentityProof).toHaveBeenCalledTimes(1);
  expect(mount.querySelector('[data-persona-history-toggle]')).toBeNull();
});
