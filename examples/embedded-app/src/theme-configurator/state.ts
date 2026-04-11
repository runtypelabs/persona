/** Centralized state management for the theme configurator.
 *  Delegates core state/history to ThemeEditorState from the headless core;
 *  adds widget controller integration, localStorage persistence, and editor UI state.
 */

import type { AgentWidgetConfig } from '@runtypelabs/persona';
import type { PersonaTheme } from '@runtypelabs/persona';
import {
  createAgentExperience,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  createTheme,
  applyThemeVariables,
} from '@runtypelabs/persona';
import type { AgentWidgetController } from '@runtypelabs/persona';
import { ThemeEditorState } from '@runtypelabs/persona/theme-editor';
import type { ConfiguratorSnapshot } from '@runtypelabs/persona/theme-editor';
import {
  PREVIEW_STORAGE_ADAPTER,
  HOME_SUGGESTION_CHIPS,
  appendPreviewTranscriptEntry,
  applySceneConfig,
  type PreviewTranscriptEntryPreset,
} from '@runtypelabs/persona/theme-editor';
import { parseActionResponse } from '../middleware';

// Re-export for consumers
export type { ConfiguratorSnapshot };

// ─── Constants ──────────────────────────────────────────────────────
const STORAGE_KEY = 'persona-widget-config-v2';
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
export type PreviewScene = 'home' | 'conversation' | 'minimized' | 'artifact';
export type EditorMode = 'basic' | 'advanced';

let editingTheme: EditingTheme = 'light';
let previewMode: PreviewMode = 'system';
let previewDevice: PreviewDevice = 'desktop';
let previewScene: PreviewScene = 'conversation';
let editorMode: EditorMode = 'basic';
let previewBackgroundUrl = '';
let previewTranscriptEntries: PreviewTranscriptEntryPreset[] = [];

// ─── Core state (delegated to ThemeEditorState) ─────────────────────
let core = new ThemeEditorState(undefined, getDefaultConfig(), { mergeDefaults: false });

// ─── Configurator-specific state ────────────────────────────────────
let widgetController: AgentWidgetController | null = null;
let previewElement: HTMLElement | null = null;
let updateTimeout: number | null = null;
let savedSnapshot: ConfiguratorSnapshot | null = null;

type ConfigChangeListener = (config: AgentWidgetConfig, theme: PersonaTheme) => void;
const listeners: ConfigChangeListener[] = [];

// ─── Initialize ─────────────────────────────────────────────────────
export function initStore(previewMount?: HTMLElement): AgentWidgetController | null {
  previewElement = previewMount ?? null;
  widgetController = null;
  editingTheme = 'light';
  previewMode = 'system';
  previewDevice = 'desktop';
  previewScene = 'conversation';
  editorMode = 'basic';
  previewBackgroundUrl = '';
  previewTranscriptEntries = [];
  savedSnapshot = null;

  // Try to load saved config, otherwise use defaults
  const saved = loadFromStorage();
  if (saved) {
    core = new ThemeEditorState(saved.theme, normalizeConfig(saved.config), { mergeDefaults: false });
  } else {
    core = new ThemeEditorState(undefined, getDefaultConfig(), { mergeDefaults: false });
  }

  // Restore editor UI state
  const savedUi = loadEditorUiFromStorage();
  if (savedUi) {
    editingTheme = savedUi.editingTheme;
    previewMode = savedUi.previewMode;
    previewDevice = savedUi.previewDevice;
    previewScene = savedUi.previewScene;
    editorMode = savedUi.editorMode;
    previewBackgroundUrl = savedUi.previewBackgroundUrl ?? '';
    previewTranscriptEntries = savedUi.previewTranscriptEntries ?? [];
  }

  if (previewMount) {
    widgetController = createAgentExperience(previewMount, getEffectivePreviewConfig());
    applyThemeToWidget();
  }

  savedSnapshot ??= exportSnapshot();

  return widgetController;
}

export function getController(): AgentWidgetController | null {
  return widgetController;
}

// ─── Config access (delegated to core) ──────────────────────────────
export function getConfig(): AgentWidgetConfig {
  return core.getConfig();
}

