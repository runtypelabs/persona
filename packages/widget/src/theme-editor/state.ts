/** Headless state management for the theme editor (no DOM, no localStorage, no side effects) */

import type { AgentWidgetConfig } from '../types';
import type { PersonaTheme } from '../types/theme';
import { createTheme } from '../utils/theme';
import { DEFAULT_WIDGET_CONFIG } from '../defaults';
import type { ConfiguratorSnapshot, ConfigChangeListener } from './types';

// ─── Dot-path utilities ─────────────────────────────────────────

function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setByPath(obj: unknown, path: string, value: unknown): unknown {
  const parts = path.split('.');
  if (parts.length === 1) {
    return { ...(obj as Record<string, unknown>), [parts[0]]: value };
  }

  const [first, ...rest] = parts;
  const current = obj as Record<string, unknown>;
  return {
    ...current,
    [first]: setByPath(current?.[first] ?? {}, rest.join('.'), value),
  };
}

// ─── ThemeEditorState ───────────────────────────────────────────

export class ThemeEditorState {
  private config: AgentWidgetConfig;
  private theme: PersonaTheme;
  private listeners: ConfigChangeListener[] = [];
  private history: ConfiguratorSnapshot[] = [];
  private historyIndex = -1;
  private suppressHistory = false;

  constructor(
    initialTheme?: Partial<PersonaTheme>,
    initialConfig?: Partial<AgentWidgetConfig>
  ) {
    this.config = {
      ...DEFAULT_WIDGET_CONFIG,
      ...initialConfig,
    } as AgentWidgetConfig;
    this.theme = createTheme(initialTheme, { validate: false });
    this.syncThemeIntoConfig();
    this.pushHistorySnapshot(this.exportSnapshot(), true);
  }

  // ─── Read ───────────────────────────────────────────────────

  /**
   * Get a value using a dot-path.
   * - `theme.*` → reads from the PersonaTheme
   * - `darkTheme.*` → reads from config.darkTheme
   * - everything else → reads from the AgentWidgetConfig
   */
  get(path: string): unknown {
    if (path.startsWith('theme.')) {
      return getByPath(this.theme, path.replace('theme.', ''));
    }
    if (path.startsWith('darkTheme.')) {
      return getByPath(this.config.darkTheme ?? {}, path.replace('darkTheme.', ''));
    }
    return getByPath(this.config, path);
  }

  getTheme(): PersonaTheme {
    return this.theme;
  }

  getConfig(): AgentWidgetConfig {
    return this.config;
  }

  // ─── Write ──────────────────────────────────────────────────

  /**
   * Set a value using a dot-path.
   * - `theme.*` → writes into the PersonaTheme
   * - `darkTheme.*` → writes into config.darkTheme
   * - everything else → writes into AgentWidgetConfig
   */
  set(path: string, value: unknown): void {
    if (path.startsWith('theme.')) {
      const themePath = path.replace('theme.', '');
      this.theme = setByPath(this.theme, themePath, value) as PersonaTheme;
      this.syncThemeIntoConfig();
    } else if (path.startsWith('darkTheme.')) {
      const themePath = path.replace('darkTheme.', '');
      const dark = this.config.darkTheme ?? createTheme();
      this.config = {
        ...this.config,
        darkTheme: setByPath(dark, themePath, value) as AgentWidgetConfig['darkTheme'],
      };
    } else {
      this.config = setByPath(this.config, path, value) as AgentWidgetConfig;
    }

    this.recordHistory();
    this.notifyListeners();
  }

  /** Batch-set multiple paths at once */
  setBatch(updates: Record<string, unknown>): void {
    let themeChanged = false;
    let darkThemeChanged = false;
    let configChanged = false;

    for (const [path, value] of Object.entries(updates)) {
      if (path.startsWith('theme.')) {
        const themePath = path.replace('theme.', '');
        this.theme = setByPath(this.theme, themePath, value) as PersonaTheme;
        themeChanged = true;
      } else if (path.startsWith('darkTheme.')) {
        const themePath = path.replace('darkTheme.', '');
        const dark = this.config.darkTheme ?? createTheme();
        this.config = {
          ...this.config,
          darkTheme: setByPath(dark, themePath, value) as AgentWidgetConfig['darkTheme'],
        };
        darkThemeChanged = true;
      } else {
        this.config = setByPath(this.config, path, value) as AgentWidgetConfig;
        configChanged = true;
      }
    }

    if (themeChanged) {
      this.syncThemeIntoConfig();
    }
    if (themeChanged || darkThemeChanged || configChanged) {
      this.recordHistory();
      this.notifyListeners();
    }
  }

