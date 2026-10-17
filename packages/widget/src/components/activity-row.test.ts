// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { activityDuration, createActivityLifecycle } from './activity-row';
import { createToolBubble } from './tool-bubble';
import { createReasoningBubble } from './reasoning-bubble';
import type { AgentWidgetMessage } from '../types';
const message = (status: 'pending' | 'running' | 'complete' = 'running', chunks: string[] = []): AgentWidgetMessage => ({ id: 'tool', role: 'assistant', content: '', createdAt: '2026-01-01', variant: 'tool', toolCall: { id: 'tool', name: 'Search', status, chunks, durationMs: 65000 } });
afterEach(() => vi.useRealTimers());
describe.each([false, true])('activity rows (V5 %s)', v5Defaults => {
  it('defaults to the selected variant and supports explicit overrides', () => {
    const config = { future: { v5Defaults } };
    expect(createToolBubble(message(), config).classList.contains('persona-activity-row')).toBe(v5Defaults);
    for (const variant of ['card', 'row'] as const) {
      const node = createToolBubble(message('complete'), { ...config, features: { toolCallDisplay: { variant } } });
      expect(node.classList.contains('persona-activity-row')).toBe(variant === 'row');
      if (variant === 'row') { expect(node.textContent).toContain('Used Search'); expect(node.textContent).toContain('1m 5s'); }
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
