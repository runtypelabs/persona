/** Centralized state management for the theme configurator */

import type { AgentWidgetConfig, AgentWidgetMessage } from '@runtypelabs/persona';
import type { PersonaTheme } from '@runtypelabs/persona';
import {
  createAgentExperience,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  createTheme,
  applyThemeVariables,
  migrateV1Theme,
} from '@runtypelabs/persona';
import type { AgentWidgetController } from '@runtypelabs/persona';
import { parseActionResponse } from '../middleware';

// ─── Constants ──────────────────────────────────────────────────────
const STORAGE_KEY = 'persona-widget-config-v2';
const STORAGE_KEY_V1 = 'persona-widget-config';
const EDITOR_UI_STORAGE_KEY = 'persona-theme-editor-ui';

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl =
  import.meta.env.VITE_PROXY_URL
    ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch`
    : `http://localhost:${proxyPort}/api/chat/dispatch`;

export type ParserType = 'plain' | 'json' | 'regex-json' | 'xml';
const MB = 1024 * 1024;

// ─── Default config builder ────────────────────────────────────────
export const getDefaultConfig = (): AgentWidgetConfig => ({
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl: proxyUrl,
  parserType: 'plain',
  initialMessages: [
    {
      id: 'sample-1',
      role: 'assistant',
      content:
        'Welcome! This is a sample message to help you preview your theme configuration. Try asking a question to see how it looks!',
      createdAt: new Date().toISOString(),
    },
  ],
  postprocessMessage: ({ text, streaming, message }) => {
    if (message.role === 'assistant' && !message.variant) {
      const trimmed = text.trim();
      const looksLikeJson = trimmed.startsWith('{');

      if (streaming) {
        if (looksLikeJson) return '';
        return markdownPostprocessor(text);
      } else {
        if (looksLikeJson) {
          const action = parseActionResponse(text);
          if (action && action.action === 'message' && action.text) {
            return markdownPostprocessor(action.text);
          } else if (action && 'text' in action && action.text) {
            return markdownPostprocessor(action.text);
          }
        }
      }
    }
    return markdownPostprocessor(text);
  },
} as AgentWidgetConfig);

// ─── Editor UI state (Editing, Preview, Theme Behavior) ───────────────
export type EditingTheme = 'light' | 'dark';
export type PreviewMode = 'light' | 'dark' | 'system';
export type PreviewShellMode = 'light' | 'dark';
export type PreviewDevice = 'desktop' | 'mobile';
export type PreviewScene = 'home' | 'conversation' | 'minimized';
export type EditorMode = 'basic' | 'advanced';

let editingTheme: EditingTheme = 'light';
let previewMode: PreviewMode = 'system';
let previewDevice: PreviewDevice = 'desktop';
let previewScene: PreviewScene = 'conversation';
let editorMode: EditorMode = 'basic';
let previewBackgroundUrl = '';

// ─── Store singleton ────────────────────────────────────────────────
let currentConfig: AgentWidgetConfig = getDefaultConfig();
let currentTheme: PersonaTheme = createTheme();
let widgetController: AgentWidgetController | null = null;
let previewElement: HTMLElement | null = null;
let updateTimeout: number | null = null;
let savedSnapshot: ConfiguratorSnapshot | null = null;
let history: ConfiguratorSnapshot[] = [];
let historyIndex = -1;
let suppressHistory = false;

type ConfigChangeListener = (config: AgentWidgetConfig, theme: PersonaTheme) => void;
const listeners: ConfigChangeListener[] = [];

export interface ConfiguratorSnapshot {
  version: 2;
  config: Record<string, any>;
  theme: PersonaTheme;
}

const PREVIEW_STORAGE_ADAPTER = {
  load: () => null,
  save: () => {},
  clear: () => {},
};

const HOME_PREVIEW_SUGGESTION_CHIPS = [
  'How do I get started?',
  'Pricing & plans',
  'Talk to support',
];