  /** Replace the entire theme */
  setTheme(theme: PersonaTheme): void {
    this.theme = theme;
    this.syncThemeIntoConfig();
    this.recordHistory();
    this.notifyListeners();
  }

  /** Replace the entire config (for preset loading) */
  setFullConfig(config: AgentWidgetConfig, theme?: PersonaTheme): void {
    this.config = { ...config };
    if (theme) {
      this.theme = theme;
    }
    this.syncThemeIntoConfig();
    this.recordHistory();
    this.notifyListeners();
  }

  /** Import a snapshot (v2 or raw theme) */
  importSnapshot(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      throw new Error('Snapshot must be a JSON object');
    }

    const parsed = snapshot as Partial<ConfiguratorSnapshot> & { config?: unknown; theme?: unknown };

    if ('config' in parsed || 'theme' in parsed || parsed.version === 2) {
      const config = (parsed.config ?? this.config) as AgentWidgetConfig;
      const theme = createTheme(
        (parsed.theme ?? this.theme) as Partial<PersonaTheme>,
        { validate: false }
      );
      this.setFullConfig(config, theme);
      return;
    }

    const theme = createTheme(parsed as Partial<PersonaTheme>, { validate: false });
    this.setTheme(theme);
  }

  /** Reset to defaults */
  resetToDefaults(): void {
    this.config = { ...DEFAULT_WIDGET_CONFIG } as AgentWidgetConfig;
    this.theme = createTheme();
    this.syncThemeIntoConfig();
    this.history = [];
    this.historyIndex = -1;
    this.pushHistorySnapshot(this.exportSnapshot());
    this.notifyListeners();
  }

  // ─── History ────────────────────────────────────────────────

  canUndo(): boolean {
    return this.historyIndex > 0;
  }

  canRedo(): boolean {
    return this.historyIndex >= 0 && this.historyIndex < this.history.length - 1;
  }

  undo(): void {
    if (!this.canUndo()) return;
    this.historyIndex -= 1;
    this.restoreSnapshot(this.history[this.historyIndex]);
  }

  redo(): void {
    if (!this.canRedo()) return;
    this.historyIndex += 1;
    this.restoreSnapshot(this.history[this.historyIndex]);
  }

  // ─── Snapshots ──────────────────────────────────────────────

  exportSnapshot(): ConfiguratorSnapshot {
    return {
      version: 2,
      config: { ...this.config, theme: undefined } as unknown as Record<string, unknown>,
      theme: this.theme,
    };
  }

  // ─── Listeners ──────────────────────────────────────────────

  onChange(listener: ConfigChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  // ─── Private ────────────────────────────────────────────────

  private syncThemeIntoConfig(): void {
    this.config = {
      ...this.config,
      theme: this.theme,
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.config, this.theme);
    }
  }

  private recordHistory(): void {
    this.pushHistorySnapshot(this.exportSnapshot());
  }

  private pushHistorySnapshot(snapshot: ConfiguratorSnapshot, replaceCurrent = false): void {
    if (this.suppressHistory) return;

    const serialized = JSON.stringify(snapshot);
    const currentSerialized =
      this.historyIndex >= 0 && this.history[this.historyIndex]
        ? JSON.stringify(this.history[this.historyIndex])
        : null;

    if (replaceCurrent && this.historyIndex >= 0) {
      this.history[this.historyIndex] = snapshot;
      return;
    }

    if (serialized === currentSerialized) return;

    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snapshot);
    this.historyIndex = this.history.length - 1;
  }

  private restoreSnapshot(snapshot: ConfiguratorSnapshot): void {
    this.suppressHistory = true;
    this.config = snapshot.config as unknown as AgentWidgetConfig;
    this.theme = createTheme(snapshot.theme, { validate: false });
    this.syncThemeIntoConfig();
    this.suppressHistory = false;
    this.notifyListeners();
  }
}
