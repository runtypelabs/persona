// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { activityDuration, updateActivityElapsed, createActivityLifecycle } from './activity-row';
import { createToolBubble } from './tool-bubble';
import { createReasoningBubble } from './reasoning-bubble';
import { mergeWithDefaults } from '../defaults';
import { mergeConfigUpdate } from '../utils/config-merge';
import type { AgentWidgetConfig, AgentWidgetMessage } from '../types';
const message = (status: 'pending' | 'running' | 'complete' = 'running', chunks: string[] = []): AgentWidgetMessage => ({ id: 'tool', role: 'assistant', content: '', createdAt: '2026-01-01', variant: 'tool', toolCall: { id: 'tool', name: 'Search', status, chunks, durationMs: 65000 } });
afterEach(() => vi.useRealTimers());
describe.each([false, true])('activity rows (V5 %s)', v5Defaults => {
  it('defaults to the selected variant and supports explicit overrides', () => {
    const config = { future: { v5Defaults } };
    expect(createToolBubble(message(), config).classList.contains('persona-activity-row')).toBe(v5Defaults);
    for (const variant of ['card', 'row'] as const) {
      const node = createToolBubble(message('complete'), { ...config, features: { toolCallDisplay: { variant } } });
      expect(node.classList.contains('persona-activity-row')).toBe(variant === 'row');
      if (variant === 'row') { expect(node.textContent).toContain('Used Search'); expect(node.querySelector('.persona-activity-duration')).toBeNull(); }
    }
  });
  it('resolves icon visibility and removes the icon slot on successful completion', () => {
    for (const kind of ['tool', 'reasoning'] as const) {
      for (const mode of [undefined, 'always', 'active', 'never'] as const) {
        const key = kind === 'tool' ? 'toolCallDisplay' : 'reasoningDisplay';
        const config = { future: { v5Defaults }, features: { [key]: { variant: 'row' as const, iconVisibility: mode } } };
        const m = message('complete');
        const node = kind === 'tool' ? createToolBubble(m, config) : createReasoningBubble({ ...m, toolCall: undefined, variant: 'reasoning', reasoning: { id: 'r', status: 'complete', chunks: ['Details'] } }, config);
        expect(!!node.querySelector('.persona-activity-icon')).toBe((mode ?? (v5Defaults ? 'active' : 'always')) === 'always');
        expect(node.querySelector('.persona-activity-chevron')).not.toBeNull();
      }
    }
  });
  it('keeps attention and active indicators unless explicitly disabled', () => {
    for (const status of ['pending', 'running', 'complete'] as const) {
      const m = message(status); if (status === 'complete') m.toolCall!.success = false;
      for (const iconVisibility of ['active', 'never'] as const) {
        const node = createToolBubble(m, { future: { v5Defaults }, features: { toolCallDisplay: { variant: 'row', iconVisibility } } });
        expect(!!node.querySelector('.persona-activity-icon')).toBe(iconVisibility === 'active');
      }
    }
  });
  it('keeps custom content and exposes accessible row controls', () => {
    const node = createToolBubble(message(), { future: { v5Defaults }, features: { toolCallDisplay: { variant: 'row' } }, toolCall: { renderCollapsedSummary: () => 'Custom summary' } });
    expect(node.textContent?.replace(/\u00a0/g, ' ')).toContain('Custom summary');
    const button = node.querySelector('button')!;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe(node.querySelector('.persona-activity-body')?.id);
    expect(Array.from(button.children).map(el => el.className)).toEqual(expect.arrayContaining(['persona-activity-icon']));
    expect(button.children[1].classList.contains('persona-activity-label')).toBe(true);
    expect(button.children[2].classList.contains('persona-activity-chevron')).toBe(true);
  });
  it('formats completed reasoning and retains card override', () => {
    const m: AgentWidgetMessage = { ...message(), variant: 'reasoning', toolCall: undefined, reasoning: { id: 'r', status: 'complete', chunks: ['Details'], durationMs: 100 } };
    const node = createReasoningBubble(m, { future: { v5Defaults }, features: { reasoningDisplay: { variant: 'row' } } });
    expect(node.textContent).toContain('Thought for a moment');
  });
  it('keeps card headers without a leading completion icon', () => {
    const m = message('complete'); m.toolCall!.name = 'Read';
    for (const iconName of [undefined, 'check', 'file-text']) {
      const node = createToolBubble(m, { future: { v5Defaults }, features: { toolCallDisplay: { layout: 'card', iconVisibility: 'always' } }, toolCall: { iconName } });
      expect(node.querySelector('.persona-activity-icon')).toBeNull();
    }
  });
});
it.each([['pending', 'pending'], ['running', 'running'], ['complete', 'done']] as const)('maps %s status to %s', (status, expected) => {
  const node = createToolBubble(message(status), { features: { toolCallDisplay: { variant: 'row' } } });
  expect(node.dataset.activityState).toBe(expected);
  expect(node.querySelector('.persona-activity-icon svg')).not.toBeNull();
});
it('maps failure, denied, and approval-waiting icons', () => {
  const m = message('complete'); m.toolCall!.success = false;
  expect(createToolBubble(m, { future: { v5Defaults: true } }).dataset.activityState).toBe('error');
  for (const status of ['denied', 'pending'] as const) {
    m.approval = { id: 'a', status, agentId: 'a', executionId: 'e', toolName: 'Search', description: '' };
    expect(createToolBubble(m, { future: { v5Defaults: true } }).dataset.activityState).toBe(status === 'denied' ? 'denied' : 'awaiting-approval');
  }
});
it('formats short and multi-minute durations', () => {
  expect([undefined, 200, 12000, 65000].map(activityDuration)).toEqual(['a moment', 'a moment', '12s', '1m 5s']);
});
describe('activity lifecycle', () => {
  it('waits for a token and collapses exactly once after completion', () => {
    vi.useFakeTimers(); const changed = vi.fn(); const lifecycle = createActivityLifecycle(changed); const expanded = new Set<string>();
    lifecycle.observe(message(), 'tool', expanded); expect(expanded.size).toBe(0);
    lifecycle.observe(message('running', ['token']), 'tool', expanded); expect(expanded.has('tool')).toBe(true);
    lifecycle.observe(message('complete', ['token']), 'tool', expanded);
    vi.advanceTimersByTime(999); expect(expanded.has('tool')).toBe(true);
    vi.advanceTimersByTime(1); expect(expanded.size).toBe(0); expect(changed).toHaveBeenCalledTimes(1);
    expanded.add('tool'); lifecycle.observe(message('complete', ['token']), 'tool', expanded); vi.advanceTimersByTime(2000); expect(expanded.has('tool')).toBe(true);
  });
  it('manual control cancels automatic collapse and expansion', () => {
    vi.useFakeTimers(); const changed = vi.fn(); const lifecycle = createActivityLifecycle(changed); const expanded = new Set<string>();
    lifecycle.observe(message('running', ['token']), 'tool', expanded);
    lifecycle.observe(message('complete', ['token']), 'tool', expanded); lifecycle.manual('tool');
    vi.advanceTimersByTime(2000); expect(expanded.has('tool')).toBe(true); expect(changed).not.toHaveBeenCalled();
    lifecycle.clear(); expanded.clear(); lifecycle.manual('tool'); lifecycle.observe(message('running', ['token']), 'tool', expanded); expect(expanded.size).toBe(0);
  });
  it('supports disabling automatics and cleans pending timers on clear/prune', () => {
    vi.useFakeTimers(); const changed = vi.fn(); const lifecycle = createActivityLifecycle(changed); const expanded = new Set<string>();
    lifecycle.observe(message('running', ['token']), 'tool', expanded, { autoExpand: false, autoCollapseDelay: false });
    lifecycle.observe(message('complete', ['token']), 'tool', expanded, { autoCollapseDelay: false });
    expect(expanded.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
    for (const cleanup of ['clear', 'prune'] as const) {
      lifecycle.clear(); lifecycle.observe(message('running', ['token']), 'tool', expanded); lifecycle.observe(message('complete', ['token']), 'tool', expanded);
      if (cleanup === 'clear') lifecycle.clear(); else lifecycle.prune(new Set());
      vi.advanceTimersByTime(2000); expect(changed).not.toHaveBeenCalled();
    }
  });
});

it('cancels a completion timer on resumed activity, then rearms without reopening', () => {
  vi.useFakeTimers(); const changed = vi.fn(); const lifecycle = createActivityLifecycle(changed); const expanded = new Set<string>();
  lifecycle.observe(message('running', ['one']), 'tool', expanded);
  lifecycle.observe(message('complete', ['one']), 'tool', expanded, { autoCollapseDelay: 100 });
  vi.advanceTimersByTime(50);
  lifecycle.observe(message('running', ['two']), 'tool', expanded);
  vi.advanceTimersByTime(100); expect(expanded.has('tool')).toBe(true); expect(changed).not.toHaveBeenCalled();
  lifecycle.observe(message('complete', ['two']), 'tool', expanded, { autoCollapseDelay: 100 });
  vi.advanceTimersByTime(100); expect(expanded.size).toBe(0); expect(changed).toHaveBeenCalledTimes(1);
  lifecycle.observe(message('running', ['three']), 'tool', expanded); expect(expanded.size).toBe(0);
  lifecycle.manual('tool'); lifecycle.observe(message('complete', ['three']), 'tool', expanded);
  vi.advanceTimersByTime(2000); expect(changed).toHaveBeenCalledTimes(1);
});

// Automatic timing never takes ownership of host-authored labels or elapsed elements.
it('supports timing modes on live rerender without a detail duration footer', () => {
  const m = message('complete'); m.toolCall!.duration = 12789;
  for (const durationDisplay of ['none', 'tools', 'group', 'all', undefined] as const) {
    const node = createToolBubble(m, { future: { v5Defaults: true }, features: { toolCallDisplay: { durationDisplay } } }, new Set(['tool']));
    expect(node.querySelector('.persona-activity-duration')?.textContent ?? '').toBe(durationDisplay === 'tools' || durationDisplay === 'all' ? '12s' : '');
    expect(node.textContent).not.toContain('Duration:');
  }
});
it.each([undefined, 700, -1, NaN, Infinity])('omits automatic short/unknown/invalid timing (%s)', durationMs => {
  const m = message('complete'); m.toolCall!.durationMs = durationMs;
  expect(createToolBubble(m, { future: { v5Defaults: true }, features: { toolCallDisplay: { durationDisplay: 'tools' } } }).querySelector('.persona-activity-duration')?.textContent).toBe('');
});
it('ticks automatic whole seconds while preserving authored elapsed precision', () => {
  const automatic = document.createElement('span'); automatic.className = 'persona-activity-duration'; automatic.dataset.toolElapsed = '1000';
  expect(formatActivityElapsed(automatic, 1700)).toBe('');
  expect(formatActivityElapsed(automatic, 13789)).toBe('12s');
  expect(formatActivityElapsed(automatic, 66000)).toBe('1m 5s');
  const authored = document.createElement('span'); authored.dataset.toolElapsed = '1000';
  expect(formatActivityElapsed(authored, 3700)).toBe('2.7s');
  authored.dataset.toolElapsed = '0'; authored.textContent = 'Host duration';
  expect(formatActivityElapsed(authored, 3700)).toBe('Host duration');
});
it('retains authored duration placeholders and custom timer elements with automatic timing off', () => {
  const m = message('running'); m.toolCall!.startedAt = Date.now() - 2500;
  const node = createToolBubble(m, { future: { v5Defaults: true }, toolCall: { activeTextTemplate: 'Running {toolName} {duration}' } });
  expect(node.querySelector('[data-tool-elapsed]')).not.toBeNull();
  expect(node.querySelector('.persona-activity-duration')).toBeNull();
  let authored: HTMLElement | undefined;
  const custom = createToolBubble(m, { future: { v5Defaults: true }, toolCall: { renderCollapsedSummary: ({ createElapsedElement }) => authored = createElapsedElement() } });
  expect(custom.contains(authored!)).toBe(true);
  expect(formatActivityElapsed(authored!, Number(authored!.dataset.toolElapsed) + 2700)).toBe('2s');
});

it('does not create a live automatic timer for invalid or future starts', () => {
  vi.useFakeTimers(); vi.setSystemTime(10000);
  for (const startedAt of [0, -1, NaN, Infinity, 11000, undefined]) {
    const m = message(); m.toolCall!.startedAt = startedAt; m.toolCall!.durationMs = undefined;
    const node = createToolBubble(m, { future: { v5Defaults: true }, features: { toolCallDisplay: { durationDisplay: 'tools' } } });
    expect(node.querySelector('[data-tool-elapsed]')).toBeNull();
    expect(node.querySelector('.persona-activity-duration')?.textContent).toBe('');
  }
});

function formatActivityElapsed(span: HTMLElement, now: number) {
  updateActivityElapsed(span, now);
  return span.textContent;
}


describe.each([false, true])('reasoning layout and appearance (V5 %s)', v5Defaults => {
  const reasoning: AgentWidgetMessage = { id: 'reason', role: 'assistant', content: '', createdAt: '2026-01-01', variant: 'reasoning', reasoning: { id: 'reason', status: 'complete', chunks: ['Details'] }, turnActivity: { id: 'turn', kind: 'progress' } };
  it.each(['plain', 'inset', 'panel'] as const)('renders %s on the existing disclosure body in both layouts', appearance => {
    for (const layout of ['row', 'card'] as const) {
      const node = createReasoningBubble(reasoning, { future: { v5Defaults }, features: { reasoningDisplay: { layout, appearance } } }, new Set(['reason']));
      expect(node.dataset.appearance).toBe(appearance);
      expect(node.classList.contains('persona-activity-row')).toBe(layout === 'row');
      expect(node.querySelectorAll('button')).toHaveLength(1);
      expect(node.querySelectorAll('.persona-border-t')).toHaveLength(1);
      expect(node.querySelector(':scope > .persona-border-t')?.textContent).toBe('Details');
      expect(node.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
    }
  });
  it('preserves version defaults and explicit reasoning layout', () => {
    expect(createReasoningBubble(reasoning, { future: { v5Defaults }, features: { reasoningDisplay: { appearance: undefined } } }).dataset.appearance).toBe(v5Defaults ? 'inset' : 'panel');
    expect(createReasoningBubble(reasoning, { future: { v5Defaults }, features: { reasoningDisplay: { layout: 'row' } } }).dataset.appearance).toBe(v5Defaults ? 'inset' : 'plain');
  });
  it.each(['toolCallDisplay', 'reasoningDisplay'] as const)('preserves the shipped %s alias through defaults, turn scopes, and resets', key => {
    const build = (config: AgentWidgetConfig) => key === 'toolCallDisplay' ? createToolBubble({ ...message(), turnActivity: { id: 'turn', kind: 'progress' } }, config) : createReasoningBubble(reasoning, config);
    let config = mergeWithDefaults({ future: { v5Defaults }, turnActivity: { enabled: true }, features: { [key]: { variant: 'card' } } }) as AgentWidgetConfig;
    expect(build(config).classList.contains('persona-activity-row')).toBe(false);
    config = mergeConfigUpdate(config, { features: { [key]: { layout: 'row' } } });
    expect(build(config).classList.contains('persona-activity-row')).toBe(true);
    config = mergeConfigUpdate(config, { features: { [key]: { variant: 'row' } } });
    config = mergeConfigUpdate(config, { features: { [key]: { variant: 'card' } } });
    expect(build(config).classList.contains('persona-activity-row')).toBe(true);
    config = mergeConfigUpdate(config, { features: { [key]: { layout: undefined } } });
    expect(build(config).classList.contains('persona-activity-row')).toBe(false);
    config = mergeConfigUpdate(config, { features: { [key]: { variant: undefined } } });
    expect(build(config).classList.contains('persona-activity-row')).toBe(true);
  });
  it('lets authored choices override turn defaults for layout and reasoning appearance', () => {
    const config = mergeWithDefaults({ future: { v5Defaults }, turnActivity: { enabled: true }, features: { reasoningDisplay: { layout: 'card', appearance: 'plain' } } }) as AgentWidgetConfig;
    const node = createReasoningBubble(reasoning, config);
    expect(node.classList.contains('persona-activity-row')).toBe(false);
    expect(node.dataset.appearance).toBe('plain');
  });
});
