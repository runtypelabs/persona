// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentExperience, type AgentWidgetController } from './ui';
import type { AgentWidgetConfig, AgentWidgetMessage } from './types';
let controller: AgentWidgetController;
let mount: HTMLElement;
beforeEach(() => { window.localStorage.clear(); window.scrollTo = vi.fn(); mount = document.createElement('div'); document.body.appendChild(mount); });
afterEach(() => { controller?.destroy(); document.body.replaceChildren(); vi.useRealTimers(); });
const inject = (id: string, status: 'running' | 'complete', chunks: string[] = []) => controller.injectTestMessage({ type: 'message', message: { id, role: 'assistant', content: '', createdAt: '2026-01-01T00:00:00Z', sequence: Number(id.slice(-1)), variant: 'tool', toolCall: { id, name: 'Search', status, chunks } } });
const header = (id: string) => mount.querySelector<HTMLButtonElement>(`[data-message-id="${id}"] > button`)!;
const start = (v5Defaults: boolean, toolCallDisplay: NonNullable<AgentWidgetConfig['features']>['toolCallDisplay']) => { controller = createAgentExperience(mount, { future: { v5Defaults }, apiUrl: '/test', persistState: false, launcher: { enabled: false }, features: { toolCallDisplay } }); };

it.each([false, true])('keeps expired approval visible as attention (grouped %s)', grouped => {
  start(true, { variant: 'row', grouped, groupedMode: 'collapsible', iconVisibility: 'active' });
  controller.injectTestMessage({ type: 'message', message: {
    id: 'expired1', role: 'assistant', content: '', createdAt: '2026-01-01', sequence: 1, variant: 'tool',
    toolCall: { id: 'expired1', name: 'Edit', status: 'complete', approvalStatus: 'timeout' },
  } });
  if (grouped) inject('tool2', 'complete', ['Finished']);
  const button = grouped ? mount.querySelector<HTMLButtonElement>('[data-persona-tool-group] > button')! : header('expired1');
  expect(button.textContent).toContain('Approval expired');
  expect(button.parentElement?.getAttribute('data-activity-state')).toBe('denied');
  expect(button.querySelector('[data-activity-icon="denied"]')).not.toBeNull();
  expect(button.querySelector('[data-activity-icon="done"]')).toBeNull();
});

