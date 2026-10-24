import { CIRCLE_LAUNCHER_TOKENS, resolveLauncherVariant } from "./launcher-variant";
import type { BrandConfig, CreateThemeOptions, DeepPartial, PersonaTheme } from '../types/theme';
import type { AgentWidgetConfig } from '../types';
import { resolveDefaultsVersion } from '../defaults';
import { createTheme, resolveTokens, themeToCssVariables, launcherThemeToCssVariables, resolveThemeDefaults, DEFAULT_COMPONENTS_V4 } from './tokens';
import { isEmbeddedLayout } from "./panel-config";
import { deriveBrandTheme, inferBrandColorScheme } from './brand';
import { deepMerge } from './deep-merge';
import { hasExplicitThemeStyle, OPT_IN_THEME_STYLE_PATHS } from './style-provenance';

export type ColorScheme = 'light' | 'dark' | 'auto';

export interface PersonaWidgetConfig {
  brand?: BrandConfig;
  theme?: DeepPartial<PersonaTheme>;
  darkTheme?: DeepPartial<PersonaTheme>;
  colorScheme?: ColorScheme;
  future?: { v5Defaults?: boolean };
}

type WidgetConfig = PersonaWidgetConfig | AgentWidgetConfig;

const isPanelWidthMode = (config?: WidgetConfig): boolean =>
  !!config &&
  "launcher" in config &&
  (config.launcher?.sidebarMode === true || config.launcher?.mountMode === "docked");

const applyPanelModeWidth = (theme: PersonaTheme, config?: WidgetConfig): PersonaTheme => {
  if (!config || !isPanelWidthMode(config)) return theme;
  const lightWidth = config.theme?.components?.panel?.width;
  const darkWidth = config.darkTheme?.components?.panel?.width;
  const configuredWidth = getColorScheme(config) === "dark" ? darkWidth ?? lightWidth : lightWidth;
  if (configuredWidth != null) return theme;
  return {
    ...theme,
    components: {
      ...theme.components,
      panel: { ...theme.components.panel, width: resolveDefaultsVersion(config) === "v5" ? "400px" : "420px" },
    },
  };
};

