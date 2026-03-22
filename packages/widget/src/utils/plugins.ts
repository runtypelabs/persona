import type { PersonaTheme, PersonaThemePlugin } from '../types/theme';

export function accessibilityPlugin(): PersonaThemePlugin {
  return {
    name: '@persona/accessibility',
    version: '1.0.0',
    transform(theme: PersonaTheme): PersonaTheme {
      return {
        ...theme,
        semantic: {
          ...theme.semantic,
          colors: {
            ...theme.semantic.colors,
            interactive: {
              ...theme.semantic.colors.interactive,
              focus: 'palette.colors.primary.700',
              disabled: 'palette.colors.gray.300',
            },
          },
        },
      };
    },
    cssVariables: {
      '--persona-accessibility-focus-ring':
        '0 0 0 2px var(--persona-semantic-colors-surface, #fff), 0 0 0 4px var(--persona-semantic-colors-interactive-focus, #1d4ed8)',
    },
  };
}

export function animationsPlugin(): PersonaThemePlugin {
  return {
    name: '@persona/animations',
    version: '1.0.0',
    transform(theme: PersonaTheme): PersonaTheme {
      return {
        ...theme,
        palette: {
          ...theme.palette,
          transitions: {
            fast: '150ms',
            normal: '200ms',
            slow: '300ms',
            bounce: '500ms cubic-bezier(0.68, -0.55, 0.265, 1.55)',
          },
          easings: {
            easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
            easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
            easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
          },
        },
      };
    },
    cssVariables: {
      '--persona-transition-fast': '150ms ease',
      '--persona-transition-normal': '200ms ease',
      '--persona-transition-slow': '300ms ease',
    },
  };
}

export function brandPlugin(brandConfig: {
  colors?: { primary?: string; secondary?: string; accent?: string };
  logo?: string;
}): PersonaThemePlugin {
  return {
    name: '@persona/brand',
    version: '1.0.0',
    transform(theme: PersonaTheme): PersonaTheme {
      const newPalette = { ...theme.palette };

      if (brandConfig.colors?.primary) {
        newPalette.colors = {
          ...newPalette.colors,
          primary: {
            50: adjustColor(brandConfig.colors.primary, 0.95),
            100: adjustColor(brandConfig.colors.primary, 0.9),
            200: adjustColor(brandConfig.colors.primary, 0.8),
            300: adjustColor(brandConfig.colors.primary, 0.7),
            400: adjustColor(brandConfig.colors.primary, 0.6),
            500: brandConfig.colors.primary,
            600: adjustColor(brandConfig.colors.primary, 0.8),
            700: adjustColor(brandConfig.colors.primary, 0.7),
            800: adjustColor(brandConfig.colors.primary, 0.6),
            900: adjustColor(brandConfig.colors.primary, 0.5),
            950: adjustColor(brandConfig.colors.primary, 0.45),
          },
        };
      }

      return {
        ...theme,
        palette: newPalette,
      };
    },
  };
}

export function reducedMotionPlugin(): PersonaThemePlugin {
  return {
    name: '@persona/reduced-motion',
    version: '1.0.0',
    transform(theme: PersonaTheme): PersonaTheme {
      return {
        ...theme,
        palette: {
          ...theme.palette,
          transitions: {
            fast: '0ms',
            normal: '0ms',
            slow: '0ms',
            bounce: '0ms',
          },
        },
      };
    },
    afterResolve(resolved: Record<string, string>): Record<string, string> {
      return {
        ...resolved,
        '--persona-transition-fast': '0ms',
        '--persona-transition-normal': '0ms',
        '--persona-transition-slow': '0ms',
      };
    },
  };
}

export function highContrastPlugin(): PersonaThemePlugin {
  return {
    name: '@persona/high-contrast',
    version: '1.0.0',
    transform(theme: PersonaTheme): PersonaTheme {
      return {
        ...theme,
        semantic: {
          ...theme.semantic,
          colors: {
            ...theme.semantic.colors,
            text: 'palette.colors.gray.950',
            textMuted: 'palette.colors.gray.700',
            border: 'palette.colors.gray.900',
            divider: 'palette.colors.gray.900',
          },
        },
      };
    },
  };
}

function adjustColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const nr = Math.round(r + (255 - r) * (1 - factor));
  const ng = Math.round(g + (255 - g) * (1 - factor));
  const nb = Math.round(b + (255 - b) * (1 - factor));

  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
}

export function createPlugin(config: {
  name: string;
  version: string;
  transform?: (theme: PersonaTheme) => PersonaTheme;
  cssVariables?: Record<string, string>;
  afterResolve?: (resolved: Record<string, string>) => Record<string, string>;
}): PersonaThemePlugin {
  return {
    name: config.name,
    version: config.version,
    transform: config.transform || ((theme) => theme),
    cssVariables: config.cssVariables,
    afterResolve: config.afterResolve,
  };
}
