import { AgentWidgetSession } from './dist/index.js';
let messages = []; const errors = [];
const pending = { id: 'appr_fake', status: 'pending', agentId: 'agent_01m3zkd8t7e85vxd6zjf9d3a1d', executionId: 'exec_does_not_exist', toolName: 'place_pickup_order_test9518', description: 'x' };
const s = new AgentWidgetSession({ clientToken: process.env.CT, apiUrl: 'https://api.runtype-staging.com', initialMessages: [{ id: 'approval-appr_fake', role: 'assistant', content: '', createdAt: new Date().toISOString(), variant: 'approval', approval: pending }] },
  { onMessagesChanged: (m) => { messages = m; }, onStatusChanged() {}, onStreamingChanged() {}, onError: (e) => errors.push(e.message) });
const of = globalThis.fetch;
globalThis.fetch = async (url, init) => { const r = await of(url, { ...init, headers: { ...(init?.headers||{}), Origin: 'https://example.com' } }); console.log('FETCH', String(url), r.status, init?.body && JSON.stringify(Object.keys(JSON.parse(init.body)))); return r; };
await s.resolveApproval(pending, 'approved');
console.log(JSON.stringify(messages.map(m => ({ id: m.id, status: m.approval?.status, content: m.content })), null, 1), errors, 'streaming', s.isStreaming());
