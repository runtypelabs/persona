/** V2 theme presets and custom preset CRUD */

import type { PersonaTheme } from '@runtypelabs/persona';
import { createTheme } from '@runtypelabs/persona';
import type { AgentWidgetConfig } from '@runtypelabs/persona';
import { BUILT_IN_PRESETS as HEADLESS_PRESETS } from '@runtypelabs/persona/theme-editor';
import * as state from './state';

// ─── Built-in Presets ──────────────────────────────────────────────

export interface ThemePreset {
  id: string;
  label: string;
  description: string;
  theme: Partial<PersonaTheme>;
  config?: Partial<AgentWidgetConfig>;
  /** Whether this is a built-in preset (cannot be deleted) */
  builtIn: boolean;
}

/** Map headless presets to the local ThemePreset shape */
export const BUILT_IN_PRESETS: ThemePreset[] = [
  // Presets from headless core
  ...HEADLESS_PRESETS.map(p => ({
    id: p.id,
    label: p.name,
    description: p.description,
    theme: p.theme as Partial<PersonaTheme>,
    builtIn: true as const,
  })),
] as ThemePreset[];

// ─── Custom Preset Storage ────────────────────────────────────────

const PRESETS_STORAGE_KEY = 'persona-widget-presets-v2';

interface StoredPreset {
  id: string;
  label: string;
  description: string;
  theme: Partial<PersonaTheme>;
  config?: Partial<AgentWidgetConfig>;
  timestamp: number;
}

export function loadCustomPresets(): ThemePreset[] {
  try {
    const saved = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (saved) {
      const presets: StoredPreset[] = JSON.parse(saved);
      return presets.map(p => ({
        id: p.id,
        label: p.label,
        description: p.description,
        theme: p.theme,
        config: p.config,
        builtIn: false,
      }));
    }
  } catch (error) {
    console.error('Failed to load presets:', error);
  }
  return [];
}

export function saveCustomPreset(name: string): boolean {
  try {
    const presets = loadStoredPresets();
    const id = `custom-${Date.now()}`;
    const theme = state.getTheme();
    const config = state.exportSnapshot().config as Partial<AgentWidgetConfig>;

    const existingIndex = presets.findIndex(p => p.label === name);

    const preset: StoredPreset = {
      id: existingIndex >= 0 ? presets[existingIndex].id : id,
      label: name,
      description: `Custom preset: ${name}`,
      theme,
      config,
      timestamp: Date.now(),
    };

    if (existingIndex >= 0) {
      presets[existingIndex] = preset;
    } else {
      presets.push(preset);
    }

    presets.sort((a, b) => b.timestamp - a.timestamp);
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
    return true;
  } catch (error) {
    console.error('Failed to save preset:', error);
    return false;
  }
}

export function deleteCustomPreset(id: string): boolean {
  try {
    const presets = loadStoredPresets();
    const filtered = presets.filter(p => p.id !== id);
    if (filtered.length === presets.length) return false;
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('Failed to delete preset:', error);
    return false;
  }
}

/**
 * Layout `paneBackground` pins a fixed CSS color on the widget root and overrides theme tokens.
 * Theme-only presets should not inherit a stale value from localStorage / earlier edits.
 */
function withoutLayoutArtifactPaneBackground(config: AgentWidgetConfig): AgentWidgetConfig {
  const art = config.features?.artifacts;
  const pb = art?.layout?.paneBackground?.trim();
  if (!pb) return config;
  return {
    ...config,
    features: {
      ...config.features,
      artifacts: {
        ...art,
        layout: {
          ...art?.layout,
          paneBackground: undefined,
        },
      },
    },
  };
}

/**
 * In dark mode the widget uses `createDarkTheme(deepMerge(theme, darkTheme))` — `darkTheme` wins.
 * Theme-only presets update `theme` (light slot) via `currentTheme`; a stale `config.darkTheme` from
 * localStorage or the Style editor would override the preset and can force light surfaces.
 */
function cleanedConfigForThemeOnlyPreset(config: AgentWidgetConfig): AgentWidgetConfig {
  return {
    ...withoutLayoutArtifactPaneBackground(config),
    darkTheme: undefined,
  };
}

export function applyPreset(preset: ThemePreset): void {
  const theme = createTheme(preset.theme, { validate: false });
  if (preset.config) {
    state.setFullConfig(
      {
        ...state.getConfig(),
        ...preset.config,
      } as AgentWidgetConfig,
      theme
    );
    return;
  }
  state.setFullConfig(cleanedConfigForThemeOnlyPreset(state.getConfig()), theme);
}

export function getAllPresets(): ThemePreset[] {
  return [...BUILT_IN_PRESETS, ...loadCustomPresets()];
}

export function presetExists(name: string): boolean {
  const all = getAllPresets();
  return all.some(p => p.label === name);
}

function loadStoredPresets(): StoredPreset[] {
  try {
    const saved = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // Ignore
  }
  return [];
}
