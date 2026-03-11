/** Centralized state management for the theme configurator */

import type { AgentWidgetConfig, AgentWidgetMessage } from '@runtypelabs/persona';
import type { PersonaTheme } from '@runtypelabs/persona';
import {
  createAgentExperience,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  createTheme,
  themeToCssVariables,
  migrateV1Theme,
} from '@runtypelabs/persona';
import type { AgentWidgetController } from '@runtypelabs/persona';
import { parseActionResponse } from '../middleware';

// ─── Constants ──────────────────────────────────────────────────────
const STORAGE_KEY = 'persona-widget-config-v2';
const STORAGE_KEY_V1 = 'persona-widget-config';

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl =
  import.meta.env.VITE_PROXY_URL
    ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch`
    : `http://localhost:${proxyPort}/api/chat/dispatch`;

export type ParserType = 'plain' | 'json' | 'regex-json' | 'xml';

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

// ─── Store singleton ────────────────────────────────────────────────
let currentConfig: AgentWidgetConfig = getDefaultConfig();
let currentTheme: PersonaTheme = createTheme();
let widgetController: AgentWidgetController | null = null;
let previewElement: HTMLElement | null = null;
let updateTimeout: number | null = null;

type ConfigChangeListener = (config: AgentWidgetConfig, theme: PersonaTheme) => void;
const listeners: ConfigChangeListener[] = [];

// ─── Initialize ─────────────────────────────────────────────────────
export function initStore(previewMount: HTMLElement): AgentWidgetController {
  // Store reference before createAgentExperience changes the element's id
  previewElement = previewMount;

  // Try to load saved config
  const saved = loadFromStorage();
  if (saved) {
    currentConfig = saved.config;
    currentTheme = saved.theme;
  }

  widgetController = createAgentExperience(previewMount, currentConfig);
  applyThemeToWidget();

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

/**
 * Get a value from config using a dot-path.
 * Paths starting with 'theme.' go into the PersonaTheme object.
 * Other paths go into the AgentWidgetConfig object.
 */
export function get(path: string): any {
  if (path.startsWith('theme.')) {
    return getByPath(currentTheme, path.replace('theme.', ''));
  }
  return getByPath(currentConfig, path);
}

/**
 * Set a value in config using a dot-path.
 * Paths starting with 'theme.' go into the PersonaTheme object.
 */
export function set(path: string, value: any): void {
  if (path.startsWith('theme.')) {
    const themePath = path.replace('theme.', '');
    currentTheme = setByPath(currentTheme, themePath, value) as PersonaTheme;
    applyThemeToWidget();
    debouncedSave();
    notifyListeners();
  } else {
    currentConfig = setByPath(currentConfig, path, value) as AgentWidgetConfig;
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
    applyThemeToWidget();
    saveToStorage();
    notifyListeners();
  } else {
    currentConfig = setByPath(currentConfig, path, value) as AgentWidgetConfig;
    immediateWidgetUpdate();
  }
}

/** Batch-set multiple paths at once (immediate update) */
export function setBatch(updates: Record<string, any>): void {
  let themeChanged = false;
  let configChanged = false;

  for (const [path, value] of Object.entries(updates)) {
    if (path.startsWith('theme.')) {
      const themePath = path.replace('theme.', '');
      currentTheme = setByPath(currentTheme, themePath, value) as PersonaTheme;
      themeChanged = true;
    } else {
      currentConfig = setByPath(currentConfig, path, value) as AgentWidgetConfig;
      configChanged = true;
    }
  }

  if (themeChanged) {
    applyThemeToWidget();
  }
  if (configChanged) {
    immediateWidgetUpdate();
  } else if (themeChanged) {
    saveToStorage();
    notifyListeners();
  }
}

/** Replace the entire theme */
export function setTheme(theme: PersonaTheme): void {
  currentTheme = theme;
  applyThemeToWidget();
  saveToStorage();
  notifyListeners();
}

/** Replace the entire config (for preset loading) */
export function setFullConfig(config: AgentWidgetConfig, theme?: PersonaTheme): void {
  currentConfig = config;
  if (theme) {
    currentTheme = theme;
    applyThemeToWidget();
  }
  immediateWidgetUpdate();
}

/** Reset to defaults */
export function resetToDefaults(): void {
  currentConfig = getDefaultConfig();
  currentTheme = createTheme();
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
  if (!widgetController || !previewElement) return;
  const cssVars = themeToCssVariables(currentTheme);
  for (const [name, value] of Object.entries(cssVars)) {
    previewElement.style.setProperty(name, value);
  }
}

function debouncedUpdate(): void {
  if (updateTimeout !== null) {
    clearTimeout(updateTimeout);
  }
  updateTimeout = window.setTimeout(() => {
    if (widgetController) {
      widgetController.update(currentConfig);
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
    widgetController.update(currentConfig);
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
  };
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
  } catch {
    // Ignore
  }
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
        const defaults = getDefaultConfig();
        const config = {
          ...defaults,
          ...parsed.config,
          parserType: parsed.config.parserType ?? 'plain',
          streamParser: undefined,
          sendButton: { ...defaults.sendButton, ...parsed.config.sendButton },
          statusIndicator: { ...defaults.statusIndicator, ...parsed.config.statusIndicator },
        };
        const theme = createTheme(parsed.theme, { validate: false });
        return { config, theme };
      }
    }

    // Try v1 format and migrate
    const v1Saved = localStorage.getItem(STORAGE_KEY_V1);
    if (v1Saved) {
      const parsed = JSON.parse(v1Saved);
      const defaults = getDefaultConfig();
      const config = {
        ...defaults,
        ...parsed,
        parserType: parsed.parserType ?? (parsed as any)._parserType ?? 'plain',
        streamParser: undefined,
        sendButton: { ...defaults.sendButton, ...parsed.sendButton },
        statusIndicator: { ...defaults.statusIndicator, ...parsed.statusIndicator },
      };

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
