import { describe, expect, it } from 'vitest';
import type { AgentWidgetConfig } from '../types';
import { getActiveTheme } from '../utils/theme';
import { ThemeEditorState } from './state';

describe('authored config exports', () => {
  it('round-trips attachment presentation, dark colors, and explicit reset', () => {
    const state = new ThemeEditorState(undefined, { apiUrl: '/chat' });
    state.set('attachments.preview.file.layout', 'horizontal');
    state.set('attachments.preview.file.remove.visibility', 'hover');
    state.set('attachments.preview.image.fit', 'contain');
    state.set('attachments.preview.image.layout', 'chip');
    state.set('attachments.preview.image.name', 'full');
    state.set('attachments.preview.file.iconName', 'code-xml');
    state.set('attachments.preview.file.iconPlacement', 'center');
    state.set('theme.components.attachment.composer.image.chip.width', '200px');
    state.set('darkTheme.components.attachment.composer.file.remove.hoverBackground', '#333');
    state.set('composer.attachmentLayout', 'single-row');
    state.set('theme.components.attachment.composer.image.width', '112px');
    state.set('darkTheme.components.attachment.composer.remove.foreground', '#fff');
    const exported = state.exportAuthoredConfig().config;
    const restored = new ThemeEditorState(undefined, JSON.parse(JSON.stringify(exported)));
    expect(restored.exportAuthoredConfig().config).toEqual(exported);
    expect(restored.get('attachments.preview.file.layout')).toBe('horizontal');
    expect(restored.get('attachments.preview.image.layout')).toBe('chip');
    expect(restored.get('attachments.preview.file.iconName')).toBe('code-xml');
    expect(restored.get('theme.components.attachment.composer.image.chip.width')).toBe('200px');
    expect(restored.get('darkTheme.components.attachment.composer.file.remove.hoverBackground')).toBe('#333');
    expect(restored.get('attachments.preview.file.remove.visibility')).toBe('hover');
    expect(restored.get('darkTheme.components.attachment.composer.remove.foreground')).toBe('#fff');
    restored.set('attachments.preview.file.remove.visibility', undefined);
    expect(restored.exportAuthoredConfig().config.attachments?.preview?.file?.layout).toBe('horizontal');
    expect(restored.exportAuthoredConfig().config.attachments?.preview?.file?.remove?.visibility).toBeUndefined();
  });

  it.each([false, true])('round-trips sparse brand and light/dark edits in V5=%s', v5Defaults => {
    const input: Partial<AgentWidgetConfig> = {
      apiUrl: '/chat', future: { v5Defaults }, brand: { accent: '#7c3aed' },
    };
    const state = new ThemeEditorState(undefined, input);
    state.set('theme.components.composer.send.foreground', '#fff');
    state.set('darkTheme.components.composer.send.foreground', '#eee');
    const exported = state.exportAuthoredConfig();
    expect(exported.origin).toBe('authored');
    expect(exported.config).toEqual({
      ...input, theme: { components: { composer: { send: { foreground: '#fff' } } } },
      darkTheme: { components: { composer: { send: { foreground: '#eee' } } } },
    });
    expect(exported.config).not.toHaveProperty('launcher');
    const restored = new ThemeEditorState(undefined, JSON.parse(JSON.stringify(exported.config)));
    for (const colorScheme of ['light', 'dark'] as const) {
      expect(getActiveTheme({ ...restored.getConfig(), colorScheme })).toEqual(getActiveTheme({ ...state.getConfig(), colorScheme }));
    }
    expect(state.exportSnapshot().version).toBe(2);
    expect(state.exportSnapshot().config.launcher).toBeDefined();
  });

  it('retains explicit default-equal values, empty lists, false, and callbacks in memory', () => {
    const callback = () => ({ Authorization: 'example' });
    const state = new ThemeEditorState(undefined, {
      apiUrl: '/chat', getHeaders: callback, debug: false, colorScheme: 'light',
      suggestionChips: [], suggestions: { starters: { items: [] } },
      future: { v5Defaults: false },
    });
    state.set('theme.components.header.controlSize', '32px');
    const result = state.exportAuthoredConfig().config;
    expect(result.getHeaders).toBe(callback);
    expect(result).toMatchObject({ debug: false, colorScheme: 'light', suggestionChips: [], future: { v5Defaults: false } });
    expect(result.theme?.components?.header?.controlSize).toBe('32px');
    if (result.suggestions?.starters) result.suggestions.starters.items = ['mutated'];
    expect(state.exportAuthoredConfig().config.suggestions?.starters?.items).toEqual([]);
    expect(Object.getOwnPropertySymbols(result)).toEqual([]);
  });

  it('preserves callback identity through undo/redo even when JSON snapshots are identical', () => {
    const first = () => ({});
    const second = () => ({ Authorization: 'changed' });
    const state = new ThemeEditorState(undefined, { getHeaders: first });
    state.set('getHeaders', second);
    state.undo();
    expect(state.exportAuthoredConfig().config.getHeaders).toBe(first);
    state.redo();
    expect(state.exportAuthoredConfig().config.getHeaders).toBe(second);
  });

  it('keeps unknown-origin legacy backups explicit across undo/redo', () => {
    const state = new ThemeEditorState(undefined, { apiUrl: '/chat' });
    const snapshot = state.exportSnapshot();
    snapshot.config.launcher = { closeButtonColor: '#6b7280' };
    state.importSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(state.exportAuthoredConfig().origin).toBe('imported');
    expect(state.exportAuthoredConfig().config.launcher?.closeButtonColor).toBe('#6b7280');
    expect(state.exportAuthoredConfig().config.theme).toEqual(snapshot.theme);
    state.undo();
    expect(state.exportAuthoredConfig()).toEqual({ origin: 'authored', config: { apiUrl: '/chat' } });
    state.redo();
    expect(state.exportAuthoredConfig().origin).toBe('imported');
  });

  it('handles config-only theme replacements and whole-theme removal without stale duplicate inputs', () => {
    const state = new ThemeEditorState(undefined, { theme: { components: { composer: { send: { foreground: 'red' } } } } });
    state.setFullConfig({ apiUrl: '/chat', theme: { components: { composer: { send: { foreground: 'blue' } } } } });
    expect(state.get('theme.components.composer.send.foreground')).toBe('blue');
    expect(state.exportAuthoredConfig().config.theme?.components?.composer?.send?.foreground).toBe('blue');
    state.set('theme', undefined);
    expect(state.exportAuthoredConfig().config).not.toHaveProperty('theme');
    state.undo();
    expect(state.exportAuthoredConfig().config.theme?.components?.composer?.send?.foreground).toBe('blue');
  });

  it('notifies raw-theme import listeners with final sparse imported intent', () => {
    const state = new ThemeEditorState(undefined, { apiUrl: '/chat' });
    let duringNotification: unknown;
    state.onChange(() => { duringNotification = state.exportAuthoredConfig(); });
    state.importSnapshot({ components: { panel: { borderRadius: '20px' } } });
    expect(duringNotification).toEqual({ origin: 'imported', config: { apiUrl: '/chat', theme: { components: { panel: { borderRadius: '20px' } } } } });
  });
});