describe.each([false, true])('activity UI (V5 %s)', v5Defaults => {
  it('uses version defaults for streaming tool and reasoning disclosure', () => {
    start(v5Defaults, { variant: 'row', grouped: false });
    inject('tool1', 'running', ['one']);
    expect(header('tool1').getAttribute('aria-expanded')).toBe(String(!v5Defaults));
    if (v5Defaults) {
      inject('tool1', 'running', ['one', 'two']);
      expect(header('tool1').getAttribute('aria-expanded')).toBe('false');
      header('tool1').click();
      expect(header('tool1').getAttribute('aria-expanded')).toBe('true');
    }
    controller.destroy();
    controller = createAgentExperience(mount, { future: { v5Defaults }, apiUrl: '/test', persistState: false, launcher: { enabled: false }, features: { reasoningDisplay: { variant: 'row' } } });
    controller.injectTestMessage({ type: 'message', message: { id: 'r1', role: 'assistant', content: '', createdAt: '2026-01-01', variant: 'reasoning', reasoning: { id: 'r1', status: 'streaming', chunks: ['Thinking'] } } });
    expect(header('r1').getAttribute('aria-expanded')).toBe(String(!v5Defaults));
  });
  it('opens on first token, collapses once, and preserves a manual decision', () => {
    start(v5Defaults, { variant: 'row', grouped: false, autoExpand: true }); vi.useFakeTimers();
    inject('tool1', 'running'); expect(header('tool1').getAttribute('aria-expanded')).toBe('false');
    inject('tool1', 'running', ['one']); expect(header('tool1').getAttribute('aria-expanded')).toBe('true');
    inject('tool1', 'complete', ['one']); vi.advanceTimersByTime(1000); expect(header('tool1').getAttribute('aria-expanded')).toBe('false');
    header('tool1').click(); expect(header('tool1').getAttribute('aria-expanded')).toBe('true');
    inject('tool1', 'complete', ['one']); vi.advanceTimersByTime(2000); expect(header('tool1').getAttribute('aria-expanded')).toBe('true');
  });
  it('cancels pending collapse on clear and supports reused message IDs', () => {
    start(v5Defaults, { variant: 'row', grouped: false, autoExpand: true }); vi.useFakeTimers();
    inject('tool1', 'running', ['one']); inject('tool1', 'complete', ['one']); controller.clearChat();
    inject('tool1', 'running', ['new']); vi.advanceTimersByTime(1100); expect(header('tool1').getAttribute('aria-expanded')).toBe('true');
    controller.destroy(); vi.advanceTimersByTime(1100);
  });
  it('groups consecutive calls with a collapsible label and staggered children', () => {
    start(v5Defaults, { variant: 'row', grouped: true, groupedMode: 'collapsible' });
    inject('tool1', 'complete', ['one']); inject('tool2', 'complete', ['two']);
    const group = mount.querySelector('[data-persona-tool-group]')!;
    expect(group.querySelector('button')?.textContent).toContain('Search (2)');
    const children = group.querySelectorAll<HTMLElement>('.persona-activity-group-child'); expect(children).toHaveLength(2);
    expect(children[1].style.getPropertyValue('--persona-activity-stagger')).toBe('40ms');
    const chevron = () => header('tool-group-tool1').querySelector('.persona-activity-chevron')!.outerHTML;
    const collapsedChevron = chevron();
    expect(header('tool-group-tool1').querySelector('svg[stroke="currentColor"]')).not.toBeNull();
    header('tool-group-tool1').click(); expect(header('tool-group-tool1').getAttribute('aria-expanded')).toBe('true');
    expect(chevron()).not.toBe(collapsedChevron);
    header('tool-group-tool1').click();
    expect(header('tool-group-tool1').getAttribute('aria-expanded')).toBe('false');
    expect(chevron()).toBe(collapsedChevron);
    controller.injectTestMessage({ type: 'message', message: { id: 'text3', sequence: 3, role: 'assistant', content: 'Break', createdAt: '2026-01-01T00:00:00Z' } });
    inject('tool4', 'complete', ['four']); expect(mount.querySelectorAll('[data-persona-tool-group]')).toHaveLength(1);
  });
  it('honors explicit static display and content renderers', () => {
    start(v5Defaults, { variant: 'row', grouped: false, expandable: false });
    inject('tool1', 'running', ['one']); expect(header('tool1').hasAttribute('data-expand-header')).toBe(false);
  });
  it('uses the same first-token lifecycle for reasoning', () => {
    controller = createAgentExperience(mount, { future: { v5Defaults }, apiUrl: '/test', persistState: false, launcher: { enabled: false }, features: { reasoningDisplay: { variant: 'row', autoExpand: true, autoCollapseDelay: 50 } } });
    vi.useFakeTimers();
    const m: AgentWidgetMessage = { id: 'r1', role: 'assistant', content: '', createdAt: '2026-01-01', variant: 'reasoning', reasoning: { id: 'r1', status: 'streaming', chunks: ['Thinking'] } };
    controller.injectTestMessage({ type: 'message', message: m }); expect(header('r1').getAttribute('aria-expanded')).toBe('true');
    controller.injectTestMessage({ type: 'message', message: { ...m, reasoning: { ...m.reasoning!, status: 'complete' } } });
    vi.advanceTimersByTime(50); expect(header('r1').getAttribute('aria-expanded')).toBe('false');
  });
});

it('copies current tool output after a streaming DOM update', async () => {
  start(true, { grouped: false });
  const writeText = vi.fn().mockResolvedValue(undefined);
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  try {
    inject('tool1', 'running', ['first']);
    header('tool1').click();
    inject('tool1', 'complete', ['updated output']);
    mount.querySelector<HTMLButtonElement>('[data-persona-copy-tool-detail]')!.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('updated output');
    expect(header('tool1').getAttribute('aria-expanded')).toBe('true');
  } finally {
    if (original) Object.defineProperty(navigator, 'clipboard', original);
    else Reflect.deleteProperty(navigator, 'clipboard');
  }
});

it('keeps group icon overrides separate from actual child icons and custom label content', () => {
  controller = createAgentExperience(mount, { apiUrl: '/test', persistState: false, launcher: { enabled: false }, future: { v5Defaults: true },
    features: { toolCallDisplay: { grouped: true, groupBoundary: 'iteration', groupIconVisibility: 'always', iconVisibility: 'never' } },
    toolCall: { renderGroupedSummary: () => { const icon = document.createElement('i'); icon.dataset.customIcon = 'true'; return icon; } } });
  inject('tool1', 'complete', ['one']); inject('tool2', 'complete', ['two']);
  expect(header('tool-group-tool1').querySelector('.persona-activity-icon')).not.toBeNull();
  expect(header('tool-group-tool1').querySelector('[data-custom-icon]')).not.toBeNull();
  expect(header('tool1').querySelector('.persona-activity-icon')).toBeNull();
});