const DARK_PALETTE_BASE = {
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
 * Component defaults that only hold in a dark color scheme. Layered UNDER the
 * host's theme, so any explicit value still wins.
 *
 * The ghost hover wash must invert with the scheme: 5% black is invisible on a
 * near-black surface, so every dark scheme gets a light alpha instead.
 */
const DARK_COMPONENTS_BASE: DeepPartial<PersonaTheme> = {
  components: {
    button: {
      ghost: {
        hoverBackground: 'rgba(255, 255, 255, 0.08)',
      },
    },
    markdown: {
      link: {
        // primary.600 is #0f0f0f in both palettes; on a charcoal bubble that
        // fails AA. primary.300 (#a3a3a3) is ~5.8:1 on gray.800 and still
        // distinct from body text (gray.100).
        foreground: 'palette.colors.primary.300',
      },
    },
    // Event-stream badge chips flip to a 900-tone fill with a 300-tone text
    // (primary is the inverted dark ramp, so 800/200 lands the same way).
    // The light defaults are 100-tone fills that read as glowing swatches on
    // a dark panel; every pair here keeps >=4.5:1 text contrast (locked by
    // event-stream-badge-theming.test.ts).
    eventStream: {
      badge: {
        flow: { background: 'palette.colors.success.900', foreground: 'palette.colors.success.300' },
        step: { background: 'palette.colors.primary.800', foreground: 'palette.colors.primary.200' },
        reasoning: { background: 'palette.colors.warning.900', foreground: 'palette.colors.warning.300' },
        tool: { background: 'palette.colors.purple.900', foreground: 'palette.colors.purple.300' },
        agent: { background: 'palette.colors.teal.900', foreground: 'palette.colors.teal.300' },
        error: { background: 'palette.colors.error.900', foreground: 'palette.colors.error.300' },
        default: { background: 'palette.colors.gray.800', foreground: 'palette.colors.gray.300' },
      },
    },
    // Message meta badges follow the event-stream chips: 900-tone fill with
    // a 300-tone text. Note lines move to the 400 tones, which keep AA on a
    // dark surface where the light 600/700 tones do not.
    messageMeta: {
      badge: {
        neutral: { background: 'palette.colors.gray.800', foreground: 'palette.colors.gray.300' },
        success: { background: 'palette.colors.success.900', foreground: 'palette.colors.success.300' },
        warning: { background: 'palette.colors.warning.900', foreground: 'palette.colors.warning.300' },
        danger: { background: 'palette.colors.error.900', foreground: 'palette.colors.error.300' },
      },
      note: {
        success: 'palette.colors.success.400',
        warning: 'palette.colors.warning.400',
        danger: 'palette.colors.error.400',
      },
    },
    history: {
      // error-400: the light-surface error-600 red lands ~3:1 on dark
      // surfaces, under the 4.5:1 AA floor for the 14px destructive labels.
      dangerForeground: '#f87171',
      confirm: {
        // error-600: bright enough to read as a control against a dark
        // surface (3:1 non-text) while the white label keeps 4.8:1.
        dangerBackground: 'palette.colors.error.600',
        // 45% slate darkens near-black surfaces by almost nothing; dark
        // schemes need a heavier dimmer for the modal to read as modal.
        scrim: 'rgba(0, 0, 0, 0.6)',
      },
    },
  },
};

// V4 stays frozen; V5 provides the dark neutral ramp and semantic roles.
export const DARK_PALETTE_V4 = DARK_PALETTE_BASE;
export const DARK_PALETTE_V5 = {
  ...DARK_PALETTE_V4,
  colors: {
    ...DARK_PALETTE_V4.colors,
    primary: {
      50: '#0f0f10', 100: '#27272a', 200: '#3f3f46', 300: '#52525b',
      400: '#71717a', 500: '#f4f4f5', 600: '#e4e4e7', 700: '#d4d4d8',
      800: '#a1a1aa', 900: '#fafafa', 950: '#ffffff',
    },
    gray: {
      50: '#1a1a1b', 100: '#27272a', 200: '#2a2a2d', 300: '#52525b',
      400: '#71717a', 500: '#a1a1aa', 600: '#b4b4bd', 700: '#d4d4d8',
      800: '#e4e4e7', 900: '#f4f4f5', 950: '#fafafa',
    },
  },
};
export const DARK_COMPONENTS_V4 = DARK_COMPONENTS_BASE;
export const DARK_COMPONENTS_V5: DeepPartial<PersonaTheme> = {
  semantic: {
    colors: {
      primary: 'palette.colors.primary.500',
      accent: 'palette.colors.primary.600',
      background: '#0f0f10',
      surface: 'palette.colors.gray.50',
      container: '#1c1c20',
      text: 'palette.colors.gray.900',
      textMuted: 'palette.colors.gray.500',
      textInverse: '#0f0f10',
      border: 'palette.colors.gray.200',
      divider: 'palette.colors.gray.200',
      interactive: {
        default: 'palette.colors.primary.600', hover: 'palette.colors.primary.700',
        focus: 'palette.colors.primary.600', active: 'palette.colors.primary.600',
      },
    },
  },
  components: {
    ...DARK_COMPONENTS_BASE.components,
    button: {
      ...DARK_COMPONENTS_BASE.components?.button,
      primary: { background: 'semantic.colors.primary', foreground: 'palette.colors.primary.50' },
    },
    markdown: {
      inlineCode: { background: 'palette.colors.gray.100', foreground: 'semantic.colors.text' },
      link: { foreground: 'semantic.colors.accent' },
      codeBlock: {
        background: 'semantic.colors.container', borderColor: 'semantic.colors.border',
        textColor: 'semantic.colors.text',
      },
      table: { headerBackground: 'palette.colors.gray.100', borderColor: 'semantic.colors.border' },
      blockquote: {
        background: 'semantic.colors.container', borderColor: 'palette.colors.gray.300',
        textColor: 'semantic.colors.textMuted',
      },
    },
    eventStream: {
      ...DARK_COMPONENTS_BASE.components?.eventStream,
      badge: {
        ...DARK_COMPONENTS_BASE.components?.eventStream?.badge,
        step: { background: 'palette.colors.gray.100', foreground: 'palette.colors.gray.700' },
        default: { background: 'palette.colors.gray.100', foreground: 'palette.colors.gray.700' },
      },
    },
    // V5's dark gray ramp is inverted, so the neutral pair reads from the low end.
    messageMeta: {
      ...DARK_COMPONENTS_BASE.components?.messageMeta,
      badge: {
        ...DARK_COMPONENTS_BASE.components?.messageMeta?.badge,
        neutral: { background: 'palette.colors.gray.100', foreground: 'palette.colors.gray.700' },
      },
    },
  },
};

const resolveDarkDefaults = (future?: { v5Defaults?: boolean }) =>
  resolveDefaultsVersion({ future }) === 'v5'
    ? { palette: DARK_PALETTE_V5, components: DARK_COMPONENTS_V5 }
    : { palette: DARK_PALETTE_V4, components: DARK_COMPONENTS_V4 };

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
  const colorScheme = config?.colorScheme ?? inferBrandColorScheme(config?.brand) ?? 'light';

  if (colorScheme === 'light') return 'light';
  if (colorScheme === 'dark') return 'dark';

  return detectColorScheme();
};

