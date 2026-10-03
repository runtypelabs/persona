/** Headless state management for the theme editor (no DOM, no localStorage, no side effects) */

import type { AgentWidgetConfig } from '../types';
import type { DeepPartial, PersonaTheme } from '../types/theme';
import { createTheme } from '../utils/theme';
import { resolveDefaults, resolveDefaultsVersion } from '../defaults';
import { deepMerge } from '../utils/deep-merge';
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

function unsetByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  if (parts.length === 1) {
    const result = { ...(obj as Record<string, unknown>) };
    delete result[parts[0]];
    return result;
  }
  const [first, ...rest] = parts;
  const current = obj as Record<string, unknown>;
  const child = unsetByPath(current?.[first] ?? {}, rest.join('.'));
  const result = { ...current };
  if (
    typeof child === 'object' &&
    child !== null &&
    !Array.isArray(child) &&
    Object.keys(child as Record<string, unknown>).length === 0
  ) {
    delete result[first];
  } else {
    result[first] = child;
  }
  return result;
}

// ─── ThemeEditorState ───────────────────────────────────────────

export class ThemeEditorState {
  private config: AgentWidgetConfig;
  private theme: PersonaTheme;
  #listeners: ConfigChangeListener[] = [];
  #history: ConfiguratorSnapshot[] = [];
  #historyIndex = -1;
  #suppressHistory = false;
  #authoredConfig: Partial<AgentWidgetConfig> = {};
  #authoredTheme: DeepPartial<PersonaTheme> = {};
  #mergeDefaults = true;
  #snapshotIntent = new WeakMap<ConfiguratorSnapshot, { config: Partial<AgentWidgetConfig>; theme: DeepPartial<PersonaTheme> }>();

  constructor(
    initialTheme?: DeepPartial<PersonaTheme>,
    initialConfig?: Partial<AgentWidgetConfig>,
    options?: { mergeDefaults?: boolean }
  ) {
    const mergeDefaults = options?.mergeDefaults ?? true;
    this.#mergeDefaults = mergeDefaults;
    this.#authoredConfig = { ...initialConfig };
    this.#authoredTheme = initialTheme ?? {};
    const defaults = resolveDefaults(initialConfig);
    this.config = (mergeDefaults
      ? { ...defaults, ...initialConfig }
      : (initialConfig ?? defaults)
    ) as AgentWidgetConfig;
    this.theme = createTheme(initialTheme, {
      validate: false,
      future: this.config.future,
    });
    this.#syncThemeIntoConfig();
    this.#pushHistorySnapshot(this.exportSnapshot(), true);
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
    const previousVersion = resolveDefaultsVersion(this.config);
    this.#recordIntent(path, value);
    if (path.startsWith('theme.')) {
      const themePath = path.replace('theme.', '');
      this.theme = setByPath(this.theme, themePath, value) as PersonaTheme;
      this.#syncThemeIntoConfig();
    } else if (path.startsWith('darkTheme.')) {
      const themePath = path.replace('darkTheme.', '');
      const dark = this.config.darkTheme ?? createTheme(undefined, { future: this.config.future });
      this.config = {
        ...this.config,
        darkTheme: setByPath(dark, themePath, value) as AgentWidgetConfig['darkTheme'],
      };
    } else {
      this.config = setByPath(this.config, path, value) as AgentWidgetConfig;
    }

    this.#rebaseDefaults(previousVersion);
    this.#recordHistory();
    this.#notifyListeners();
  }

  /** Delete a dot-path and prune empty parents so sparse preferences inherit. */
  unset(path: string): void {
    const previousVersion = resolveDefaultsVersion(this.config);
    this.#recordIntent(path, undefined, true);
    if (path.startsWith('theme.')) {
      const themePath = path.replace('theme.', '');
      this.theme = unsetByPath(this.theme, themePath) as PersonaTheme;
      this.#syncThemeIntoConfig();
    } else if (path.startsWith('darkTheme.')) {
      const themePath = path.replace('darkTheme.', '');
      this.config = {
        ...this.config,
        darkTheme: unsetByPath(
          this.config.darkTheme ?? {},
          themePath
        ) as AgentWidgetConfig['darkTheme'],
      };
    } else {
      this.config = unsetByPath(this.config, path) as AgentWidgetConfig;
    }
    this.#rebaseDefaults(previousVersion);
    this.#recordHistory();
    this.#notifyListeners();
  }

  /** Batch-set multiple paths at once */
  setBatch(updates: Record<string, unknown>): void {
    const previousVersion = resolveDefaultsVersion(this.config);
    let themeChanged = false;
    let darkThemeChanged = false;
    let configChanged = false;

    for (const [path, value] of Object.entries(updates)) {
      this.#recordIntent(path, value);
      if (path.startsWith('theme.')) {
        const themePath = path.replace('theme.', '');
        this.theme = setByPath(this.theme, themePath, value) as PersonaTheme;
        themeChanged = true;
      } else if (path.startsWith('darkTheme.')) {
        const themePath = path.replace('darkTheme.', '');
        const dark = this.config.darkTheme ?? createTheme(undefined, { future: this.config.future });
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
      this.#syncThemeIntoConfig();
    }
    this.#rebaseDefaults(previousVersion);
    if (themeChanged || darkThemeChanged || configChanged) {
      this.#recordHistory();
      this.#notifyListeners();
    }
  }

  /** Replace the entire theme */
  setTheme(theme: PersonaTheme): void {
    this.#authoredTheme = theme;
    this.theme = theme;
    this.#syncThemeIntoConfig();
    this.#recordHistory();
    this.#notifyListeners();
  }

  /** Replace the entire config (for preset loading) */
  setFullConfig(config: AgentWidgetConfig, theme?: PersonaTheme): void {
    this.#authoredConfig = { ...config };
    if (theme) this.#authoredTheme = theme;
    this.config = { ...config };
    if (theme) {
      this.theme = theme;
    }
    this.#syncThemeIntoConfig();
    this.#recordHistory();
    this.#notifyListeners();
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
        (parsed.theme ?? this.theme) as DeepPartial<PersonaTheme>,
        { validate: false, future: config.future }
      );
      this.setFullConfig(config, theme);
      return;
    }

