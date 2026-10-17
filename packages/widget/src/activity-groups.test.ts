// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupToolRows } from './activity-groups';
import { createActivityLifecycle } from './components/activity-row';
import type { AgentWidgetConfig, AgentWidgetMessage } from './types';

const tool = (id: string, iteration?: number, executionId?: string): AgentWidgetMessage => ({
  id, role: 'assistant', content: '', createdAt: 'now', variant: 'tool',
  agentMetadata: { iteration, executionId }, toolCall: { id, name: 'Search', status: 'complete', chunks: ['output'] },
});
const text: AgentWidgetMessage = { id: 'text', role: 'assistant', content: 'Answer', createdAt: 'now' };
const reasoning: AgentWidgetMessage = { ...text, id: 'reasoning', variant: 'reasoning', reasoning: { id: 'reasoning', status: 'complete', chunks: [] } };
const render = (messages: AgentWidgetMessage[], config: AgentWidgetConfig, streaming = false, ids: string[] = []) => {
  const tempContainer = document.createElement('div');
  const createMessageRow = (id: string) => { const row = document.createElement('div'); row.dataset.wrapperId = id; return row; };
  for (const message of messages) tempContainer.appendChild(createMessageRow(message.id));
  groupToolRows({ config, messages, tempContainer, streaming, currentRunToolIds: new Set(ids),
    showToolCalls: true, showReasoning: false, dropCompletedToolCalls: config.features?.toolCallDisplay?.completedVisibility === 'removed',
    dropReasoningRow: () => true, createMessageRow, activityIds: new Set(), activityLifecycle: createActivityLifecycle(() => {}), toolExpansionState: new Set() });
  return tempContainer;
};
const config = (groupedMode: 'summary' | 'stack' | 'collapsible', groupBoundary: 'iteration' | 'adjacent' = 'iteration'): AgentWidgetConfig => ({
  features: { toolCallDisplay: { grouped: true, groupedMode, groupBoundary } },
});
afterEach(() => vi.useRealTimers());
describe.each(['summary', 'stack', 'collapsible'] as const)('%s tool groups', mode => {
  it('splits known neighboring iterations and executions while keeping singleton groups', () => {
    const summary = vi.fn<NonNullable<NonNullable<AgentWidgetConfig["toolCall"]>["renderGroupedSummary"]>>(() => null); const settings = { ...config(mode), toolCall: { renderGroupedSummary: summary } };
    const node = render([tool('a', 1, 'e1'), tool('b', 1, 'e1'), tool('c', 2, 'e1'), tool('d', 2, 'e2')], settings, true, ['c', 'd']);
    expect(node.querySelectorAll('[data-persona-tool-group-row]')).toHaveLength(3);
    expect(summary.mock.calls.map(([context]) => context)).toEqual([
      expect.objectContaining({ streaming: true, isLatestGroup: false, isCurrentRunGroup: false }),
      expect.objectContaining({ streaming: true, isLatestGroup: false, isCurrentRunGroup: true }),
      expect.objectContaining({ streaming: true, isLatestGroup: true, isCurrentRunGroup: true }),
    ]);
    expect(node.querySelector('[data-wrapper-id="tool-group-c"]')).not.toBeNull();
  });
  it('uses pairwise visible neighbors, skipping hidden reasoning and removed tools', () => {
    const summary = vi.fn<NonNullable<NonNullable<AgentWidgetConfig["toolCall"]>["renderGroupedSummary"]>>(() => null);
    render([tool('a', 1), reasoning, tool('b'), tool('c', 2), text], { ...config(mode), toolCall: { renderGroupedSummary: summary } }, true);
    expect(summary).toHaveBeenCalledTimes(1);
    expect(summary).toHaveBeenLastCalledWith(expect.objectContaining({ messages: expect.arrayContaining([expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: 'c' })]), isLatestGroup: true }));
    const settings = config(mode); settings.features!.toolCallDisplay!.completedVisibility = 'removed';
    const a = tool('a', 1); a.toolCall!.status = 'running'; const c = tool('c', 1); c.toolCall!.status = 'running';
    expect(render([a, tool('b', 2), c], settings).querySelectorAll('[data-persona-tool-group-row]')).toHaveLength(1);
  });
  it('keeps adjacency default grouping independent of iteration and leaves singletons standalone', () => {
    const settings = config(mode, 'adjacent');
    expect(render([tool('a', 1), tool('b', 2)], settings).querySelectorAll('[data-persona-tool-group-row]')).toHaveLength(1);
    expect(render([tool('a')], settings).querySelectorAll('[data-persona-tool-group-row]')).toHaveLength(mode === 'summary' ? 1 : 0);
  });
});
it('keeps only the latest current adjacent group active through completed-tool gaps', () => {
  const messages = [tool('a'), tool('b'), text];
  const state = (streaming: boolean, ids: string[], boundary: 'iteration' | 'adjacent' = 'adjacent') => render(messages, config('collapsible', boundary), streaming, ids).querySelector<HTMLElement>('[data-persona-tool-group]')!.dataset.activityState;
  expect(state(true, ['a', 'b'])).toBe('running');
  expect(state(false, ['a', 'b'])).toBe('done');
  expect(state(true, [])).toBe('done');
  expect(state(true, ['a', 'b'], 'iteration')).toBe('done');
  expect(state(true, ['b'])).toBe('running');
});
it.each(['error', 'interrupted', 'denied', 'awaiting-approval'] as const)('preserves %s attention during streaming gaps', expected => {
  const a = tool('a');
  if (expected === 'error') a.toolCall!.success = false;
  else if (expected === 'interrupted') a.toolCall!.interrupted = true;
  else a.toolCall!.approvalStatus = expected === 'denied' ? 'denied' : 'pending';
  const group = render([a, tool('b')], config('collapsible', 'adjacent'), true, ['a', 'b']).querySelector<HTMLElement>('[data-persona-tool-group]')!;
  expect(group.dataset.activityState).toBe(expected);
});
it.each(['always', 'active', 'never'] as const)('applies %s group icon visibility to the header only', groupIconVisibility => {
  const settings = config('collapsible'); settings.features!.toolCallDisplay!.iconVisibility = 'never'; settings.features!.toolCallDisplay!.groupIconVisibility = groupIconVisibility;
  const custom = document.createElement('i'); custom.dataset.customIcon = 'true'; settings.toolCall = { renderGroupedSummary: () => custom };
  const node = render([tool('a')], settings);
  expect(!!node.querySelector('.persona-activity-icon')).toBe(groupIconVisibility === 'always');
  expect(node.querySelector('[data-custom-icon]')).toBe(custom);
  expect(settings.features!.toolCallDisplay!.iconVisibility).toBe('never');
});

it('keeps approval attention visible when another child failed earlier', () => {
  const a = tool('a'); a.toolCall!.success = false;
  const b = tool('b'); b.toolCall!.approvalStatus = 'pending';
  expect(render([a, b], config('collapsible'), true, ['a', 'b']).querySelector<HTMLElement>('[data-persona-tool-group]')!.dataset.activityState).toBe('awaiting-approval');
});

it('ignores non-HTML direct children when resolving group wrappers', () => {
  const tempContainer = document.createElement('div');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('data-wrapper-id', 'a');
  const html = document.createElement('div'); html.dataset.wrapperId = 'b'; tempContainer.append(svg, html);
  groupToolRows({ config: config('stack', 'adjacent'), messages: [tool('a'), tool('b')], tempContainer, streaming: false,
    showToolCalls: true, showReasoning: false, dropCompletedToolCalls: false, dropReasoningRow: () => false,
    createMessageRow: () => document.createElement('div'), activityIds: new Set(), activityLifecycle: createActivityLifecycle(() => {}), toolExpansionState: new Set() });
  expect(tempContainer.querySelector('[data-persona-tool-group-row]')).toBeNull();
  expect(tempContainer.children).toHaveLength(2);
});
