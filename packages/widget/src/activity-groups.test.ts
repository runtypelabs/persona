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
  groupToolRows({ root: tempContainer, config, messages, tempContainer, streaming, runActivity: {run:{runId:"test",timestamp:Date.now()},messageIds:new Set(ids)},
    showToolCalls: true, showReasoning: false, dropCompletedToolCalls: config.features?.toolCallDisplay?.completedVisibility === 'removed',
    dropReasoningRow: () => true, createMessageRow, activityIds: new Set(), activityLifecycle: createActivityLifecycle(() => {}), toolExpansionState: new Set() });
  return tempContainer;
};
const config = (groupedMode: 'summary' | 'stack' | 'collapsible', groupBoundary: 'iteration' | 'adjacent' = 'iteration'): AgentWidgetConfig => ({
  features: { toolCallDisplay: { grouped: true, groupedMode, groupBoundary } },
});
afterEach(() => vi.useRealTimers());

it.each(['summary', 'stack', 'collapsible'] as const)('summarizes semantic categories for %s rows and lets the renderer override', mode => {
  const a = tool('a'), b = tool('b'), c = tool('c');
  a.toolCall!.name = 'Read'; b.toolCall!.name = 'read_text_file'; c.toolCall!.name = 'Bash';
  c.toolCall!.status = 'running';
  const settings = config(mode); settings.features!.toolCallDisplay!.variant = 'row';
  const node = render([a, b, c], settings, true, ['a', 'b', 'c']);
  expect(node.querySelector('[data-persona-tool-group-row]')?.textContent).toBe('Read files, running commands');
  const summary = vi.fn(() => 'Custom activity'); settings.toolCall = { renderGroupedSummary: summary };
  expect(render([a, b, c], settings).querySelector('[data-persona-tool-group-row]')?.textContent).toBe('Custom activity');
  expect(summary).toHaveBeenCalledWith(expect.objectContaining({ defaultSummary: 'Read files, running commands' }));
});

it('keeps legacy card stack summaries unchanged', () => {
  expect(render([tool('a'), tool('b')], config('stack')).querySelector('.persona-tool-group-summary')?.textContent).toBe('Called 2 tools');
});

it('preserves pending approval and failure text when different children need attention', () => {
  const a = tool('a'), b = tool('b'); a.toolCall!.name = 'Read'; b.toolCall!.name = 'Bash';
  a.toolCall!.success = false; b.toolCall!.approvalStatus = 'pending';
  const node = render([a, b], config('collapsible'), true, ['a', 'b']);
  expect(node.querySelector('[data-persona-tool-group-row]')?.textContent).toBe('Read, bash · Waiting for approval · Failed');
});