function createPreviewMessages(scene: PreviewScene): AgentWidgetMessage[] {
  if (scene === 'home') {
    return [
      {
        id: 'preview-home-1',
        role: 'assistant',
        content: 'Hi there! How can we help today?',
        createdAt: new Date().toISOString(),
      },
    ];
  }

  if (scene === 'minimized') {
    return [
      {
        id: 'preview-minimized-1',
        role: 'assistant',
        content: 'We are here whenever you are ready.',
        createdAt: new Date().toISOString(),
      },
    ];
  }

  return [
    {
      id: 'preview-conversation-1',
      role: 'assistant',
      content: 'Hello! How can I help you today?',
      createdAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    },
    {
      id: 'preview-conversation-2',
      role: 'user',
      content: 'I want to customize the theme editor preview.',
      createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    },
    {
      id: 'preview-conversation-3',
      role: 'assistant',
      content: 'Absolutely. Adjust colors, typography, and component tokens to see changes instantly.',
      createdAt: new Date(Date.now() - 60 * 1000).toISOString(),
    },
  ];
}

function applyPreviewSceneConfig(
  base: AgentWidgetConfig,
  scene: PreviewScene
): AgentWidgetConfig {
  const launcher = {
    ...base.launcher,
    enabled: true,
    autoExpand: scene !== 'minimized',
  };

  return {
    ...base,
    launcher,
    suggestionChips:
      scene === 'home'
        ? (base.suggestionChips?.length ? base.suggestionChips : HOME_PREVIEW_SUGGESTION_CHIPS)
        : base.suggestionChips,
    initialMessages: createPreviewMessages(scene),
    storageAdapter: PREVIEW_STORAGE_ADAPTER,
  } as AgentWidgetConfig;
}

// ─── Initialize ─────────────────────────────────────────────────────
export function initStore(previewMount?: HTMLElement): AgentWidgetController | null {
  // Store reference before createAgentExperience changes the element's id
  previewElement = previewMount ?? null;
  widgetController = null;
  currentConfig = getDefaultConfig();
  currentTheme = createTheme();
  editingTheme = 'light';
  previewMode = 'system';
  previewDevice = 'desktop';
  previewScene = 'conversation';
  editorMode = 'basic';
  previewBackgroundUrl = '';
  history = [];
  historyIndex = -1;
  savedSnapshot = null;

  // Try to load saved config
  const saved = loadFromStorage();
  if (saved) {
    currentConfig = saved.config;
    currentTheme = saved.theme;
  }
  syncThemeIntoConfig();

  const savedUi = loadEditorUiFromStorage();
  if (savedUi) {
    editingTheme = savedUi.editingTheme;
    previewMode = savedUi.previewMode;
    previewDevice = savedUi.previewDevice;
    previewScene = savedUi.previewScene;
    editorMode = savedUi.editorMode;
    previewBackgroundUrl = savedUi.previewBackgroundUrl ?? '';
  }

  if (previewMount) {
    widgetController = createAgentExperience(previewMount, getEffectivePreviewConfig());
    applyThemeToWidget();
  }

  if (history.length === 0) {
    pushHistorySnapshot(exportSnapshot(), true);
  }
  savedSnapshot ??= exportSnapshot();

  return widgetController;
}

export function getController(): AgentWidgetController | null {
  return widgetController;
}

// ─── Config access ──────────────────────────────────────────────────
export function getConfig(): AgentWidgetConfig {
  return currentConfig;
}

export function getTheme(): PersonaTheme {
  return currentTheme;
}

export function getEditingTheme(): EditingTheme {
  return editingTheme;
}

export function setEditingTheme(value: EditingTheme): void {
  editingTheme = value;
  saveEditorUiToStorage();
  notifyListeners();
}

export function getPreviewMode(): PreviewMode {
  return previewMode;
}

export function setPreviewMode(value: PreviewMode): void {
  previewMode = value;
  saveEditorUiToStorage();
  applyThemeToWidget();
  if (widgetController) {
    widgetController.update(getEffectivePreviewConfig());
  }
  notifyListeners();
}

export function getPreviewDevice(): PreviewDevice {
  return previewDevice;
}

export function setPreviewDevice(value: PreviewDevice): void {
  previewDevice = value;
  saveEditorUiToStorage();
  notifyListeners();
}

