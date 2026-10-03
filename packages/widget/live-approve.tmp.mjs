import { AgentWidgetSession } from './dist/index.js';
const decision = process.argv[2] || 'approved';
let messages = [];
const errors = [];
const s = new AgentWidgetSession(
  { clientToken: process.env.CT, apiUrl: 'https://api.runtype-staging.com', agentId: 'agent_01m3zkd8t7e85vxd6zjf9d3a1d' },
  { onMessagesChanged: (m) => { messages = m; }, onStatusChanged: () => {}, onStreamingChanged: () => {}, onError: (e) => errors.push(e.message) }
);
const origFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => { const r = await origFetch(url, { ...init, headers: { ...(init?.headers||{}), Origin: 'https://example.com' } }); console.log('FETCH', init?.method, String(url).replace(/\?.*/, ''), r.status); return r; };
await s.sendMessage('Please order one croissant for pickup.');
const dump = () => messages.map(m => ({ id: m.id, role: m.role, variant: m.variant, status: m.approval?.status, tool: m.toolCall?.name, exec: m.approval?.executionId, content: (m.content||'').slice(0,160) }));
console.log('AFTER CHAT', JSON.stringify(dump(), null, 1), errors);
const ap = messages.find(m => m.variant === 'approval' && m.approval?.status === 'pending');
if (!ap) { console.log('no pending approval'); process.exit(1); }
await s.resolveApproval(ap.approval, decision);
console.log('AFTER APPROVE', JSON.stringify(dump(), null, 1), errors);
if (process.argv[3] === 'again') { await s.resolveApproval({ ...ap.approval, status: 'pending' }, decision); console.log('AFTER REPEAT', JSON.stringify(dump().slice(-2), null, 1), errors); }
