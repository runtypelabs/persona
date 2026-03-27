/** Theme editor presets — unified collection of built-in presets */

import type { ThemeEditorPreset } from './types';

export const BUILT_IN_PRESETS: ThemeEditorPreset[] = [
  {
    id: 'default-light',
    name: 'Default Light',
    description: 'Clean light theme with blue primary',
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
    preview: { primary: '#2563eb', surface: '#ffffff', accent: '#06b6d4' },
    tags: ['light'],
  },
  {
    id: 'default-dark',
    name: 'Default Dark',
    description: 'Dark theme with blue primary',
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
    preview: { primary: '#3b82f6', surface: '#1f2937', accent: '#06b6d4' },
    tags: ['dark'],
  },
  {
    id: 'high-contrast',
    name: 'High Contrast',
    description: 'Maximum contrast for accessibility',
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
    preview: { primary: '#1d4ed8', surface: '#f9fafb', accent: '#1e40af' },
    tags: ['light', 'high-contrast', 'accessibility'],
  },
];

/** All built-in presets */
export const THEME_EDITOR_PRESETS: ThemeEditorPreset[] = [...BUILT_IN_PRESETS];

/** Look up a preset by ID */
export function getThemeEditorPreset(id: string): ThemeEditorPreset | undefined {
  return THEME_EDITOR_PRESETS.find(p => p.id === id);
}