export function getPreviewScene(): PreviewScene {
  return previewScene;
}

export function setPreviewScene(value: PreviewScene): void {
  previewScene = value;
  saveEditorUiToStorage();
  notifyListeners();
}

export function getEditorMode(): EditorMode {
  return editorMode;
}

export function setEditorMode(value: EditorMode): void {
  editorMode = value;
  saveEditorUiToStorage();
  notifyListeners();
}

export function getPreviewBackgroundUrl(): string {
  return previewBackgroundUrl;
}

export function setPreviewBackgroundUrl(value: string): void {
  previewBackgroundUrl = value;
  saveEditorUiToStorage();
  notifyListeners();
}

/** Config with colorScheme overridden for preview based on previewMode */
export function buildPreviewConfig(
  snapshot: ConfiguratorSnapshot = exportSnapshot(),
  mode: PreviewMode = previewMode,
  scene: PreviewScene = previewScene
): AgentWidgetConfig {
  const base = normalizeConfig({
    ...(snapshot.config ?? {}),
    theme: snapshot.theme,
  });
  const sanitizedSuggestionChips = sanitizeSuggestionChipsForOutput(base.suggestionChips);
  const colorScheme =
    mode === 'light' ? 'light' : mode === 'dark' ? 'dark' : (base.colorScheme ?? 'light');

  return applyPreviewSceneConfig(
    {
      ...base,
      suggestionChips: sanitizedSuggestionChips,
      theme: snapshot.theme as AgentWidgetConfig['theme'],
      colorScheme,
    },
    scene
  );
}

function detectSystemPreviewShellMode(): PreviewShellMode {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return 'dark';
  }

  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)')?.matches) {
    return 'dark';
  }

  return 'light';
}

/**
 * Light/dark chrome for the preview iframe document (mock page + shell CSS).
 * Intentionally ignores the widget config's `colorScheme` so editing that field
 * does not change shell metadata → avoids full srcdoc remount on every tweak.
 * The widget still receives the real effective `colorScheme` via `buildPreviewConfig` + `controller.update`.
 */
export function resolvePreviewShellMode(
  _snapshot: ConfiguratorSnapshot = exportSnapshot(),
  mode: PreviewMode = previewMode,
  _scene: PreviewScene = previewScene
): PreviewShellMode {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  return detectSystemPreviewShellMode();
}

/** Config with colorScheme overridden for preview based on previewMode */
export function getEffectivePreviewConfig(): AgentWidgetConfig {
  return buildPreviewConfig();
}

export function exportSnapshot(): ConfiguratorSnapshot {
  return {
    version: 2,
    config: serializeConfig(currentConfig),
    theme: currentTheme,
  };
}

export function getConfigForOutput(): AgentWidgetConfig {
  return {
    ...currentConfig,
    suggestionChips: sanitizeSuggestionChipsForOutput(currentConfig.suggestionChips),
  } as AgentWidgetConfig;
}

function pushHistorySnapshot(snapshot: ConfiguratorSnapshot, replaceCurrent = false): void {
  if (suppressHistory) return;

  const serialized = JSON.stringify(snapshot);
  const currentSerialized =
    historyIndex >= 0 && history[historyIndex] ? JSON.stringify(history[historyIndex]) : null;

  if (replaceCurrent && historyIndex >= 0) {
    history[historyIndex] = snapshot;
    return;
  }

  if (serialized === currentSerialized) return;

  history = history.slice(0, historyIndex + 1);
  history.push(snapshot);
  historyIndex = history.length - 1;
}

function recordHistory(): void {
  pushHistorySnapshot(exportSnapshot());
}

export function canUndo(): boolean {
  return historyIndex > 0;
}

export function canRedo(): boolean {
  return historyIndex >= 0 && historyIndex < history.length - 1;
}

export function getHistoryLength(): number {
  return history.length;
}

export function getHistoryIndex(): number {
  return historyIndex;
}

function restoreSnapshot(snapshot: ConfiguratorSnapshot): void {
  suppressHistory = true;
  currentConfig = normalizeConfig(snapshot.config);
  currentTheme = createTheme(snapshot.theme, { validate: false });
  syncThemeIntoConfig();
  suppressHistory = false;
  applyThemeToWidget();
  immediateWidgetUpdate();
}