export const getColorScheme = (config?: WidgetConfig): 'light' | 'dark' => {
  return getColorSchemeFromConfig(config);
};

export const createLightTheme = (
  userConfig?: DeepPartial<PersonaTheme>,
  options: Pick<CreateThemeOptions, 'future'> = {}
): PersonaTheme => {
  return createTheme(userConfig, options);
};

export const createDarkTheme = (
  userConfig?: DeepPartial<PersonaTheme>,
  options: Pick<CreateThemeOptions, 'future'> = {}
): PersonaTheme => {
  // createTheme() already merges every palette sub-object (radius, typography,
  // shadows, …) over the defaults, so only the dark color scales need to be
  // layered UNDER the user's colors here. Spreading a pre-built default
  // palette instead would clobber the user's non-color palette overrides
  // (radius/typography) in dark mode while light mode honored them.
  //
  // DARK_COMPONENTS goes underneath by deep merge, not spread: a shallow
  // spread of `components` would drop the dark ghost hover the moment a host
  // set any unrelated component token.
  const darkDefaults = resolveDarkDefaults(options.future);
  const config = (deepMerge(
    darkDefaults.components as Record<string, unknown>,
    (userConfig ?? {}) as Record<string, unknown>
  ) ?? {}) as DeepPartial<PersonaTheme>;

  return createTheme(
    {
      ...config,
      palette: {
        ...config.palette,
        // Preserve every dark stop when a host overrides just one shade.
        // Keep V4's historical scale replacement behavior unchanged.
        colors: resolveDefaultsVersion(options) === 'v5'
          ? deepMerge(darkDefaults.palette.colors, config.palette?.colors) as PersonaTheme['palette']['colors']
          : { ...darkDefaults.palette.colors, ...config.palette?.colors },
      },
    },
    { validate: false, future: options.future }
  );
};