it.each(['stack', 'summary', 'collapsible'] as const)('collapses %s activity locally without invoking grouped summary renderers', groupedMode => {
  const renderGroupedSummary = vi.fn(() => 'Custom activity');
  controller = createAgentExperience(mount, { apiUrl: '/test', persistState: false, launcher: { enabled: false }, future: { v5Defaults: true },
    features: { toolCallDisplay: { grouped: true, groupedMode, groupBoundary: 'iteration', autoExpand: true } },
    toolCall: { renderGroupedSummary } });
  vi.useFakeTimers();
  inject('tool1', 'running', ['one']); inject('tool2', 'running', ['two']);
  inject('tool1', 'complete', ['one']); inject('tool2', 'complete', ['two']);
  const callsBeforeCollapse = renderGroupedSummary.mock.calls.length;
  expect(callsBeforeCollapse).toBeGreaterThan(0);
  vi.advanceTimersByTime(1000);
  expect(renderGroupedSummary).toHaveBeenCalledTimes(callsBeforeCollapse);
  if (groupedMode === 'collapsible') expect(header('tool-group-tool1').getAttribute('aria-expanded')).toBe('false');
  if (groupedMode !== 'summary') expect(header('tool1').getAttribute('aria-expanded')).toBe('false');
});

it.each(['stack', 'summary', 'collapsible'] as const)('manages loading effects on %s group labels, tools and reasoning through updates and completion', groupedMode => {
  const started: { kind: string; element: HTMLElement; update: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }[] = [];
  controller = createAgentExperience(mount, { apiUrl: '/test', persistState: false, launcher: { enabled: false }, future: { v5Defaults: true },
    features: { toolCallDisplay: { grouped: true, groupedMode, groupBoundary: 'iteration' } },
    loadingLabel: { animate: ({ element, kind }) => {
      expect(element.isConnected).toBe(true);
      const entry = { element, kind, update: vi.fn(), destroy: vi.fn() }; started.push(entry); return entry;
    } } });
  inject('tool1', 'running', ['one']); inject('tool2', 'running', ['two']);
  const group = started.find(entry => entry.kind === 'tool-group')!;
  expect(group).toBeDefined();
  inject('tool2', 'running', ['two']);
  expect(started.filter(entry => entry.kind === 'tool-group')).toHaveLength(1);
  expect(group.update).toHaveBeenCalledWith(expect.objectContaining({ text: 'Search (2)' }));
  expect(started.filter(entry => entry.kind === 'tool')).toHaveLength(groupedMode === 'summary' ? 0 : 2);
  inject('tool1', 'complete', ['one']); inject('tool2', 'complete', ['two']);
  for (const entry of started) expect(entry.destroy).toHaveBeenCalledTimes(1);
  const message: AgentWidgetMessage = { id: 'r1', role: 'assistant', content: '', createdAt: '2026-01-01', variant: 'reasoning', reasoning: { id: 'r1', status: 'streaming', chunks: ['Thinking'] } };
  controller.injectTestMessage({ type: 'message', message });
  const reason = started.find(entry => entry.kind === 'reasoning')!;
  expect(reason).toBeDefined();
  controller.injectTestMessage({ type: 'message', message: { ...message, reasoning: { ...message.reasoning!, chunks: ['More thinking'] } } });
  expect(reason.update).toHaveBeenCalled();
  controller.injectTestMessage({ type: 'message', message: { ...message, reasoning: { ...message.reasoning!, status: 'complete' } } });
  expect(reason.destroy).toHaveBeenCalledTimes(1);
});

it('keeps open singleton details visible when a second tool forms a group, then respects a manual group close', () => {
  start(true, { groupBoundary: 'iteration', autoExpand: false, autoCollapseDelay: false });
  inject('tool1', 'running', ['first output']);
  expect(mount.querySelector('[data-persona-tool-group]')).toBeNull();
  const toolHeader = header('tool1');
  toolHeader.click();
  expect(toolHeader.getAttribute('aria-expanded')).toBe('true');
  inject('tool2', 'running', ['second output']);
  expect(header('tool1')).toBe(toolHeader);
  expect(toolHeader.getAttribute('aria-expanded')).toBe('true');
  const groupHeader = header('tool-group-tool1');
  expect(groupHeader.getAttribute('aria-expanded')).toBe('true');
  expect(groupHeader.nextElementSibling?.getAttribute('style') ?? '').not.toContain('display: none');
  groupHeader.click();
  inject('tool1', 'running', ['first output', 'more output']);
  expect(header('tool-group-tool1')).toBe(groupHeader);
  expect(groupHeader.getAttribute('aria-expanded')).toBe('false');
  expect(toolHeader.getAttribute('aria-expanded')).toBe('true');
});