export function undo(): void {
  if (!canUndo()) return;
  historyIndex -= 1;
  restoreSnapshot(history[historyIndex]);
}

export function redo(): void {
  if (!canRedo()) return;
  historyIndex += 1;
  restoreSnapshot(history[historyIndex]);
}

export function getSavedSnapshot(): ConfiguratorSnapshot | null {
  return savedSnapshot;
}

export function markSavedSnapshot(): void {
  savedSnapshot = exportSnapshot();
  notifyListeners();
}

/**
 * Get a value from config using a dot-path.
 * Paths starting with 'theme.' go into the light PersonaTheme.
 * Paths starting with 'darkTheme.' go into the dark PersonaTheme.
 * Other paths go into the AgentWidgetConfig object.
 */
export function get(path: string): any {
  if (path.startsWith('theme.')) {
    return getByPath(currentTheme, path.replace('theme.', ''));
  }
  if (path.startsWith('darkTheme.')) {
    return getByPath(currentConfig.darkTheme ?? {}, path.replace('darkTheme.', ''));
  }
  return getByPath(currentConfig, path);
}

/**
 * Set a value in config using a dot-path.
 * Paths starting with 'theme.' go into the light PersonaTheme.
 * Paths starting with 'darkTheme.' go into the dark PersonaTheme.
 */
export function set(path: string, value: any): void {
  if (path.startsWith('theme.')) {
    const themePath = path.replace('theme.', '');
    currentTheme = setByPath(currentTheme, themePath, value) as PersonaTheme;
    syncThemeIntoConfig();
    recordHistory();
    applyThemeToWidget();
    debouncedSave();
    notifyListeners();
  } else if (path.startsWith('darkTheme.')) {
    const themePath = path.replace('darkTheme.', '');
    const dark = currentConfig.darkTheme ?? createTheme();
    currentConfig = {
      ...currentConfig,
      darkTheme: setByPath(dark, themePath, value) as AgentWidgetConfig['darkTheme'],
    };
    recordHistory();
    applyThemeToWidget();
    debouncedUpdate();
  } else {
    currentConfig = setByPath(currentConfig, path, value) as AgentWidgetConfig;
    recordHistory();
    debouncedUpdate();
  }
}

/**
 * Set a value and update immediately (for presets, non-debounced changes).
 */
export function setImmediate(path: string, value: any): void {
  if (path.startsWith('theme.')) {
    const themePath = path.replace('theme.', '');
    currentTheme = setByPath(currentTheme, themePath, value) as PersonaTheme;
    syncThemeIntoConfig();
    recordHistory();
    applyThemeToWidget();
    saveToStorage();
    notifyListeners();
  } else if (path.startsWith('darkTheme.')) {
    const themePath = path.replace('darkTheme.', '');
    const dark = currentConfig.darkTheme ?? createTheme();
    currentConfig = {
      ...currentConfig,
      darkTheme: setByPath(dark, themePath, value) as AgentWidgetConfig['darkTheme'],
    };
    recordHistory();
    applyThemeToWidget();
    immediateWidgetUpdate();
  } else {
    currentConfig = setByPath(currentConfig, path, value) as AgentWidgetConfig;
    recordHistory();
    immediateWidgetUpdate();
  }
}

/** Batch-set multiple paths at once (immediate update) */
export function setBatch(updates: Record<string, any>): void {
  let themeChanged = false;
  let darkThemeChanged = false;
  let configChanged = false;

  for (const [path, value] of Object.entries(updates)) {
    if (path.startsWith('theme.')) {
      const themePath = path.replace('theme.', '');
      currentTheme = setByPath(currentTheme, themePath, value) as PersonaTheme;
      themeChanged = true;
    } else if (path.startsWith('darkTheme.')) {
      const themePath = path.replace('darkTheme.', '');
      const dark = currentConfig.darkTheme ?? createTheme();
      currentConfig = {
        ...currentConfig,
        darkTheme: setByPath(dark, themePath, value) as AgentWidgetConfig['darkTheme'],
      };
      darkThemeChanged = true;
    } else {
      currentConfig = setByPath(currentConfig, path, value) as AgentWidgetConfig;
      configChanged = true;
    }
  }

  if (themeChanged) {
    syncThemeIntoConfig();
  }
  if (themeChanged || darkThemeChanged || configChanged) {
    recordHistory();
  }
  if (themeChanged || darkThemeChanged || configChanged) {
    applyThemeToWidget();
  }
  if (configChanged || darkThemeChanged) {
    immediateWidgetUpdate();
  } else if (themeChanged) {
    saveToStorage();
    notifyListeners();
  }
}