export const getActiveTheme = (config?: WidgetConfig): PersonaTheme => {
  const scheme = getColorScheme(config);
  const explicitTheme = deepMerge(deriveBrandTheme(config?.brand, scheme, resolveThemeDefaults(config?.future).components, config?.future?.v5Defaults), normalizeThemeConfig(config?.theme)) as DeepPartial<PersonaTheme>;
  // Variant defaults sit under explicit theme tokens in either defaults state.
  const launcherDefaults = resolveLauncherVariant(config) === 'circle'
    ? CIRCLE_LAUNCHER_TOKENS
    : { ...DEFAULT_COMPONENTS_V4.launcher, ...(config?.future?.v5Defaults ? { offset: '1.5rem' } : {}) };
  // Scope presentation defaults below caller tokens, including dark overrides.
  const embedded = isEmbeddedLayout(config as Partial<AgentWidgetConfig>);
  const lightThemeConfig = deepMerge(
    { components: {
      launcher: launcherDefaults,
      ...(embedded ? {
        panel: { background: 'transparent', modes: { inline: { border: 'none', shadow: 'none', borderRadius: '0' } } },
        header: { background: 'transparent' },
        message: { background: 'transparent' },
        composer: { footerBackground: 'transparent', footerBorder: 'none', overlayBand: 'transparent' },
      } : {}),
    } }, explicitTheme
  ) as DeepPartial<PersonaTheme>;
  const darkThemeConfig = normalizeThemeConfig(config?.darkTheme);

  const theme = scheme === 'dark'
    ? applyPanelModeWidth(createDarkTheme(
      deepMerge(
        (lightThemeConfig ?? {}) as Record<string, unknown>,
        (darkThemeConfig ?? {}) as Record<string, unknown>
      ) as DeepPartial<PersonaTheme>,
      { future: config?.future }
    ), config)
    : applyPanelModeWidth(createLightTheme(lightThemeConfig, { future: config?.future }), config);
  Object.defineProperty(theme, CONSUMER_PATHS, {
    value: [...OPT_IN_THEME_STYLE_PATHS, 'suggestion.chip.padding', 'suggestion.chip.fontWeight']
      .filter((path) => hasExplicitThemeStyle(config, path, scheme)),
  });
  return theme;
};

const CONSUMER_PATHS = Symbol('persona.themeConsumerPaths');
export const getCssVariables = (theme: PersonaTheme): Record<string, string> => {
  const variables = themeToCssVariables(theme);
  // Legacy chip defaults differ from the public token defaults. Keep them
  // available beneath host theme intent, including observer-only scheme changes.
  variables['--persona-suggestion-compat-padding'] = '6px 12px';
  variables['--persona-suggestion-compat-weight'] = '500';
  for (const path of (theme as PersonaTheme & { [CONSUMER_PATHS]?: readonly string[] })[CONSUMER_PATHS] ?? []) {
    const suffix = path.split('.').join('-');
    const value = variables[`--persona-components-${suffix}`];
    if (value !== undefined) variables[path === 'suggestion.chip.padding'
      ? '--persona-suggestion-compat-padding' : path === 'suggestion.chip.fontWeight'
        ? '--persona-suggestion-compat-weight' : `--persona-consumer-${suffix}`] = value;
  }
  return variables;
};

const appliedVariables = new WeakMap<HTMLElement, string[]>();

export const applyThemeVariables = (element: HTMLElement, config?: WidgetConfig): void => {
  applyVariables(element, getCssVariables(getActiveTheme(config)), config);
};

/** Same resolved theme, with only aliases used by the collapsed launcher. */
export const applyLauncherThemeVariables = (element: HTMLElement, config?: WidgetConfig): void => {
  applyVariables(element, launcherThemeToCssVariables(getActiveTheme(config)), config);
};

const applyVariables = (element: HTMLElement, cssVars: Record<string, string>, config?: WidgetConfig): void => {
  for (const name of appliedVariables.get(element) ?? []) {
    if (!(name in cssVars)) element.style.removeProperty(name);
  }
  appliedVariables.set(element, Object.keys(cssVars));
  for (const [name, value] of Object.entries(cssVars)) {
    element.style.setProperty(name, value);
  }

  // Stamp the resolved scheme so stylesheet rules can key scheme-specific
  // defaults (e.g. the syntax-highlight palette) off the widget's own color
  // scheme instead of the OS prefers-color-scheme, which diverges whenever a
  // host pins colorScheme. Re-applied on every theme application, so live
  // config updates and theme-observer callbacks keep it current.
  element.setAttribute("data-persona-color-scheme", getColorScheme(config));
  element.setAttribute("data-persona-defaults", resolveDefaultsVersion(config));
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
