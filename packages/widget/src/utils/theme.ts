import type { DeepPartial, PersonaTheme } from '../types/theme';
import type { AgentWidgetConfig } from '../types';
import { createTheme, resolveTokens, themeToCssVariables } from './tokens';
import { deepMerge } from './deep-merge';

export type ColorScheme = 'light' | 'dark' | 'auto';

export interface PersonaWidgetConfig {
  theme?: DeepPartial<PersonaTheme>;
  darkTheme?: DeepPartial<PersonaTheme>;
  colorScheme?: ColorScheme;
}

type WidgetConfig = PersonaWidgetConfig | AgentWidgetConfig;

const DARK_PALETTE = {
  colors: {
    primary: {
      50: '#ffffff',
      100: '#f5f5f5',
      200: '#d4d4d4',
      300: '#a3a3a3',
      400: '#737373',
      500: '#171717',
      600: '#0f0f0f',
      700: '#0a0a0a',
      800: '#050505',
      900: '#030303',
      950: '#000000',
    },
    secondary: {
      50: '#f5f3ff',
      100: '#ede9fe',
      200: '#ddd6fe',
      300: '#c4b5fd',
      400: '#a78bfa',
      500: '#8b5cf6',
      600: '#7c3aed',
      700: '#6d28d9',
      800: '#5b21b6',
      900: '#4c1d95',
      950: '#2e1065',
    },
    accent: {
      50: '#ecfeff',
      100: '#cffafe',
      200: '#a5f3fc',
      300: '#67e8f9',
      400: '#22d3ee',
      500: '#06b6d4',
      600: '#0891b2',
      700: '#0e7490',
      800: '#155e75',
      900: '#164e63',
      950: '#083344',
    },
    gray: {
      50: '#f9fafb',
      100: '#f3f4f6',
      200: '#e5e7eb',
      300: '#d1d5db',
      400: '#9ca3af',
      500: '#6b7280',
      600: '#4b5563',
      700: '#374151',
      800: '#1f2937',
      900: '#111827',
      950: '#030712',
    },
    success: {
      50: '#f0fdf4',
      100: '#dcfce7',
      200: '#bbf7d0',
      300: '#86efac',
      400: '#4ade80',
      500: '#22c55e',
      600: '#16a34a',
      700: '#15803d',
      800: '#166534',
      900: '#14532d',
    },
    warning: {
      50: '#fefce8',
      100: '#fef9c3',
      200: '#fef08a',
      300: '#fde047',
      400: '#facc15',
      500: '#eab308',
      600: '#ca8a04',
      700: '#a16207',
      800: '#854d0e',
      900: '#713f12',
    },
    error: {
      50: '#fef2f2',
      100: '#fee2e2',
      200: '#fecaca',
      300: '#fca5a5',
      400: '#f87171',
      500: '#ef4444',
      600: '#dc2626',
      700: '#b91c1c',
      800: '#991b1b',
      900: '#7f1d1d',
    },
  },
};

/**
 * Normalize theme config for merging; rejects non-objects.
 */
const normalizeThemeConfig = (
  theme: DeepPartial<PersonaTheme> | Record<string, unknown> | undefined
): DeepPartial<PersonaTheme> | undefined => {
  if (!theme || typeof theme !== 'object' || Array.isArray(theme)) return undefined;
  return theme as DeepPartial<PersonaTheme>;
};

export const detectColorScheme = (): 'light' | 'dark' => {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return 'dark';
  }

  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light';
};

const getColorSchemeFromConfig = (config?: WidgetConfig): 'light' | 'dark' => {
  const colorScheme = config?.colorScheme ?? 'light';

  if (colorScheme === 'light') return 'light';
  if (colorScheme === 'dark') return 'dark';

  return detectColorScheme();
};

export const getColorScheme = (config?: WidgetConfig): 'light' | 'dark' => {
  return getColorSchemeFromConfig(config);
};

export const createLightTheme = (userConfig?: DeepPartial<PersonaTheme>): PersonaTheme => {
  return createTheme(userConfig);
};

export const createDarkTheme = (userConfig?: DeepPartial<PersonaTheme>): PersonaTheme => {
  const baseTheme = createTheme(undefined, { validate: false });
  
  return createTheme(
    {
      ...userConfig,
      palette: {
        ...baseTheme.palette,
        colors: {
          ...DARK_PALETTE.colors,
          ...userConfig?.palette?.colors,
        },
      },
    },
    { validate: false }
  );
};

export const getActiveTheme = (config?: WidgetConfig): PersonaTheme => {
  const scheme = getColorScheme(config);
  const lightThemeConfig = normalizeThemeConfig(config?.theme);
  const darkThemeConfig = normalizeThemeConfig(config?.darkTheme);

  if (scheme === 'dark') {
    return createDarkTheme(
      deepMerge(
        (lightThemeConfig ?? {}) as Record<string, unknown>,
        (darkThemeConfig ?? {}) as Record<string, unknown>
      ) as DeepPartial<PersonaTheme>
    );
  }

  return createLightTheme(lightThemeConfig);
};

export const getCssVariables = (theme: PersonaTheme): Record<string, string> => {
  return themeToCssVariables(theme);
};

export const applyThemeVariables = (
  element: HTMLElement,
  config?: WidgetConfig
): void => {
  const theme = getActiveTheme(config);
  const cssVars = getCssVariables(theme);

  for (const [name, value] of Object.entries(cssVars)) {
    element.style.setProperty(name, value);
  }

  const toolCallShadow = (config as AgentWidgetConfig | undefined)?.toolCall?.shadow;
  if (toolCallShadow !== undefined) {
    element.style.setProperty(
      '--persona-tool-bubble-shadow',
      toolCallShadow.trim() === '' ? 'none' : toolCallShadow
    );
  }
};

export const createThemeObserver = (
  callback: (scheme: 'light' | 'dark') => void
): (() => void) => {
  const cleanupFns: Array<() => void> = [];

  if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      callback(detectColorScheme());
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    cleanupFns.push(() => observer.disconnect());
  }

  if (typeof window !== 'undefined' && window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => callback(detectColorScheme());

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      cleanupFns.push(() => mediaQuery.removeEventListener('change', handleChange));
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
      cleanupFns.push(() => mediaQuery.removeListener(handleChange));
    }
  }

  return () => {
    cleanupFns.forEach((fn) => fn());
  };
};

export { createTheme, resolveTokens, themeToCssVariables };
