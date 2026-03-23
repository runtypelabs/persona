/** V2 theme presets and custom preset CRUD */

import type { PersonaTheme } from '@runtypelabs/persona';
import { createTheme } from '@runtypelabs/persona';
import type { AgentWidgetConfig } from '@runtypelabs/persona';
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

export const BUILT_IN_PRESETS: ThemePreset[] = [
  {
    id: 'default-light',
    label: 'Default Light',
    description: 'Clean light theme with blue primary',
    builtIn: true,
    // Explicit artifact pane tokens (same as package defaults) so exports/presets read clearly;
    // pane fill still follows light/dark semantics unless layout.paneBackground overrides.
    theme: {
      components: {
        artifact: {
          pane: {
            background: 'semantic.colors.container',
            toolbarBackground: 'semantic.colors.container',
          },
        },
      },
    },
  },
  {
    id: 'default-dark',
    label: 'Default Dark',
    description: 'Dark theme with blue primary',
    builtIn: true,
    theme: {
      palette: {
        colors: {
          primary: {
            50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
            400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
            800: '#1e40af', 900: '#1e3a8a', 950: '#172554',
          },
          gray: {
            50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db',
            400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151',
            800: '#1f2937', 900: '#111827', 950: '#030712',
          },
          secondary: {
            50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd',
            400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9',
            800: '#5b21b6', 900: '#4c1d95', 950: '#2e1065',
          },
          accent: {
            50: '#ecfeff', 100: '#cffafe', 200: '#a5f3fc', 300: '#67e8f9',
            400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490',
            800: '#155e75', 900: '#164e63', 950: '#083344',
          },
          success: {
            50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac',
            400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d',
            800: '#166534', 900: '#14532d',
          },
          warning: {
            50: '#fefce8', 100: '#fef9c3', 200: '#fef08a', 300: '#fde047',
            400: '#facc15', 500: '#eab308', 600: '#ca8a04', 700: '#a16207',
            800: '#854d0e', 900: '#713f12',
          },
          error: {
            50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5',
            400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c',
            800: '#991b1b', 900: '#7f1d1d',
          },
        },
      } as any,
      semantic: {
        colors: {
          primary: 'palette.colors.primary.400',
          secondary: 'palette.colors.gray.400',
          accent: 'palette.colors.primary.500',
          surface: 'palette.colors.gray.800',
          background: 'palette.colors.gray.900',
          container: 'palette.colors.gray.800',
          text: 'palette.colors.gray.100',
          textMuted: 'palette.colors.gray.400',
          textInverse: 'palette.colors.gray.900',
          border: 'palette.colors.gray.700',
          divider: 'palette.colors.gray.700',
          interactive: {
            default: 'palette.colors.primary.400',
            hover: 'palette.colors.primary.300',
            focus: 'palette.colors.primary.500',
            active: 'palette.colors.primary.600',
            disabled: 'palette.colors.gray.600',
          },
          feedback: {
            success: 'palette.colors.success.400',
            warning: 'palette.colors.warning.400',
            error: 'palette.colors.error.400',
            info: 'palette.colors.primary.400',
          },
        },
      } as any,
    },
  },
  {
    id: 'high-contrast',
    label: 'High Contrast',
    description: 'Maximum contrast for accessibility',
    builtIn: true,
    theme: {
      semantic: {
        colors: {
          primary: 'palette.colors.primary.700',
          secondary: 'palette.colors.gray.700',
          accent: 'palette.colors.primary.800',
          surface: 'palette.colors.gray.50',
          background: 'palette.colors.gray.50',
          container: 'palette.colors.gray.200',
          text: 'palette.colors.gray.950',
          textMuted: 'palette.colors.gray.700',
          textInverse: 'palette.colors.gray.50',
          border: 'palette.colors.gray.400',
          divider: 'palette.colors.gray.400',
          interactive: {
            default: 'palette.colors.primary.700',
            hover: 'palette.colors.primary.800',
            focus: 'palette.colors.primary.900',
            active: 'palette.colors.primary.950',
            disabled: 'palette.colors.gray.400',
          },
          feedback: {
            success: 'palette.colors.success.700',
            warning: 'palette.colors.warning.700',
            error: 'palette.colors.error.700',
            info: 'palette.colors.primary.700',
          },
        },
      } as any,
    },
  },
];

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