/** Replace the entire theme */
export function setTheme(theme: PersonaTheme): void {
  currentTheme = theme;
  syncThemeIntoConfig();
  recordHistory();
  applyThemeToWidget();
  saveToStorage();
  notifyListeners();
}

/** Replace the entire config (for preset loading) */
export function setFullConfig(config: AgentWidgetConfig, theme?: PersonaTheme): void {
  currentConfig = normalizeConfig(config);
  if (theme) {
    currentTheme = theme;
  }
  syncThemeIntoConfig();
  recordHistory();
  applyThemeToWidget();
  immediateWidgetUpdate();
}

export function importSnapshot(snapshot: unknown): void {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('Snapshot must be a JSON object');
  }

  const parsed = snapshot as Partial<ConfiguratorSnapshot> & { config?: any; theme?: any };

  if ('config' in parsed || 'theme' in parsed || parsed.version === 2) {
    const config = normalizeConfig(parsed.config ?? currentConfig);
    const theme = createTheme(parsed.theme ?? currentTheme, { validate: false });
    setFullConfig(config, theme);
    return;
  }

  const theme = createTheme(parsed as Partial<PersonaTheme>, { validate: false });
  setTheme(theme);
}

/** Reset to defaults */
export function resetToDefaults(): void {
  currentConfig = getDefaultConfig();
  currentTheme = createTheme();
  syncThemeIntoConfig();
  history = [];
  historyIndex = -1;
  pushHistorySnapshot(exportSnapshot());
  savedSnapshot = exportSnapshot();
  applyThemeToWidget();
  immediateWidgetUpdate();
  clearStorage();
}

// ─── Listeners ──────────────────────────────────────────────────────
export function onChange(listener: ConfigChangeListener): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener(currentConfig, currentTheme);
  }
}

// ─── Widget updates ─────────────────────────────────────────────────
function applyThemeToWidget(): void {
  if (!previewElement) return;
  applyThemeVariables(previewElement, getEffectivePreviewConfig());
}

function syncThemeIntoConfig(): void {
  currentConfig = {
    ...currentConfig,
    theme: currentTheme as AgentWidgetConfig['theme'],
  };
}

function debouncedUpdate(): void {
  if (updateTimeout !== null) {
    clearTimeout(updateTimeout);
  }
  updateTimeout = window.setTimeout(() => {
    if (widgetController) {
      widgetController.update(getEffectivePreviewConfig());
    }
    saveToStorage();
    notifyListeners();
  }, 300);
}

function debouncedSave(): void {
  if (updateTimeout !== null) {
    clearTimeout(updateTimeout);
  }
  updateTimeout = window.setTimeout(() => {
    saveToStorage();
  }, 300);
}

function immediateWidgetUpdate(): void {
  if (updateTimeout !== null) {
    clearTimeout(updateTimeout);
    updateTimeout = null;
  }
  if (widgetController) {
    widgetController.update(getEffectivePreviewConfig());
  }
  saveToStorage();
  notifyListeners();
}

// ─── Persistence ────────────────────────────────────────────────────
function serializeConfig(config: AgentWidgetConfig): any {
  let parserType: ParserType = config.parserType ?? 'plain';
  if (!config.parserType && config.streamParser) {
    const parserStr = config.streamParser.toString();
    if (parserStr.includes('createJsonStreamParser')) parserType = 'json';
    else if (parserStr.includes('createRegexJsonParser')) parserType = 'regex-json';
    else if (parserStr.includes('createXmlParser')) parserType = 'xml';
  }

  return {
    ...config,
    postprocessMessage: undefined,
    streamParser: undefined,
    initialMessages: undefined,
    theme: undefined, // theme is stored separately in v2
    parserType,
    suggestionChips: sanitizeSuggestionChipsForOutput(config.suggestionChips),
  };
}