it('preserves manually opened singleton details after group completion without disabling automatic groups', () => {
  start(true, { groupBoundary: 'iteration', autoExpand: false, autoCollapseDelay: 100 });
  vi.useFakeTimers();
  inject('tool1', 'running', ['one']);
  header('tool1').click();
  inject('tool2', 'running', ['two']);
  inject('tool1', 'complete', ['one']);
  inject('tool2', 'complete', ['two']);
  vi.advanceTimersByTime(200);
  expect(header('tool-group-tool1').getAttribute('aria-expanded')).toBe('true');
  expect(header('tool1').getAttribute('aria-expanded')).toBe('true');
});

it('changes reasoning layout and appearance live without resetting manual disclosure or custom summaries', () => {
  const renderCollapsedSummary = () => { const element = document.createElement('em'); element.textContent = 'Host summary'; return element; };
  controller = createAgentExperience(mount, { apiUrl: '/test', persistState: false, launcher: { enabled: false }, future: { v5Defaults: true }, reasoning: { renderCollapsedSummary }, features: { reasoningDisplay: { layout: undefined, appearance: undefined } } });
  const message: AgentWidgetMessage = { id: 'r1', role: 'assistant', content: '', createdAt: '2026-01-01', variant: 'reasoning', reasoning: { id: 'r1', status: 'complete', chunks: ['Trace details'] } };
  controller.injectTestMessage({ type: 'message', message });
  expect(header('r1').getAttribute('aria-expanded')).toBe('false');
  expect(header('r1').parentElement?.dataset.appearance).toBe('inset');
  header('r1').click();
  for (const layout of ['row', 'card'] as const) for (const appearance of ['plain', 'inset', 'panel'] as const) {
    controller.update({ features: { reasoningDisplay: { layout, appearance } } });
    const bubble = header('r1').parentElement!;
    expect(bubble.classList.contains('persona-activity-row')).toBe(layout === 'row');
    expect(bubble.dataset.appearance).toBe(appearance);
    expect(bubble.querySelector('em')?.textContent).toBe('Host summary');
    expect(header('r1').getAttribute('aria-expanded')).toBe('true');
    expect(bubble.querySelector<HTMLElement>('.persona-border-t')?.inert).not.toBe(true);
  }
  controller.update({ features: { reasoningDisplay: { layout: undefined, appearance: undefined } } });
  expect(header('r1').parentElement?.dataset.appearance).toBe('inset');
  expect(header('r1').parentElement?.classList.contains('persona-activity-row')).toBe(true);
  expect(header('r1').getAttribute('aria-expanded')).toBe('true');
});

it.each([false, true])('updates group appearance across layouts without losing summaries or disclosure state (V5 %s)', v5Defaults => {
  start(v5Defaults, { grouped: true, groupedMode: 'collapsible', autoExpand: false, autoCollapseDelay: false });
  controller.update({ toolCall: { renderGroupedSummary: () => {
    const label = document.createElement('em'); label.textContent = 'Host activity'; return label;
  } } });
  inject('tool1', 'complete', ['one']); inject('tool2', 'complete', ['two']);
  header('tool-group-tool1').click();
  if (header('tool1').getAttribute('aria-expanded') === 'false') header('tool1').click();
  for (const groupedMode of ['collapsible', 'stack'] as const) {
    for (const groupAppearance of ['inset', 'plain', undefined] as const) {
      controller.update({ features: { toolCallDisplay: { groupedMode, groupAppearance } } });
      const group = mount.querySelector<HTMLElement>('[data-persona-tool-group]')!;
      expect(group.parentElement?.dataset.groupAppearance).toBe(groupAppearance ?? (v5Defaults ? 'inset' : undefined));
      expect(group.querySelector('em')?.textContent).toBe('Host activity');
      expect(group.querySelector('[data-persona-tool-group-stack]')).not.toBeNull();
      expect(header('tool1').getAttribute('aria-expanded')).toBe('true');
      if (groupedMode === 'collapsible') expect(header('tool-group-tool1').getAttribute('aria-expanded')).toBe('true');
    }
  }
  controller.update({ features: { toolCallDisplay: { groupedMode: 'summary', groupAppearance: 'inset' } } });
  expect(mount.querySelector('[data-persona-tool-group-stack]')).toBeNull();
  expect(mount.querySelector('[data-persona-tool-group] em')?.textContent).toBe('Host activity');
});