export function getTheme(): PersonaTheme {
  return core.getTheme();
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

export function getPreviewTranscriptEntries(): PreviewTranscriptEntryPreset[] {
  return [...previewTranscriptEntries];
}

export function addPreviewTranscriptEntry(value: PreviewTranscriptEntryPreset): void {
  previewTranscriptEntries = [...previewTranscriptEntries, value];
  saveEditorUiToStorage();
  notifyListeners();
}

export function clearPreviewTranscriptEntries(): void {
  previewTranscriptEntries = [];
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

  const appendedMessages = previewTranscriptEntries.reduce<NonNullable<AgentWidgetConfig['initialMessages']>>(
    (messages, preset) => appendPreviewTranscriptEntry(messages, preset),
    []
  );

  return applySceneConfig(
    {
      ...base,
      suggestionChips: sanitizedSuggestionChips,
      theme: snapshot.theme,
      colorScheme,
    },
    scene,
    appendedMessages
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

export function resolvePreviewShellMode(
  _snapshot: ConfiguratorSnapshot = exportSnapshot(),
  mode: PreviewMode = previewMode,
  _scene: PreviewScene = previewScene
): PreviewShellMode {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  return detectSystemPreviewShellMode();
}

export function getEffectivePreviewConfig(): AgentWidgetConfig {
  return buildPreviewConfig();
}

export function exportSnapshot(): ConfiguratorSnapshot {
  return {
    version: 2,
    config: serializeConfig(core.getConfig()),
    theme: core.getTheme(),
  };
}

export function getConfigForOutput(): AgentWidgetConfig {
  return {
    ...core.getConfig(),
    suggestionChips: sanitizeSuggestionChipsForOutput(core.getConfig().suggestionChips),
  } as AgentWidgetConfig;
}

// ─── History (delegated to core) ────────────────────────────────────
export function canUndo(): boolean {
  return core.canUndo();
}

export function canRedo(): boolean {
  return core.canRedo();
}

export function getHistoryLength(): number {
  return core.getHistoryLength();
}

export function getHistoryIndex(): number {
  return core.getHistoryIndex();
}

export function undo(): void {
  if (!core.canUndo()) return;
  core.undo();
  applyThemeToWidget();
  immediateWidgetUpdate();
}

export function redo(): void {
  if (!core.canRedo()) return;
  core.redo();
  applyThemeToWidget();
  immediateWidgetUpdate();
}

export function getSavedSnapshot(): ConfiguratorSnapshot | null {
  return savedSnapshot;
}

export function markSavedSnapshot(): void {
  savedSnapshot = exportSnapshot();
  notifyListeners();
}

// ─── State mutations (delegated to core + side effects) ─────────────

/**
 * Get a value from config using a dot-path.
 * Paths starting with 'theme.' go into the light PersonaTheme.
 * Paths starting with 'darkTheme.' go into the dark PersonaTheme.
 * Other paths go into the AgentWidgetConfig object.
 */
export function get(path: string): any {
  return core.get(path);
}

/**
 * Set a value in config using a dot-path (debounced widget update).
 */
export function set(path: string, value: any): void {
  core.set(path, value);
  if (path.startsWith('theme.')) {
    applyThemeToWidget();
    debouncedSave();
    notifyListeners();
  } else if (path.startsWith('darkTheme.')) {
    applyThemeToWidget();
    debouncedUpdate();
  } else {
    debouncedUpdate();
  }
}

/**
 * Set a value and update immediately (for presets, non-debounced changes).
 */
export function setImmediate(path: string, value: any): void {
  core.set(path, value);
  if (path.startsWith('theme.')) {
    applyThemeToWidget();
    saveToStorage();
    notifyListeners();
  } else if (path.startsWith('darkTheme.')) {
    applyThemeToWidget();
    immediateWidgetUpdate();
  } else {
    immediateWidgetUpdate();
  }
}

/** Batch-set multiple paths at once (immediate update) */
export function setBatch(updates: Record<string, any>): void {
  core.setBatch(updates);

  const hasTheme = Object.keys(updates).some(p => p.startsWith('theme.'));
  const hasDarkTheme = Object.keys(updates).some(p => p.startsWith('darkTheme.'));
  const hasConfig = Object.keys(updates).some(p => !p.startsWith('theme.') && !p.startsWith('darkTheme.'));

  if (hasTheme || hasDarkTheme) {
    applyThemeToWidget();
  }
  if (hasConfig || hasDarkTheme) {
    immediateWidgetUpdate();
  } else if (hasTheme) {
    saveToStorage();
    notifyListeners();
  }
}

/** Replace the entire theme */
export function setTheme(theme: PersonaTheme): void {
  core.setTheme(theme);
  applyThemeToWidget();
  saveToStorage();
  notifyListeners();
}

/** Replace the entire config (for preset loading) */
export function setFullConfig(config: AgentWidgetConfig, theme?: PersonaTheme): void {
  core.setFullConfig(normalizeConfig(config), theme);
  applyThemeToWidget();
  immediateWidgetUpdate();
}

export function importSnapshot(snapshot: unknown): void {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('Snapshot must be a JSON object');
  }

  const parsed = snapshot as Partial<ConfiguratorSnapshot> & { config?: any; theme?: any };

  if ('config' in parsed || 'theme' in parsed || parsed.version === 2) {
    const config = normalizeConfig(parsed.config ?? core.getConfig());
    const theme = createTheme(parsed.theme ?? core.getTheme(), { validate: false });
    setFullConfig(config, theme);
    return;
  }

  const theme = createTheme(parsed as Partial<PersonaTheme>, { validate: false });
  setTheme(theme);
}

/** Reset to defaults */
export function resetToDefaults(): void {
  core = new ThemeEditorState(undefined, getDefaultConfig(), { mergeDefaults: false });
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
    listener(core.getConfig(), core.getTheme());
  }
}

// ─── Widget updates ─────────────────────────────────────────────────
function applyThemeToWidget(): void {
  if (!previewElement) return;
  applyThemeVariables(previewElement, getEffectivePreviewConfig());
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

/** Former default launcher icon gray; drop so `theme.components.header.actionIconForeground` can apply. */
const LEGACY_LAUNCHER_HEADER_ICON_HEX = /^#6b7280$/i;

function normalizeConfig(configLike: any, defaults: AgentWidgetConfig = getDefaultConfig()): AgentWidgetConfig {
  const config = configLike ?? {};
  const rawStatus = config.statusIndicator ?? {};
  const rawLauncher = config.launcher ?? {};
  const rawLayout = config.layout ?? {};
  const rawAttachments = config.attachments ?? defaults.attachments;

  const mergedClearChat = {
    ...defaults.launcher?.clearChat,
    ...rawLauncher.clearChat,
  };
  if (
    typeof mergedClearChat.iconColor === 'string' &&
    LEGACY_LAUNCHER_HEADER_ICON_HEX.test(mergedClearChat.iconColor.trim())
  ) {
    delete (mergedClearChat as { iconColor?: string }).iconColor;
  }

  const mergedLauncher: Record<string, unknown> = {
    ...defaults.launcher,
    ...rawLauncher,
    dock: {
      ...defaults.launcher?.dock,
      ...rawLauncher.dock,
    },
    clearChat: mergedClearChat,
  };

  if (
    typeof mergedLauncher.closeButtonColor === 'string' &&
    LEGACY_LAUNCHER_HEADER_ICON_HEX.test(mergedLauncher.closeButtonColor.trim())
  ) {
    delete mergedLauncher.closeButtonColor;
  }

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
    launcher: mergedLauncher as AgentWidgetConfig['launcher'],
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
      config: serializeConfig(core.getConfig()),
      theme: core.getTheme(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save config:', error);
  }
}

function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
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
  previewTranscriptEntries?: PreviewTranscriptEntryPreset[];
}

function saveEditorUiToStorage(): void {
  try {
    localStorage.setItem(
      EDITOR_UI_STORAGE_KEY,
      JSON.stringify({
        editingTheme,
        previewMode,
        previewDevice,
        previewScene,
        editorMode,
        previewBackgroundUrl,
        previewTranscriptEntries,
      })
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
        parsed.previewScene === 'minimized' ||
        parsed.previewScene === 'artifact') &&
      (parsed.editorMode === 'basic' || parsed.editorMode === 'advanced')
    ) {
      return {
        editingTheme: parsed.editingTheme,
        previewMode: parsed.previewMode,
        previewDevice: parsed.previewDevice,
        previewScene: parsed.previewScene,
        editorMode: parsed.editorMode,
        previewBackgroundUrl: typeof parsed.previewBackgroundUrl === 'string' ? parsed.previewBackgroundUrl : '',
        previewTranscriptEntries: Array.isArray(parsed.previewTranscriptEntries)
          ? parsed.previewTranscriptEntries.filter(
              (item: unknown): item is PreviewTranscriptEntryPreset =>
                item === 'user-message' ||
                item === 'assistant-message' ||
                item === 'reasoning-streaming' ||
                item === 'reasoning-complete' ||
                item === 'tool-running' ||
                item === 'tool-complete'
            )
          : [],
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
    const v2Saved = localStorage.getItem(STORAGE_KEY);
    if (v2Saved) {
      const parsed = JSON.parse(v2Saved);
      if (parsed.version === 2) {
        const config = normalizeConfig(parsed.config);
        const theme = createTheme(parsed.theme, { validate: false });
        return { config, theme };
      }
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
  return null;
}

// ─── Parser type helpers ────────────────────────────────────────────
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

// ─── Preview zone highlight bridge ──────────────────────────────────
// Controls call highlightPreviewZone/clearPreviewHighlight;
// preview-manager registers the actual implementation via setHighlightHandler.

type HighlightHandler = (zone: string | null) => void;
let highlightHandler: HighlightHandler | null = null;

export function setHighlightHandler(handler: HighlightHandler | null): void {
  highlightHandler = handler;
}

export function highlightPreviewZone(zone: string): void {
  highlightHandler?.(zone);
}

export function clearPreviewHighlight(): void {
  highlightHandler?.(null);
}