function normalizeConfig(configLike: any, defaults: AgentWidgetConfig = getDefaultConfig()): AgentWidgetConfig {
  const config = configLike ?? {};
  const rawStatus = config.statusIndicator ?? {};
  const rawLauncher = config.launcher ?? {};
  const rawLayout = config.layout ?? {};
  const rawAttachments = config.attachments ?? defaults.attachments;

  return {
    ...defaults,
    ...config,
    parserType: config.parserType ?? defaults.parserType ?? 'plain',
    streamParser: undefined,
    sendButton: { ...defaults.sendButton, ...config.sendButton },
    statusIndicator: {
      ...defaults.statusIndicator,
      ...rawStatus,
      idleText: rawStatus.idleText ?? rawStatus.onlineText ?? defaults.statusIndicator?.idleText,
      connectingText: rawStatus.connectingText ?? defaults.statusIndicator?.connectingText,
      connectedText: rawStatus.connectedText ?? defaults.statusIndicator?.connectedText,
      errorText: rawStatus.errorText ?? rawStatus.offlineText ?? defaults.statusIndicator?.errorText,
    },
    launcher: {
      ...defaults.launcher,
      ...rawLauncher,
      dock: {
        ...defaults.launcher?.dock,
        ...rawLauncher.dock,
      },
      clearChat: {
        ...defaults.launcher?.clearChat,
        ...rawLauncher.clearChat,
      },
    },
    copy: { ...defaults.copy, ...config.copy },
    voiceRecognition: { ...defaults.voiceRecognition, ...config.voiceRecognition },
    features: { ...defaults.features, ...config.features },
    layout: {
      ...defaults.layout,
      ...rawLayout,
      header: {
        ...defaults.layout?.header,
        ...rawLayout.header,
      },
      messages: {
        ...defaults.layout?.messages,
        ...rawLayout.messages,
        avatar: {
          ...defaults.layout?.messages?.avatar,
          ...rawLayout.messages?.avatar,
        },
        timestamp: {
          ...defaults.layout?.messages?.timestamp,
          ...rawLayout.messages?.timestamp,
        },
      },
    },
    markdown: {
      ...defaults.markdown,
      ...config.markdown,
      options: {
        ...defaults.markdown?.options,
        ...config.markdown?.options,
      },
    },
    messageActions: { ...defaults.messageActions, ...config.messageActions },
    suggestionChips: normalizeSuggestionChips(config.suggestionChips, defaults.suggestionChips ?? []),
    suggestionChipsConfig: { ...defaults.suggestionChipsConfig, ...config.suggestionChipsConfig },
    attachments: rawAttachments
      ? {
          ...defaults.attachments,
          ...rawAttachments,
          maxFiles:
            rawAttachments.maxFiles !== undefined
              ? Number(rawAttachments.maxFiles)
              : defaults.attachments?.maxFiles,
          maxFileSize: normalizeAttachmentMaxFileSize(
            rawAttachments.maxFileSize,
            defaults.attachments?.maxFileSize
          ),
          allowedTypes: normalizeAllowedTypes(
            rawAttachments.allowedTypes,
            defaults.attachments?.allowedTypes
          ),
        }
      : rawAttachments,
  } as AgentWidgetConfig;
}

function normalizeSuggestionChips(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  if (value && typeof value === 'object' && Array.isArray((value as any).chips)) {
    return (value as any).chips.filter((item: unknown): item is string => typeof item === 'string');
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch {
      // Ignore malformed legacy values and fall back to defaults.
    }
  }

  return fallback;
}