    const theme = createTheme(parsed as DeepPartial<PersonaTheme>, { validate: false, future: this.config.future });
    this.setTheme(theme);
  }

  /** Reset to defaults */
  resetToDefaults(): void {
    const future = this.config.future;
    this.#authoredConfig = future ? { future } : {};
    this.#authoredTheme = {};
    this.config = {
      ...resolveDefaults({ future }),
      ...(future ? { future } : {}),
    } as AgentWidgetConfig;
    this.theme = createTheme(undefined, { future: this.config.future });
    this.#syncThemeIntoConfig();
    this.#history = [];
    this.#historyIndex = -1;
    this.#pushHistorySnapshot(this.exportSnapshot());
    this.#notifyListeners();
  }

  // ─── History ────────────────────────────────────────────────

  canUndo(): boolean {
    return this.#historyIndex > 0;
  }

  canRedo(): boolean {
    return this.#historyIndex >= 0 && this.#historyIndex < this.#history.length - 1;
  }

  getHistoryLength(): number {
    return this.#history.length;
  }

  getHistoryIndex(): number {
    return this.#historyIndex;
  }

  undo(): void {
    if (!this.canUndo()) return;
    this.#historyIndex -= 1;
    this.#restoreSnapshot(this.#history[this.#historyIndex]);
  }

  redo(): void {
    if (!this.canRedo()) return;
    this.#historyIndex += 1;
    this.#restoreSnapshot(this.#history[this.#historyIndex]);
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
    this.#listeners.push(listener);
    return () => {
      const idx = this.#listeners.indexOf(listener);
      if (idx >= 0) this.#listeners.splice(idx, 1);
    };
  }

  // ─── Private ────────────────────────────────────────────────

  #recordIntent(path: string, value: unknown, remove = false): void {
    const write = (target: object, key: string) => remove || value === undefined
      ? unsetByPath(target, key) : setByPath(target, key, value);
    if (path.startsWith('theme.')) {
      this.#authoredTheme = write(this.#authoredTheme, path.slice(6)) as DeepPartial<PersonaTheme>;
    } else if (path === 'theme') {
      this.#authoredTheme = (value ?? {}) as DeepPartial<PersonaTheme>;
    } else {
      this.#authoredConfig = write(this.#authoredConfig, path) as Partial<AgentWidgetConfig>;
    }
  }

  #rebaseDefaults(previousVersion: string): void {
    if (previousVersion === resolveDefaultsVersion(this.config)) return;
    this.config = (this.#mergeDefaults
      ? deepMerge(resolveDefaults(this.#authoredConfig), this.#authoredConfig)
      : { ...this.#authoredConfig }) as AgentWidgetConfig;
    this.theme = createTheme(this.#authoredTheme, { validate: false, future: this.config.future });
    this.#syncThemeIntoConfig();
  }

  #syncThemeIntoConfig(): void {
    this.config = {
      ...this.config,
      theme: this.theme,
    };
  }

  #notifyListeners(): void {
    for (const listener of this.#listeners) {
      listener(this.config, this.theme);
    }
  }

  #recordHistory(): void {
    this.#pushHistorySnapshot(this.exportSnapshot());
  }

  #pushHistorySnapshot(snapshot: ConfiguratorSnapshot, replaceCurrent = false): void {
    if (this.#suppressHistory) return;
    this.#snapshotIntent.set(snapshot, { config: this.#authoredConfig, theme: this.#authoredTheme });

    const serialized = JSON.stringify(snapshot);
    const currentSerialized =
      this.#historyIndex >= 0 && this.#history[this.#historyIndex]
        ? JSON.stringify(this.#history[this.#historyIndex])
        : null;

    if (replaceCurrent && this.#historyIndex >= 0) {
      this.#history[this.#historyIndex] = snapshot;
      return;
    }

    const currentIntent = this.#historyIndex >= 0
      ? this.#snapshotIntent.get(this.#history[this.#historyIndex]) : undefined;
    if (serialized === currentSerialized &&
      JSON.stringify(this.#snapshotIntent.get(snapshot)) === JSON.stringify(currentIntent)) return;

    this.#history = this.#history.slice(0, this.#historyIndex + 1);
    this.#history.push(snapshot);
    this.#historyIndex = this.#history.length - 1;
  }

  #restoreSnapshot(snapshot: ConfiguratorSnapshot): void {
    this.#suppressHistory = true;
    const intent = this.#snapshotIntent.get(snapshot);
    this.#authoredConfig = intent?.config ?? snapshot.config as Partial<AgentWidgetConfig>;
    this.#authoredTheme = intent?.theme ?? snapshot.theme;
    this.config = snapshot.config as unknown as AgentWidgetConfig;
    this.theme = createTheme(snapshot.theme, { validate: false, future: this.config.future });
    this.#syncThemeIntoConfig();
    this.#suppressHistory = false;
    this.#notifyListeners();
  }
}
