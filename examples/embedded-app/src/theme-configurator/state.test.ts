// @vitest-environment jsdom

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

const mockController = { update: vi.fn() };
const originalMatchMedia = window.matchMedia;

function mockMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

vi.mock('@runtypelabs/persona', () => ({
  createAgentExperience: vi.fn(() => mockController),
  markdownPostprocessor: vi.fn((x: string) => x),
  DEFAULT_WIDGET_CONFIG: {
    apiUrl: 'http://test',
    parserType: 'plain',
    launcher: {
      enabled: true,
      clearChat: {},
      mountMode: 'floating',
      dock: { side: 'right', width: '420px', collapsedWidth: '72px' },
    },
  },
  createTheme: vi.fn((config?: Record<string, unknown>) => config ?? {}),
  applyThemeVariables: vi.fn(),
  migrateV1Theme: vi.fn((x: unknown) => x),
}));

vi.mock('../middleware', () => ({
  parseActionResponse: vi.fn(() => null),
}));

import * as state from './state';

describe('theme configurator state - editor ui, preview fixtures, and history', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.className = '';
    localStorage.clear();
    mockMatchMedia(false);
    mockController.update.mockReset();
    const mount = document.createElement('div');
    mount.id = 'widget-preview';
    document.body.appendChild(mount);
    state.initStore(mount);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.className = '';
    localStorage.clear();
    if (originalMatchMedia) {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      });
    } else {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: undefined,
      });
    }
  });

  test('editingTheme defaults to light and can be updated', () => {
    expect(state.getEditingTheme()).toBe('light');
    state.setEditingTheme('dark');
    expect(state.getEditingTheme()).toBe('dark');
    state.setEditingTheme('light');
    expect(state.getEditingTheme()).toBe('light');
  });

  test('previewMode defaults to system and can be updated', () => {
    expect(state.getPreviewMode()).toBe('system');
    state.setPreviewMode('light');
    expect(state.getPreviewMode()).toBe('light');
    state.setPreviewMode('dark');
    expect(state.getPreviewMode()).toBe('dark');
    state.setPreviewMode('system');
    expect(state.getPreviewMode()).toBe('system');
  });

  test('getEffectivePreviewConfig overrides colorScheme based on previewMode', () => {
    state.set('colorScheme', 'auto');
    state.setPreviewMode('light');
    const configLight = state.getEffectivePreviewConfig();
    expect(configLight.colorScheme).toBe('light');

    state.setPreviewMode('dark');
    const configDark = state.getEffectivePreviewConfig();
    expect(configDark.colorScheme).toBe('dark');

    state.setPreviewMode('system');
    const configSystem = state.getEffectivePreviewConfig();
    expect(configSystem.colorScheme).toBe('auto');
  });

  test('resolvePreviewShellMode returns light for explicit light preview mode', () => {
    state.set('colorScheme', 'auto');

    expect(state.resolvePreviewShellMode(undefined, 'light', 'conversation')).toBe('light');
  });

  test('resolvePreviewShellMode returns dark for explicit dark preview mode', () => {
    state.set('colorScheme', 'auto');

    expect(state.resolvePreviewShellMode(undefined, 'dark', 'conversation')).toBe('dark');
  });

  test('resolvePreviewShellMode ignores widget colorScheme when preview mode is system (prefers light)', () => {
    state.set('colorScheme', 'dark');
    mockMatchMedia(false);

    expect(state.resolvePreviewShellMode(undefined, 'system', 'conversation')).toBe('light');
  });

  test('resolvePreviewShellMode ignores widget colorScheme when preview mode is system (prefers dark)', () => {
    state.set('colorScheme', 'light');
    mockMatchMedia(true);

    expect(state.resolvePreviewShellMode(undefined, 'system', 'conversation')).toBe('dark');
  });

  test('resolvePreviewShellMode uses dark media preference when preview mode is system', () => {
    state.set('colorScheme', 'auto');
    mockMatchMedia(true);

    expect(state.resolvePreviewShellMode(undefined, 'system', 'conversation')).toBe('dark');
  });

  test('resolvePreviewShellMode uses light media preference when preview mode is system', () => {
    state.set('colorScheme', 'auto');
    mockMatchMedia(false);

    expect(state.resolvePreviewShellMode(undefined, 'system', 'conversation')).toBe('light');
  });

  test('darkTheme paths are supported in get/set', () => {
    state.set('darkTheme.palette.colors.primary.500', '#ff0000');
    expect(state.get('darkTheme.palette.colors.primary.500')).toBe('#ff0000');
  });

  test('preview device and scene defaults can be updated', () => {
    expect(state.getPreviewDevice()).toBe('desktop');
    expect(state.getPreviewScene()).toBe('conversation');

    state.setPreviewDevice('mobile');
    state.setPreviewScene('home');

    expect(state.getPreviewDevice()).toBe('mobile');
    expect(state.getPreviewScene()).toBe('home');
  });

  test('editor mode defaults to basic and can be updated', () => {
    expect(state.getEditorMode()).toBe('basic');
    state.setEditorMode('advanced');
    expect(state.getEditorMode()).toBe('advanced');
    state.setEditorMode('basic');
    expect(state.getEditorMode()).toBe('basic');
  });

  test('buildPreviewConfig injects home preview fixtures in open launcher mode without mutating exported config', () => {
    const previewConfig = state.buildPreviewConfig(undefined, 'system', 'home');

    expect(previewConfig.launcher?.enabled).toBe(true);
    expect(previewConfig.launcher?.autoExpand).toBe(true);
    expect(previewConfig.suggestionChips?.length).toBeGreaterThan(0);
    expect(previewConfig.initialMessages?.length).toBe(1);

    const exported = state.exportSnapshot();
    expect(exported.config.initialMessages).toBeUndefined();
  });

  test('buildPreviewConfig preserves custom suggestion chips in home preview', () => {
    state.set('suggestionChips', ['New suggestion', 'Pricing']);

    const previewConfig = state.buildPreviewConfig(undefined, 'system', 'home');

    expect(previewConfig.suggestionChips).toEqual(['New suggestion', 'Pricing']);
  });

  test('buildPreviewConfig filters blank suggestion chips from preview output', () => {
    state.set('suggestionChips', ['  ', 'Pricing', '', ' Help ']);

    const previewConfig = state.buildPreviewConfig(undefined, 'system', 'home');

    expect(previewConfig.suggestionChips).toEqual(['Pricing', 'Help']);
  });

  test('getConfigForOutput omits blank suggestion chips from exports', () => {
    state.set('suggestionChips', ['  ', 'Pricing', '', ' Help ']);

    expect(state.getConfigForOutput().suggestionChips).toEqual(['Pricing', 'Help']);
  });

  test('buildPreviewConfig prepares minimized scene in launcher mode', () => {
    const previewConfig = state.buildPreviewConfig(undefined, 'dark', 'minimized');

    expect(previewConfig.colorScheme).toBe('dark');
    expect(previewConfig.launcher?.enabled).toBe(true);
    expect(previewConfig.launcher?.autoExpand).toBe(false);
  });

  test('buildPreviewConfig keeps conversation scene open in launcher mode', () => {
    const previewConfig = state.buildPreviewConfig(undefined, 'light', 'conversation');

    expect(previewConfig.launcher?.enabled).toBe(true);
    expect(previewConfig.launcher?.autoExpand).toBe(true);
    expect(previewConfig.initialMessages?.length).toBeGreaterThan(1);
  });

  test('buildPreviewConfig preserves dock config and merges dock defaults', () => {
    state.set('launcher.mountMode', 'docked');
    state.set('launcher.dock.side', 'left');
    state.set('launcher.dock.width', '480px');

    const previewConfig = state.buildPreviewConfig(undefined, 'light', 'conversation');

    expect(previewConfig.launcher?.mountMode).toBe('docked');
    expect(previewConfig.launcher?.dock?.side).toBe('left');
    expect(previewConfig.launcher?.dock?.width).toBe('480px');
    expect(previewConfig.launcher?.dock?.collapsedWidth).toBe('72px');
  });

  test('undo and redo restore snapshot history', () => {
    const initial = state.get('theme.palette.colors.primary.500');
    state.set('theme.palette.colors.primary.500', '#123456');
    expect(state.get('theme.palette.colors.primary.500')).toBe('#123456');

    expect(state.canUndo()).toBe(true);
    state.undo();
    expect(state.get('theme.palette.colors.primary.500')).toBe(initial);

    expect(state.canRedo()).toBe(true);
    state.redo();
    expect(state.get('theme.palette.colors.primary.500')).toBe('#123456');
  });

  test('previewBackgroundUrl defaults to empty and can be updated', () => {
    expect(state.getPreviewBackgroundUrl()).toBe('');
    state.setPreviewBackgroundUrl('https://example.com');
    expect(state.getPreviewBackgroundUrl()).toBe('https://example.com');
    state.setPreviewBackgroundUrl('');
    expect(state.getPreviewBackgroundUrl()).toBe('');
  });

  test('previewBackgroundUrl persists to localStorage', () => {
    state.setPreviewBackgroundUrl('https://example.com');

    const raw = localStorage.getItem('persona-theme-editor-ui');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.previewBackgroundUrl).toBe('https://example.com');
  });

  test('previewBackgroundUrl is restored from localStorage on init', () => {
    localStorage.setItem(
      'persona-theme-editor-ui',
      JSON.stringify({
        editingTheme: 'light',
        previewMode: 'system',
        previewDevice: 'desktop',
        previewScene: 'conversation',
        editorMode: 'basic',
        previewBackgroundUrl: 'https://restored.com',
      })
    );

    const mount = document.createElement('div');
    mount.id = 'widget-preview-2';
    document.body.appendChild(mount);
    state.initStore(mount);

    expect(state.getPreviewBackgroundUrl()).toBe('https://restored.com');
  });

  test('saved snapshot can be updated and later retrieved for compare mode', () => {
    const initialSaved = state.getSavedSnapshot();
    expect(initialSaved).not.toBeNull();

    state.set('theme.palette.colors.primary.500', '#654321');
    state.markSavedSnapshot();

    const saved = state.getSavedSnapshot();
    expect(saved?.theme?.palette?.colors?.primary?.['500']).toBe('#654321');
  });
});