function sanitizeSuggestionChipsForOutput(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeAttachmentMaxFileSize(value: unknown, fallback?: number): number | undefined {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric < 1024 ? numeric * MB : numeric;
}

function normalizeAllowedTypes(value: unknown, fallback?: string[]): string[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return fallback;
}

function saveToStorage(): void {
  try {
    const data = {
      version: 2,
      config: serializeConfig(currentConfig),
      theme: currentTheme,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save config:', error);
  }
}

function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_V1);
    localStorage.removeItem(EDITOR_UI_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

interface EditorUiState {
  editingTheme: EditingTheme;
  previewMode: PreviewMode;
  previewDevice: PreviewDevice;
  previewScene: PreviewScene;
  editorMode: EditorMode;
  previewBackgroundUrl?: string;
}

function saveEditorUiToStorage(): void {
  try {
    localStorage.setItem(
      EDITOR_UI_STORAGE_KEY,
      JSON.stringify({ editingTheme, previewMode, previewDevice, previewScene, editorMode, previewBackgroundUrl })
    );
  } catch {
    // Ignore
  }
}

function loadEditorUiFromStorage(): EditorUiState | null {
  try {
    const raw = localStorage.getItem(EDITOR_UI_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      (parsed.editingTheme === 'light' || parsed.editingTheme === 'dark') &&
      (parsed.previewMode === 'light' || parsed.previewMode === 'dark' || parsed.previewMode === 'system') &&
      (parsed.previewDevice === 'desktop' ||
        parsed.previewDevice === 'mobile') &&
      (parsed.previewScene === 'home' ||
        parsed.previewScene === 'conversation' ||
        parsed.previewScene === 'minimized') &&
      (parsed.editorMode === 'basic' || parsed.editorMode === 'advanced')
    ) {
      return {
        editingTheme: parsed.editingTheme,
        previewMode: parsed.previewMode,
        previewDevice: parsed.previewDevice,
        previewScene: parsed.previewScene,
        editorMode: parsed.editorMode,
        previewBackgroundUrl: typeof parsed.previewBackgroundUrl === 'string' ? parsed.previewBackgroundUrl : '',
      };
    }
  } catch {
    // Ignore
  }
  return null;
}

interface StorageResult {
  config: AgentWidgetConfig;
  theme: PersonaTheme;
}

function loadFromStorage(): StorageResult | null {
  try {
    // Try v2 format first
    const v2Saved = localStorage.getItem(STORAGE_KEY);
    if (v2Saved) {
      const parsed = JSON.parse(v2Saved);
      if (parsed.version === 2) {
        const config = normalizeConfig(parsed.config);
        const theme = createTheme(parsed.theme, { validate: false });
        return { config, theme };
      }
    }

    // Try v1 format and migrate
    const v1Saved = localStorage.getItem(STORAGE_KEY_V1);
    if (v1Saved) {
      const parsed = JSON.parse(v1Saved);
      const config = normalizeConfig({
        ...parsed,
        parserType: parsed.parserType ?? (parsed as any)._parserType ?? 'plain',
      });

      // Migrate v1 theme to v2
      const v2ThemePartial = migrateV1Theme(parsed.theme, { warn: false });
      const theme = createTheme(v2ThemePartial, { validate: false });

      // Save in v2 format going forward
      localStorage.removeItem(STORAGE_KEY_V1);
      return { config, theme };
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
  return null;
}

// ─── Dot-path utilities ─────────────────────────────────────────────
function getByPath(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

function setByPath(obj: any, path: string, value: any): any {
  const parts = path.split('.');
  if (parts.length === 1) {
    return { ...obj, [parts[0]]: value };
  }

  const [first, ...rest] = parts;
  return {
    ...obj,
    [first]: setByPath(obj?.[first] ?? {}, rest.join('.'), value),
  };
}

// ─── Parser type helpers (re-exported from old code) ────────────────
export function getParserTypeFromConfig(config: AgentWidgetConfig): ParserType {
  if (config.parserType) return config.parserType as ParserType;
  if (config.streamParser) {
    const parserStr = config.streamParser.toString();
    if (parserStr.includes('createJsonStreamParser')) return 'json';
    if (parserStr.includes('createRegexJsonParser')) return 'regex-json';
    if (parserStr.includes('createXmlParser')) return 'xml';
  }
  return 'plain';
}