describe.each(['summary', 'stack', 'collapsible'] as const)('%s tool groups', mode => {
  it('flattens singleton iterations without losing boundaries or latest-group context', () => {
    const summary = vi.fn<NonNullable<NonNullable<AgentWidgetConfig['toolCall']>['renderGroupedSummary']>>(() => null);
    const settings = { ...config(mode), toolCall: { renderGroupedSummary: summary } };
    const node = render([tool('a', 1), tool('b', 1), tool('c', 2), tool('d', 3)], settings, true, ['a', 'b', 'c', 'd']);
    expect(node.querySelectorAll('[data-persona-tool-group-row]')).toHaveLength(mode === 'summary' ? 3 : 1);
    expect(summary.mock.calls[0][0]).toEqual(expect.objectContaining({ isLatestGroup: false, isCurrentRunGroup: true }));
    if (mode !== 'summary') {
      expect(summary).toHaveBeenCalledTimes(1);
      expect(node.querySelector('[data-wrapper-id="c"]')?.parentElement).toBe(node);
      expect(node.querySelector('[data-wrapper-id="d"]')?.parentElement).toBe(node);
    }
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
  const node = render([tool('a'), tool('b')], settings);
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
  groupToolRows({ root: tempContainer, config: config('stack', 'adjacent'), messages: [tool('a'), tool('b')], tempContainer, streaming: false,
    showToolCalls: true, showReasoning: false, dropCompletedToolCalls: false, dropReasoningRow: () => false,
    createMessageRow: () => document.createElement('div'), activityIds: new Set(), activityLifecycle: createActivityLifecycle(() => {}), toolExpansionState: new Set() });
  expect(tempContainer.querySelector('[data-persona-tool-group-row]')).toBeNull();
  expect(tempContainer.children).toHaveLength(2);
});

it('measures overlapping tools as a wall-clock span and preserves mode changes', () => {
  const a = tool('a'), b = tool('b');
  Object.assign(a.toolCall!, { startedAt: 1000, completedAt: 5000, duration: 4000 });
  Object.assign(b.toolCall!, { startedAt: 3000, completedAt: 7000, duration: 4000 });
  const settings = config('collapsible');
  for (const durationDisplay of ['none', 'tools', 'group', 'all'] as const) {
    settings.features!.toolCallDisplay!.durationDisplay = durationDisplay;
    expect(render([a, b], settings).querySelector('.persona-activity-duration')?.textContent ?? '').toBe(durationDisplay === 'group' || durationDisplay === 'all' ? '6s' : '');
  }
});
it('holds the measured span between batches, then ticks only while a child runs', () => {
  vi.useFakeTimers(); vi.setSystemTime(10000);
  const a = tool('a'), b = tool('b');
  Object.assign(a.toolCall!, { startedAt: 1000, completedAt: 3000 });
  Object.assign(b.toolCall!, { startedAt: 5000, completedAt: 7000 });
  const settings = config('collapsible', 'adjacent'); settings.features!.toolCallDisplay!.durationDisplay = 'group';
  const node = render([a, b], settings, true, ['a', 'b']);
  expect(node.querySelector('[data-persona-tool-group]')?.getAttribute('data-activity-state')).toBe('running');
  expect(node.querySelector('.persona-activity-duration')?.textContent).toBe('6s');
  expect(node.querySelector('[data-tool-elapsed]')).toBeNull();
  b.toolCall!.status = 'running'; b.toolCall!.completedAt = undefined;
  expect(render([a, b], settings, true, ['a', 'b']).querySelector('[data-tool-elapsed]')?.getAttribute('data-tool-elapsed')).toBe('1000');
});
it.each(['missing start', 'missing end', 'invalid', 'future', 'negative', 'zero', 'inverted', 'duration only'])('omits group timing for %s metadata', problem => {
  const a = tool('a'), b = tool('b');
  Object.assign(a.toolCall!, { startedAt: 1000, completedAt: 3000 });
  Object.assign(b.toolCall!, { startedAt: 2000, completedAt: 7000 });
  if (problem === 'missing start') delete b.toolCall!.startedAt;
  if (problem === 'missing end') delete b.toolCall!.completedAt;
  if (problem === 'invalid') b.toolCall!.startedAt = NaN;
  if (problem === 'future') b.toolCall!.completedAt = Date.now() + 10000;
  if (problem === 'negative') b.toolCall!.startedAt = -1000;
  if (problem === 'zero') b.toolCall!.startedAt = 0;
  if (problem === 'inverted') b.toolCall!.completedAt = 1000;
  if (problem === 'duration only') { delete b.toolCall!.startedAt; delete b.toolCall!.completedAt; b.toolCall!.duration = 5000; }
  const settings = config('collapsible'); settings.features!.toolCallDisplay!.durationDisplay = 'group';
  expect(render([a, b], settings).querySelector('.persona-activity-duration')?.textContent).toBe('');
});

it('does not keep an earlier adjacent group working when the final tool is unwrapped', () => {
  const summary = vi.fn<NonNullable<NonNullable<AgentWidgetConfig['toolCall']>['renderGroupedSummary']>>(() => null);
  const settings = { ...config('collapsible', 'adjacent'), toolCall: { renderGroupedSummary: summary } };
  const node = render([tool('a'), tool('b'), text, tool('c')], settings, true, ['a', 'b', 'c']);
  expect(node.querySelector('[data-persona-tool-group]')?.getAttribute('data-activity-state')).toBe('done');
  expect(summary).toHaveBeenCalledWith(expect.objectContaining({ isLatestGroup: false, isCurrentRunGroup: true }));
});

it('adopts only a known resumed execution when all replayed message ids already exist', async () => {
  const turn = await import('./turn-activity-ui');
  const { turnUi } = await import('./activity-ui'); turnUi.render = turn.render;
  const a = tool('existing', 1, 'resumed'); a.turnActivity = {id:'resumed-turn',kind:'progress'};
  const old = tool('old', 1, 'previous'); old.turnActivity = {id:'old-turn',kind:'progress'};
  const messages = [old, a]; const tempContainer = document.createElement('div');
  const createMessageRow = (id: string) => { const row = document.createElement('div'); row.dataset.wrapperId = id; return row; };
  for (const message of messages) tempContainer.append(createMessageRow(message.id));
  groupToolRows({root:tempContainer,config:{turnActivity:{enabled:true}},messages,tempContainer,streaming:true,
    runActivity:{run:{runId:'local-resume',timestamp:Date.now()},messageIds:new Set(["existing"])},
    showToolCalls:true,showReasoning:false,dropCompletedToolCalls:false,dropReasoningRow:()=>false,createMessageRow,
    activityIds:new Set(),activityLifecycle:createActivityLifecycle(()=>{}),toolExpansionState:new Set()});
  const labels = [...tempContainer.querySelectorAll('[data-persona-turn-activity] > button')];
  expect(labels.map(label => label.textContent)).toEqual(['Worked','Working']);
});

it('keeps default group loading animation when a custom summary returns null', () => {
  const a = tool('a'), b = tool('b');
  a.toolCall!.status = 'running';
  const node = render([a, b], { ...config('collapsible'), loadingLabel: { animation: 'pulse' }, toolCall: { renderGroupedSummary: () => null } });
  expect(node.querySelector('[data-persona-tool-group] > button [data-persona-loading-label]')).not.toBeNull();
});

it.each(['summary', 'stack', 'collapsible'] as const)('supports current-action opt-in without turn classification in %s groups', mode => {
  const a = tool('a'), b = tool('b'); a.toolCall!.name = 'Read'; b.toolCall!.name = 'web_search';
  b.toolCall!.status = 'running'; b.toolCall!.actionTitle = 'Checking citations';
  const settings = config(mode); settings.features!.toolCallDisplay!.groupSummary = 'current-action';
  const summary = () => render([a,b], settings).querySelector('[data-persona-tool-group-row]')!.textContent;
  expect(summary()).toBe('Checking citations');
  a.toolCall!.status = 'running';
  expect(summary()).not.toContain('Checking citations');
  a.toolCall!.status = 'complete'; a.toolCall!.interrupted = true;
  expect(summary()).toContain('Interrupted');
  expect(summary()).not.toContain('Checking citations');
  a.toolCall!.interrupted = false; b.toolCall!.status = 'complete';
  expect(summary()).not.toContain('Checking citations');
  settings.toolCall = { renderGroupedSummary: () => 'Host summary' };
  expect(summary()).toBe('Host summary');
});
