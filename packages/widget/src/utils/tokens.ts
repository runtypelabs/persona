import type {
  DeepPartial,
  PersonaTheme,
  ResolvedToken,
  ThemeValidationResult,
  ThemeValidationError,
  CreateThemeOptions,
  ComponentTokens,
  SemanticTokens,
} from '../types/theme';
import {
  DEFAULT_FLOATING_LAUNCHER_MAX_WIDTH,
  DEFAULT_FLOATING_LAUNCHER_WIDTH,
} from '../defaults';

// Detached/docked panel defaults, shared by the panel token defaults, the alias
// fallbacks below, host-layout, the theme editor, and the artifact gate.
export const DEFAULT_PANEL_INSET = '16px';
export const DEFAULT_PANEL_CANVAS_BACKGROUND = 'transparent';

const spacing = (() => {
  const s: Record<number, string> = {};
  for (const k of [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 56, 64])
    s[k] = k === 0 ? '0px' : `${k / 4}rem`;
  return s as Record<0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 56 | 64, string>;
})();

export const DEFAULT_PALETTE = {
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
    info: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#3b82f6',
      600: '#2563eb',
      700: '#1d4ed8',
      800: '#1e40af',
      900: '#1e3a8a',
      950: '#172554',
    },
  },
  spacing,
  typography: {
    fontFamily: {
      sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
      mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    },
    fontSize: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '1.875rem',
      '4xl': '2.25rem',
    },
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
    lineHeight: {
      tight: '1.25',
      normal: '1.5',
      relaxed: '1.625',
    },
  },
  shadows: {
    none: 'none',
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
  },
  borders: {
    none: 'none',
    sm: '1px solid',
    md: '2px solid',
    lg: '4px solid',
  },
  radius: {
    none: '0px',
    sm: '0.125rem',
    md: '0.375rem',
    lg: '0.5rem',
    xl: '0.75rem',
    '2xl': '1rem',
    full: '9999px',
  },
};

export const DEFAULT_SEMANTIC: SemanticTokens = {
  colors: {
    primary: 'palette.colors.primary.500',
    secondary: 'palette.colors.secondary.500',
    // Links/Focus role: solid primary
    accent: 'palette.colors.primary.600',
    // Surfaces role: soft gray
    surface: 'palette.colors.gray.50',
    background: 'palette.colors.gray.50',
    container: 'palette.colors.gray.50',
    text: 'palette.colors.gray.900',
    textMuted: 'palette.colors.gray.500',
    textInverse: 'palette.colors.gray.50',
    // Borders role: soft gray
    border: 'palette.colors.gray.200',
    divider: 'palette.colors.gray.200',
    interactive: {
      // Primary Actions role: solid primary
      default: 'palette.colors.primary.600',
      hover: 'palette.colors.primary.700',
      // Links/Focus role: solid primary
      focus: 'palette.colors.primary.600',
      active: 'palette.colors.primary.600',
      disabled: 'palette.colors.gray.300',
    },
    feedback: {
      success: 'palette.colors.success.500',
      warning: 'palette.colors.warning.500',
      error: 'palette.colors.error.500',
      info: 'palette.colors.info.500',
    },
  },
  spacing: {
    xs: 'palette.spacing.1',
    sm: 'palette.spacing.2',
    md: 'palette.spacing.4',
    lg: 'palette.spacing.6',
    xl: 'palette.spacing.8',
    '2xl': 'palette.spacing.10',
  },
  typography: {
    fontFamily: 'palette.typography.fontFamily.sans',
    fontSize: 'palette.typography.fontSize.base',
    fontWeight: 'palette.typography.fontWeight.normal',
    lineHeight: 'palette.typography.lineHeight.normal',
  },
};

export const DEFAULT_COMPONENTS: ComponentTokens = {
  button: {
    primary: {
      // Primary Actions role: solid primary
      background: 'palette.colors.primary.500',
      foreground: 'palette.colors.primary.50',
      borderRadius: 'palette.radius.lg',
      padding: 'semantic.spacing.md',
    },
    secondary: {
      background: 'semantic.colors.surface',
      foreground: 'semantic.colors.secondary',
      borderRadius: 'palette.radius.lg',
      padding: 'semantic.spacing.md',
    },
    ghost: {
      background: 'transparent',
      foreground: 'semantic.colors.text',
      borderRadius: 'palette.radius.md',
      padding: 'semantic.spacing.sm',
      // Subtle neutral tint on hover — the composer's transparent icon buttons
      // (attachment, mention) read this via `--persona-button-ghost-hover-bg`.
      hoverBackground: 'rgba(0, 0, 0, 0.05)',
    },
  },
  input: {
    // Input role: semantic surface so host light/dark schemes cascade.
    background: 'semantic.colors.surface',
    placeholder: 'semantic.colors.textMuted',
    borderRadius: 'palette.radius.lg',
    padding: 'semantic.spacing.md',
    focus: {
      border: 'palette.colors.gray.400',
      ring: 'palette.colors.gray.400',
    },
  },
  launcher: {
    // Launcher pill role: shared surface/primary tones until a host overrides.
    background: 'semantic.colors.surface',
    foreground: 'semantic.colors.primary',
    border: 'semantic.colors.border',
    size: '60px',
    iconSize: '28px',
    borderRadius: 'palette.radius.full',
    shadow: 'palette.shadows.lg',
  },
  panel: {
    width: DEFAULT_FLOATING_LAUNCHER_WIDTH,
    maxWidth: DEFAULT_FLOATING_LAUNCHER_MAX_WIDTH,
    height: '600px',
    maxHeight: 'calc(100vh - 80px)',
    borderRadius: 'palette.radius.xl',
    shadow: 'palette.shadows.xl',
    inset: DEFAULT_PANEL_INSET,
    canvasBackground: DEFAULT_PANEL_CANVAS_BACKGROUND,
  },
  header: {
    // Header role: solid primary. Border, subtitle, and action icons stay
    // unset so they derive from this background/foreground pair.
    background: 'palette.colors.primary.500',
    foreground: 'palette.colors.primary.50',
    borderRadius: 'palette.radius.xl palette.radius.xl 0 0',
    padding: 'semantic.spacing.md',
    iconBackground: 'palette.colors.primary.600',
    iconForeground: 'palette.colors.primary.50',
  },
  message: {
    user: {
      // User Messages role: solid primary
      background: 'palette.colors.primary.500',
      text: 'palette.colors.primary.50',
      borderRadius: 'palette.radius.lg',
      shadow: 'palette.shadows.sm',
    },
    assistant: {
      // Assistant Messages role: semantic neutral container.
      background: 'semantic.colors.container',
      text: 'semantic.colors.text',
      borderRadius: 'palette.radius.lg',
      border: 'semantic.colors.border',
      shadow: 'palette.shadows.sm',
    },
    border: 'semantic.colors.border',
  },
  introCard: {
    // Flat by default: the greeting reads as plain text on the transcript
    // background (the industry norm), not an elevated card.
    background: 'transparent',
    borderRadius: 'palette.radius.2xl',
    padding: 'semantic.spacing.lg',
    shadow: 'palette.shadows.none',
  },
  suggestion: {
    chip: {
      background: 'semantic.colors.surface',
      foreground: 'semantic.colors.text',
      border: 'semantic.colors.border',
      borderRadius: 'palette.radius.full',
      padding: '0.5rem 0.875rem',
      gap: '0.5rem',
      itemGap: '8px',
      minHeight: '36px',
      fontSize: '0.8125rem',
      lineHeight: '1.25',
      iconSize: '16px',
      hoverBackground: 'palette.colors.gray.100',
      hoverBorder: 'palette.colors.gray.300',
      pressedBackground: 'palette.colors.gray.200',
      focusRing: 'semantic.colors.interactive.focus',
      disabledOpacity: '0.5',
    },
    card: {
      background: 'semantic.colors.surface',
      foreground: 'semantic.colors.text',
      border: 'semantic.colors.border',
      borderRadius: 'palette.radius.xl',
      padding: '1rem',
      shadow: 'palette.shadows.sm',
      gap: '0.625rem',
      itemGap: '8px',
      minHeight: '72px',
      fontSize: '0.875rem',
      lineHeight: '1.35',
      iconSize: '18px',
      hoverBackground: 'palette.colors.gray.100',
      hoverBorder: 'palette.colors.gray.300',
      pressedBackground: 'palette.colors.gray.200',
      focusRing: 'semantic.colors.interactive.focus',
      disabledOpacity: '0.5',
    },
    list: {
      background: 'transparent',
      foreground: 'semantic.colors.text',
      border: 'semantic.colors.border',
      borderRadius: 'palette.radius.md',
      padding: '0.75rem',
      gap: '0.625rem',
      itemGap: '8px',
      minHeight: '44px',
      fontSize: '0.875rem',
      lineHeight: '1.35',
      iconSize: '17px',
      hoverBackground: 'palette.colors.gray.100',
      hoverBorder: 'palette.colors.gray.300',
      pressedBackground: 'palette.colors.gray.200',
      focusRing: 'semantic.colors.interactive.focus',
      disabledOpacity: '0.5',
    },
  },
  toolBubble: {
    shadow: 'palette.shadows.sm',
  },
  reasoningBubble: {
    shadow: 'palette.shadows.sm',
  },
  composer: {
    shadow: 'palette.shadows.none',
  },
  scrollbar: {
    thumb: 'semantic.colors.border',
    track: 'transparent',
  },
  markdown: {
    inlineCode: {
      background: 'palette.colors.gray.50',
      foreground: 'palette.colors.gray.900',
    },
    link: {
      // Links/Focus role: solid primary
      foreground: 'palette.colors.primary.600',
    },
    prose: {
      fontFamily: 'inherit',
    },
    codeBlock: {
      background: 'semantic.colors.container',
      borderColor: 'semantic.colors.border',
      textColor: 'inherit',
      borderRadius: 'palette.radius.md',
    },
    table: {
      headerBackground: 'semantic.colors.container',
      borderColor: 'semantic.colors.border',
    },
    hr: {
      color: 'semantic.colors.divider',
    },
    blockquote: {
      borderColor: 'palette.colors.gray.900',
      background: 'transparent',
      textColor: 'palette.colors.gray.500',
    },
  },
  collapsibleWidget: {
    container: 'palette.colors.gray.50',
    surface: 'semantic.colors.surface',
    border: 'semantic.colors.border',
  },
  voice: {
    recording: {
      indicator: 'palette.colors.error.500',
      background: 'palette.colors.error.50',
      border: 'palette.colors.error.200',
    },
    processing: {
      icon: 'palette.colors.primary.500',
      background: 'palette.colors.primary.50',
    },
    speaking: {
      icon: 'palette.colors.success.500',
    },
  },
  // Neutral surface card (components/approval-actions.ts). The primary action
  // anchors to the brand primary; deny is a neutral tinted button. Consumers who
  // themed these (or set config.approval.* color overrides) still win.
  approval: {
    requested: {
      background: 'semantic.colors.surface',
      border: 'semantic.colors.border',
      text: 'palette.colors.gray.900',
      shadow: '0 1px 2px 0 rgba(11, 11, 11, 0.06), 0 2px 8px 0 rgba(11, 11, 11, 0.04)',
    },
    approve: {
      background: 'semantic.colors.primary',
      foreground: 'semantic.colors.textInverse',
      borderRadius: 'palette.radius.md',
      padding: 'semantic.spacing.sm',
    },
    deny: {
      background: 'semantic.colors.container',
      foreground: 'semantic.colors.text',
      borderRadius: 'palette.radius.md',
      padding: 'semantic.spacing.sm',
    },
  },
  attachment: {
    image: {
      background: 'palette.colors.gray.100',
      border: 'palette.colors.gray.200',
    },
  },
  scrollToBottom: {
    background: 'components.button.primary.background',
    foreground: 'components.button.primary.foreground',
    border: 'semantic.colors.primary',
    size: '40px',
    borderRadius: 'palette.radius.full',
    shadow: 'palette.shadows.sm',
    padding: '0.5rem 0.875rem',
    gap: '0.5rem',
    fontSize: '0.875rem',
    iconSize: '14px',
  },
  artifact: {
    pane: {
      background: 'semantic.colors.container',
      toolbarBackground: 'semantic.colors.container',
    },
  },
};

export function resolveTokenValue(theme: PersonaTheme, path: string): string | undefined {
  if (
    !path.startsWith('palette.') &&
    !path.startsWith('semantic.') &&
    !path.startsWith('components.')
  ) {
    return path;
  }

  const parts = path.split('.');
  let current: any = theme;

  for (const part of parts) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[part];
  }

  if (
    typeof current === 'string' &&
    (current.startsWith('palette.') ||
      current.startsWith('semantic.') ||
      current.startsWith('components.'))
  ) {
    return resolveTokenValue(theme, current);
  }

  return current;
}

export function resolveTokens(theme: PersonaTheme): Record<string, ResolvedToken> {
  const resolved: Record<string, ResolvedToken> = {};

  function resolveObject(obj: any, prefix: string) {
    for (const [key, value] of Object.entries(obj)) {
      const path = `${prefix}.${key}`;

      if (typeof value === 'string') {
        const resolvedValue = resolveTokenValue(theme, value);
        if (resolvedValue !== undefined) {
          resolved[path] = {
            path,
            value: resolvedValue,
            type:
              prefix.includes('color')
                ? 'color'
                : prefix.includes('spacing')
                  ? 'spacing'
                  : prefix.includes('typography')
                    ? 'typography'
                    : prefix.includes('shadow')
                      ? 'shadow'
                      : prefix.includes('border')
                        ? 'border'
                        : 'color',
          };
        }
      } else if (typeof value === 'object' && value !== null) {
        resolveObject(value, path);
      }
    }
  }

  resolveObject(theme.palette, 'palette');
  resolveObject(theme.semantic, 'semantic');
  resolveObject(theme.components, 'components');

  return resolved;
}

export function validateTheme(theme: Partial<PersonaTheme>): ThemeValidationResult {
  const errors: ThemeValidationError[] = [];
  const warnings: ThemeValidationError[] = [];

  if (!theme.palette) {
    errors.push({
      path: 'palette',
      message: 'Theme must include a palette',
      severity: 'error',
    });
  }

  if (!theme.semantic) {
    warnings.push({
      path: 'semantic',
      message: 'No semantic tokens defined - defaults will be used',
      severity: 'warning',
    });
  }

  if (!theme.components) {
    warnings.push({
      path: 'components',
      message: 'No component tokens defined - defaults will be used',
      severity: 'warning',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function mergeRecords(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = result[key];
    if (existing && typeof existing === 'object' && !Array.isArray(existing) &&
        value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = mergeRecords(
        existing as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

function deepMergeComponents(
  base: ComponentTokens,
  override?: Partial<ComponentTokens>
): ComponentTokens {
  if (!override) return base;
  return mergeRecords(
    base as unknown as Record<string, unknown>,
    override as unknown as Record<string, unknown>
  ) as unknown as ComponentTokens;
}

export function createTheme(
  userConfig?: DeepPartial<PersonaTheme>,
  options: CreateThemeOptions = {}
): PersonaTheme {
  const baseTheme: PersonaTheme = {
    palette: DEFAULT_PALETTE as PersonaTheme['palette'],
    semantic: DEFAULT_SEMANTIC as PersonaTheme['semantic'],
    components: DEFAULT_COMPONENTS as PersonaTheme['components'],
  };

  let theme: PersonaTheme = {
    palette: {
      ...baseTheme.palette,
      ...userConfig?.palette,
      colors: {
        ...baseTheme.palette.colors,
        ...userConfig?.palette?.colors,
      },
      spacing: {
        ...baseTheme.palette.spacing,
        ...userConfig?.palette?.spacing,
      },
      typography: {
        ...baseTheme.palette.typography,
        ...userConfig?.palette?.typography,
      },
      shadows: {
        ...baseTheme.palette.shadows,
        ...userConfig?.palette?.shadows,
      },
      borders: {
        ...baseTheme.palette.borders,
        ...userConfig?.palette?.borders,
      },
      radius: {
        ...baseTheme.palette.radius,
        ...userConfig?.palette?.radius,
      },
    },
    semantic: {
      ...baseTheme.semantic,
      ...userConfig?.semantic,
      colors: {
        ...baseTheme.semantic.colors,
        ...userConfig?.semantic?.colors,
        interactive: {
          ...baseTheme.semantic.colors.interactive,
          ...userConfig?.semantic?.colors?.interactive,
        },
        feedback: {
          ...baseTheme.semantic.colors.feedback,
          ...userConfig?.semantic?.colors?.feedback,
        },
      },
      spacing: {
        ...baseTheme.semantic.spacing,
        ...userConfig?.semantic?.spacing,
      },
      typography: {
        ...baseTheme.semantic.typography,
        ...userConfig?.semantic?.typography,
      },
    },
    components: deepMergeComponents(
      baseTheme.components,
      userConfig?.components as Partial<ComponentTokens> | undefined
    ),
  } as PersonaTheme;

  if (options.validate !== false) {
    const validation = validateTheme(theme);
    if (!validation.valid) {
      throw new Error(
        `Theme validation failed: ${validation.errors.map((e) => e.message).join(', ')}`
      );
    }
  }

  if (options.plugins) {
    for (const plugin of options.plugins) {
      theme = plugin.transform(theme);
    }
  }

  return theme;
}

/** Coerce a unitless "0" to "0px" for vars consumed inside length calc()s. */
const zeroLength = (value: string): string => (value.trim() === '0' ? '0px' : value);

const V = '--persona-';

/**
 * WCAG relative luminance of a hex (3/4/6/8 digit) or rgb()/rgba() color.
 * Returns undefined when the value is not parseable, so callers can fall back.
 */
const relativeLuminance = (color: string | undefined): number | undefined => {
  if (!color) return undefined;
  const value = color.trim().toLowerCase();
  let channels: number[] | undefined;

  if (value.charCodeAt(0) === 35 /* '#' */) {
    const digits = value.slice(1);
    if (!/^[0-9a-f]+$/.test(digits)) return undefined;
    if (digits.length === 3 || digits.length === 4) {
      channels = [0, 1, 2].map((i) => parseInt(digits[i] + digits[i], 16));
    } else if (digits.length === 6 || digits.length === 8) {
      channels = [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
    }
  } else {
    const match = value.match(/^rgba?\(([^)]+)\)$/);
    if (match) {
      const parts = match[1].split(/[,/\s]+/).filter(Boolean);
      if (parts.length >= 3) {
        channels = parts.slice(0, 3).map((raw) => {
          const pct = raw.endsWith('%');
          const n = parseFloat(pct ? raw.slice(0, -1) : raw);
          return pct ? (n / 100) * 255 : n;
        });
      }
    }
  }

  if (!channels || channels.some((c) => !Number.isFinite(c))) return undefined;
  const [r, g, b] = channels.map((c) => {
    const v = Math.max(0, Math.min(255, c)) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Below the WCAG white/black crossover luminance, white text reads better. */
const DARK_SURFACE_LUMINANCE = 0.179;

/**
 * Each row: [aliasSuffix, ...sources]. A source starting with '=' is a
 * literal; anything else is a cssVars lookup by suffix. First defined wins;
 * rows with no defined source emit nothing. Row order is significant.
 */
type AliasRow = [string, ...string[]];

const emitAliases = (cssVars: Record<string, string>, rows: AliasRow[]): void => {
  for (const [alias, ...sources] of rows) {
    let value: string | undefined;
    for (const s of sources) {
      value = s.charCodeAt(0) === 61 /* '=' */ ? s.slice(1) : cssVars[V + s];
      if (value !== undefined) break;
    }
    if (value !== undefined) cssVars[V + alias] = value;
  }
};

export function themeToCssVariables(theme: PersonaTheme): Record<string, string> {
  const resolved = resolveTokens(theme);
  const cssVars: Record<string, string> = {};

  for (const [path, token] of Object.entries(resolved)) {
    const varName = path.replace(/\./g, '-');
    cssVars[`--persona-${varName}`] = token.value;
  }

  emitAliases(cssVars, [
    ['primary', 'semantic-colors-primary', 'palette-colors-primary-500'],
    ['secondary', 'semantic-colors-secondary', 'palette-colors-secondary-500'],
    ['accent', 'semantic-colors-accent', 'palette-colors-accent-500'],
    ['surface', 'semantic-colors-surface', 'palette-colors-gray-50'],
    ['background', 'semantic-colors-background', 'palette-colors-gray-50'],
    ['container', 'semantic-colors-container', 'palette-colors-gray-100'],
    ['text', 'semantic-colors-text', 'palette-colors-gray-900'],
    ['text-muted', 'semantic-colors-text-muted', 'palette-colors-gray-500'],
    ['text-inverse', 'semantic-colors-text-inverse', 'palette-colors-gray-50'],
    ['border', 'semantic-colors-border', 'palette-colors-gray-200'],
    ['divider', 'semantic-colors-divider', 'palette-colors-gray-200'],
    ['muted', 'text-muted'],
    ['voice-recording-indicator', 'components-voice-recording-indicator', 'palette-colors-error-500'],
    ['voice-recording-bg', 'components-voice-recording-background', 'palette-colors-error-50'],
    ['voice-processing-icon', 'components-voice-processing-icon', 'palette-colors-primary-500'],
    ['voice-speaking-icon', 'components-voice-speaking-icon', 'palette-colors-success-500'],
    ['approval-bg', 'components-approval-requested-background', 'surface'],
    ['approval-border', 'components-approval-requested-border', 'border'],
    ['approval-text', 'components-approval-requested-text', 'palette-colors-gray-900'],
    ['approval-shadow', 'components-approval-requested-shadow', '=0 1px 2px 0 rgba(11, 11, 11, 0.06), 0 2px 8px 0 rgba(11, 11, 11, 0.04)'],
    ['approval-approve-bg', 'components-approval-approve-background', 'button-primary-bg'],
    ['approval-deny-bg', 'components-approval-deny-background', 'container'],
    ['attachment-image-bg', 'components-attachment-image-background', 'palette-colors-gray-100'],
    ['attachment-image-border', 'components-attachment-image-border', 'palette-colors-gray-200'],
    ['font-family', 'semantic-typography-fontFamily', 'palette-typography-fontFamily-sans'],
    ['font-size', 'semantic-typography-fontSize', 'palette-typography-fontSize-base'],
    ['font-weight', 'semantic-typography-fontWeight', 'palette-typography-fontWeight-normal'],
    ['line-height', 'semantic-typography-lineHeight', 'palette-typography-lineHeight-normal'],
    ['input-font-family', 'font-family'],
    ['input-font-weight', 'font-weight'],
    ['radius-sm', 'palette-radius-sm', '=0.125rem'],
    ['radius-md', 'palette-radius-md', '=0.375rem'],
    ['radius-lg', 'palette-radius-lg', '=0.5rem'],
    ['radius-xl', 'palette-radius-xl', '=0.75rem'],
    ['radius-full', 'palette-radius-full', '=9999px'],
    ['launcher-radius', 'components-launcher-borderRadius', 'palette-radius-full', '=9999px'],
    ['launcher-bg', 'components-launcher-background', 'surface'],
    ['launcher-fg', 'components-launcher-foreground', 'primary'],
  ]);
  // Subtitle keeps the shared muted tone while the foreground is stock (it
  // resolves to primary); a custom foreground washes to 70% so both pill
  // text lines recolor together. Compared by resolved value, not key
  // presence: DEFAULT_COMPONENTS materializes launcher.foreground into
  // every theme.
  const launcherFg = cssVars['--persona-components-launcher-foreground'];
  cssVars['--persona-launcher-fg-muted'] =
    launcherFg && launcherFg !== cssVars['--persona-primary']
      ? `color-mix(in srgb, ${launcherFg} 70%, transparent)`
      : cssVars['--persona-muted'];

  emitAliases(cssVars, [
    ['launcher-border', 'components-launcher-border', 'border'],
    ['button-primary-bg', 'components-button-primary-background', 'primary'],
    ['button-primary-fg', 'components-button-primary-foreground', 'text-inverse'],
    ['button-radius', 'components-button-primary-borderRadius', 'palette-radius-full', '=9999px'],
    // Stop-state send button. No fallback source: widget.css carries the idle
    // appearance in its var() fallbacks, so an unset token must stay undefined.
    ['button-stop-bg', 'components-button-stop-background'],
    ['button-stop-fg', 'components-button-stop-foreground'],
  ]);

  // Ghost variant: transparent, neutral-foreground icon buttons (the composer's
  // attachment + mention affordances). Wired to `components.button.ghost.*`.
  emitAliases(cssVars, [
    ['button-ghost-bg', 'components-button-ghost-background', '=transparent'],
    ['button-ghost-fg', 'components-button-ghost-foreground', 'text'],
    ['button-ghost-radius', 'components-button-ghost-borderRadius', 'radius-md', '=0.375rem'],
    ['button-ghost-hover-bg', 'components-button-ghost-hoverBackground', '=rgba(0, 0, 0, 0.05)'],
    ['panel-radius', 'components-panel-borderRadius', 'radius-xl', '=0.75rem'],
  ]);

  cssVars['--persona-panel-border'] =
    cssVars['--persona-components-panel-border'] ?? `1px solid ${cssVars['--persona-border']}`;

  emitAliases(cssVars, [
    ['panel-shadow', 'components-panel-shadow', 'palette-shadows-xl', '=0 25px 50px -12px rgba(0, 0, 0, 0.25)'],
  ]);

  cssVars['--persona-panel-inset'] =
    cssVars['--persona-components-panel-inset'] ?? DEFAULT_PANEL_INSET;
  cssVars['--persona-panel-canvas-bg'] =
    cssVars['--persona-components-panel-canvasBackground'] ?? DEFAULT_PANEL_CANVAS_BACKGROUND;

  emitAliases(cssVars, [
    ['launcher-shadow', 'components-launcher-shadow', '=0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)'],
    ['input-radius', 'components-input-borderRadius', 'radius-lg', '=0.5rem'],
    ['message-user-radius', 'components-message-user-borderRadius', 'radius-lg', '=0.5rem'],
    ['message-assistant-radius', 'components-message-assistant-borderRadius', 'radius-lg', '=0.5rem'],
  ]);

  // Component-level color overrides: these map component tokens to
  // dedicated CSS variables that the widget CSS reads for individual elements.
  emitAliases(cssVars, [
    ['header-bg', 'components-header-background', 'surface'],
  ]);

  // The background/foreground pair anchors every other header color: unset
  // text and border keys mix the two rather than falling back to page chrome.
  const headerBg = cssVars['--persona-header-bg'];
  const headerFg = cssVars['--persona-components-header-foreground'];
  const headerMutedFg = headerFg ? `color-mix(in srgb, ${headerFg} 72%, ${headerBg})` : undefined;
  cssVars['--persona-header-border'] =
    cssVars['--persona-components-header-border'] ??
    (headerFg ? `color-mix(in srgb, ${headerFg} 14%, ${headerBg})` : undefined) ??
    cssVars['--persona-divider'];

  emitAliases(cssVars, [
    ['header-icon-bg', 'components-header-iconBackground', 'primary'],
    ['header-icon-fg', 'components-header-iconForeground', 'text-inverse'],
  ]);

  // `title.color` / `subtitle.color` supersede the legacy *Foreground tokens.
  cssVars['--persona-header-title-fg'] =
    cssVars['--persona-components-header-title-color'] ??
    cssVars['--persona-components-header-titleForeground'] ??
    headerFg ??
    cssVars['--persona-primary'];
  cssVars['--persona-header-subtitle-fg'] =
    cssVars['--persona-components-header-subtitle-color'] ??
    cssVars['--persona-components-header-subtitleForeground'] ??
    headerMutedFg ??
    cssVars['--persona-text-muted'];
  cssVars['--persona-header-action-icon-fg'] =
    cssVars['--persona-components-header-actionIconForeground'] ??
    headerMutedFg ??
    cssVars['--persona-muted'];

  // Unified header control box. Every header icon button reads these two from
  // the stylesheet; per-control config keys stay inline and win. The third
  // control token, `header.controlStrokeWidth`, needs no alias: widget.css
  // reads its auto-emitted `--persona-components-header-controlStrokeWidth`
  // directly and carries the 1.5 default in the var() fallback.
  emitAliases(cssVars, [
    ['header-control-size', 'components-header-controlSize', '=32px'],
    ['header-control-icon-size', 'components-header-controlIconSize', '=20px'],
  ]);

  const headerTokens = theme.components?.header;
  if (headerTokens?.shadow) cssVars['--persona-header-shadow'] = headerTokens.shadow;
  if (headerTokens?.borderBottom) cssVars['--persona-header-border-bottom'] = headerTokens.borderBottom;
  // Conditional: the stylesheet carries `auto` / the rail's own fallback chain,
  // so an unset token must leave the variable undefined.
  if (headerTokens?.minHeight) cssVars['--persona-header-min-height'] = headerTokens.minHeight;

  // Messages rail header strip. Same conditional rule: the chunk's CSS carries
  // the surface/border/height fallback chain when a theme says nothing.
  const railHeaderBg = cssVars['--persona-components-history-railHeader-background'];
  if (railHeaderBg) cssVars['--persona-history-rail-header-bg'] = railHeaderBg;
  const railHeaderBorder = cssVars['--persona-components-history-railHeader-border'];
  if (railHeaderBorder) cssVars['--persona-history-rail-header-border'] = railHeaderBorder;
  const railHeaderMinHeight = cssVars['--persona-components-history-railHeader-minHeight'];
  if (railHeaderMinHeight)
    cssVars['--persona-history-rail-header-min-height'] = railHeaderMinHeight;

  // Floating (overlay-collapsed) rail. Same conditional rule: the host's
  // inline styles carry every default in their var() fallback.
  for (const [token, alias] of [
    ['margin', 'margin'],
    ['borderRadius', 'radius'],
    ['shadow', 'shadow'],
    ['background', 'bg'],
  ] as const) {
    const value = cssVars[`--persona-components-history-overlay-${token}`];
    if (value) cssVars[`--persona-history-overlay-${alias}`] = value;
  }

  // Row overflow menu. Same conditional rule: the chunk's CSS carries the
  // elevated color-mix default in its var() fallback.
  for (const [token, alias] of [
    ['background', 'bg'],
    ['borderRadius', 'radius'],
  ] as const) {
    const value = cssVars[`--persona-components-history-menu-${token}`];
    if (value) cssVars[`--persona-history-menu-${alias}`] = value;
  }
  // Messages enter/exit motion. Read straight off the theme: durations are
  // authored as bare millisecond NUMBERS, and resolveTokens collects only
  // string leaves, so these never reach the flattened vars. A unitless value
  // gains "ms" for the CSS animation shorthand; 0 emits "0ms" (leg disabled).
  const historyMotion = theme.components?.history?.motion;
  if (historyMotion) {
    const asTime = (value: number | string | undefined): string | undefined => {
      if (value === undefined) return undefined;
      const s = String(value).trim();
      return /^\d+(\.\d+)?$/.test(s) ? `${s}ms` : s;
    };
    const enterMs = asTime(historyMotion.enterDurationMs);
    if (enterMs !== undefined) cssVars['--persona-history-enter-ms'] = enterMs;
    const exitMs = asTime(historyMotion.exitDurationMs);
    if (exitMs !== undefined) cssVars['--persona-history-exit-ms'] = exitMs;
    if (historyMotion.enterEasing)
      cssVars['--persona-history-enter-easing'] = historyMotion.enterEasing;
    if (historyMotion.exitEasing)
      cssVars['--persona-history-exit-easing'] = historyMotion.exitEasing;
  }
  // Destructive action text. The chunk falls back to the light-surface
  // error-600; the built-in dark theme sets this to a passing lighter red.
  const historyDangerFg = cssVars['--persona-components-history-dangerForeground'];
  if (historyDangerFg) cssVars['--persona-history-danger-fg'] = historyDangerFg;
  // Confirmation dialog. The danger fill/label pair is always emitted so the
  // dialog follows the error palette; scrim and shadow stay conditional with
  // the dialog's inline fallbacks as the defaults.
  cssVars['--persona-danger'] =
    cssVars['--persona-components-history-confirm-dangerBackground'] ??
    cssVars['--persona-palette-colors-error-700'] ??
    '#b42318';
  cssVars['--persona-danger-fg'] =
    cssVars['--persona-components-history-confirm-dangerForeground'] ?? '#ffffff';
  for (const token of ['scrim', 'shadow'] as const) {
    const value = cssVars[`--persona-components-history-confirm-${token}`];
    if (value) cssVars[`--persona-history-confirm-${token}`] = value;
  }

  // Portaled control tooltip. Same conditional rule: widget.css carries the
  // built-in look in every var() fallback, so an unset token stays undefined.
  for (const [token, alias] of [
    ['background', 'background'],
    ['foreground', 'foreground'],
    ['hintForeground', 'hint-fg'],
    ['borderRadius', 'radius'],
    ['fontSize', 'font-size'],
    ['padding', 'padding'],
    ['maxWidth', 'max-width'],
    ['shadow', 'shadow'],
  ]) {
    const value = cssVars[`--persona-components-tooltip-${token}`];
    if (value) cssVars[`--persona-tooltip-${alias}`] = value;
  }
  // Booleans never resolve into a token, so the arrow reads off the theme.
  if (theme.components?.tooltip?.arrow === false)
    cssVars['--persona-tooltip-arrow-display'] = 'none';

  // Per-message action row (copy, vote, read aloud). Same conditional rule:
  // widget.css falls back to the scheme-aware ghost wash and semantic text, so
  // an unset token must leave the variable undefined.
  for (const [token, alias] of [
    ['hoverBackground', 'hover-bg'],
    ['hoverForeground', 'hover-fg'],
    ['borderRadius', 'radius'],
  ] as const) {
    const value = cssVars[`--persona-components-messageActions-${token}`];
    if (value) cssVars[`--persona-message-action-${alias}`] = value;
  }

  // Intro card aliases: short names the panel inline-styles read directly.
  // The full-path `--persona-components-introCard-*` variables auto-emit above.
  // Default is flat (transparent, no shadow): the greeting renders as plain
  // text on the transcript background; set introCard tokens for a card look.
  emitAliases(cssVars, [
    ['intro-card-bg', 'components-introCard-background', '=transparent'],
    ['intro-card-radius', 'components-introCard-borderRadius', '=1rem'],
  ]);

  // Flat cards (transparent background, no shadow) drop the horizontal
  // component of the stock padding so the welcome text shares the content
  // column's left edge instead of carrying an invisible card inset. Compared
  // by resolved value, not key presence: DEFAULT_COMPONENTS materializes the
  // introCard tokens into every theme. A non-stock padding is emitted as-is;
  // '1.5rem 1.5rem' forces the symmetric inset on a flat card.
  const introBg = cssVars['--persona-components-introCard-background'];
  const introShadow = cssVars['--persona-components-introCard-shadow'];
  const introCardFlat =
    (!introBg || introBg === 'transparent' || introBg === 'none') &&
    (!introShadow || introShadow === 'none');
  const introPadding =
    cssVars['--persona-components-introCard-padding'] ?? '1.5rem';
  cssVars['--persona-intro-card-padding'] =
    introCardFlat && introPadding === '1.5rem' ? '1.5rem 0' : introPadding;

  emitAliases(cssVars, [
    ['intro-card-shadow', 'components-introCard-shadow', '=none'],
    ['intro-card-border', 'components-introCard-border', '=none'],
    ['input-background', 'components-input-background', 'surface'],
    ['input-placeholder', 'components-input-placeholder', 'text-muted'],
    ['input-backdrop-filter', 'components-input-backdropFilter', '=none'],
    ['message-user-bg', 'components-message-user-background', 'accent'],
    ['message-user-text', 'components-message-user-text', 'text-inverse'],
    ['message-user-shadow', 'components-message-user-shadow', '=0 5px 15px rgba(15, 23, 42, 0.08)'],
    ['message-assistant-bg', 'components-message-assistant-background', 'surface'],
    ['message-assistant-text', 'components-message-assistant-text', 'text'],
    ['message-assistant-border', 'components-message-assistant-border', 'border'],
    ['message-assistant-shadow', 'components-message-assistant-shadow', '=0 1px 2px 0 rgb(0 0 0 / 0.05)'],
    ['scroll-to-bottom-bg', 'components-scrollToBottom-background', 'button-primary-bg', 'accent'],
    ['scroll-to-bottom-fg', 'components-scrollToBottom-foreground', 'button-primary-fg', 'text-inverse'],
    ['scroll-to-bottom-border', 'components-scrollToBottom-border', 'primary'],
    ['scroll-to-bottom-size', 'components-scrollToBottom-size', '=40px'],
    ['scroll-to-bottom-radius', 'components-scrollToBottom-borderRadius', 'button-radius', 'radius-full', '=9999px'],
    ['scroll-to-bottom-shadow', 'components-scrollToBottom-shadow', 'palette-shadows-sm', '=0 1px 2px 0 rgb(0 0 0 / 0.05)'],
    ['scroll-to-bottom-padding', 'components-scrollToBottom-padding', '=0.5rem 0.875rem'],
    ['scroll-to-bottom-gap', 'components-scrollToBottom-gap', '=0.5rem'],
    ['scroll-to-bottom-font-size', 'components-scrollToBottom-fontSize', 'palette-typography-fontSize-sm', '=0.875rem'],
    ['scroll-to-bottom-icon-size', 'components-scrollToBottom-iconSize', '=14px'],
    ['tool-bubble-shadow', 'components-toolBubble-shadow', '=0 5px 15px rgba(15, 23, 42, 0.08)'],
    ['reasoning-bubble-shadow', 'components-reasoningBubble-shadow', '=0 5px 15px rgba(15, 23, 42, 0.08)'],
    ['composer-shadow', 'components-composer-shadow', '=none'],
  ]);

  // Composer spacing/type. Fallbacks reproduce the utility classes the form
  // used to carry (`px-4 py-3`, `gap-2`, `text-sm`) exactly.
  emitAliases(cssVars, [
    ['composer-padding', 'components-composer-padding', '=0.75rem 1rem'],
    ['composer-gap', 'components-composer-gap', '=0.5rem'],
    ['composer-font-size', 'components-composer-fontSize', '=0.875rem'],
    ['composer-line-height', 'components-composer-lineHeight', '=1.25rem'],
    // Unified composer control box. Every icon control in the action row reads
    // these two from the stylesheet; per-control config keys stay inline and win.
    ['composer-control-size', 'components-composer-controlSize', '=40px'],
    ['composer-control-icon-size', 'components-composer-controlIconSize', '=24px'],
    // Motion: one timing pair + easing for every composer animation. A `0ms`
    // duration is a kill switch; reduced-motion is enforced in CSS on top.
    ['motion-duration-fast', 'components-motion-durationFast', '=120ms'],
    ['motion-duration-base', 'components-motion-durationBase', '=200ms'],
    ['motion-easing', 'components-motion-easing', '=cubic-bezier(0.2, 0, 0, 1)'],
    ['composer-border-color', 'components-composer-borderColor', 'border', '=#e5e7eb'],
    ['composer-overlay-band', 'components-composer-overlayBand', '=transparent'],
    // `components.composer.segmented.*` and `.modelPicker.*` get no short
    // aliases: the rows cost gzip in the critical launcher bundle, which never
    // draws a composer. widget.css reads the auto-emitted full paths, like
    // introCard title/subtitle.
    ['scrollbar-thumb', 'components-scrollbar-thumb', 'border', '=#e5e7eb'],
    ['scrollbar-track', 'components-scrollbar-track', '=transparent'],
    ['md-inline-code-bg', 'components-markdown-inlineCode-background', 'container'],
    ['md-inline-code-color', 'components-markdown-inlineCode-foreground', 'text'],
    ['md-link-color', 'components-markdown-link-foreground', 'accent', '=#0f0f0f'],
  ]);

  const mdH1Size = cssVars['--persona-components-markdown-heading-h1-fontSize'];
  if (mdH1Size) cssVars['--persona-md-h1-size'] = mdH1Size;
  const mdH1Weight = cssVars['--persona-components-markdown-heading-h1-fontWeight'];
  if (mdH1Weight) cssVars['--persona-md-h1-weight'] = mdH1Weight;
  const mdH2Size = cssVars['--persona-components-markdown-heading-h2-fontSize'];
  if (mdH2Size) cssVars['--persona-md-h2-size'] = mdH2Size;
  const mdH2Weight = cssVars['--persona-components-markdown-heading-h2-fontWeight'];
  if (mdH2Weight) cssVars['--persona-md-h2-weight'] = mdH2Weight;

  const mdProseFont = cssVars['--persona-components-markdown-prose-fontFamily'];
  if (mdProseFont && mdProseFont !== 'inherit') {
    cssVars['--persona-md-prose-font-family'] = mdProseFont;
  }

  // Markdown code block
  emitAliases(cssVars, [
    ['md-code-block-bg', 'components-markdown-codeBlock-background', 'container'],
    ['md-code-block-border-color', 'components-markdown-codeBlock-borderColor', 'border'],
    ['md-code-block-text-color', 'components-markdown-codeBlock-textColor', '=inherit'],
  ]);

  // Follows the palette radius so square-corner themes get square code blocks;
  // the 0.375rem fallback matches palette.radius.md's default.
  emitAliases(cssVars, [
    ['md-code-block-border-radius', 'components-markdown-codeBlock-borderRadius', 'radius-md', '=0.375rem'],
  ]);

  // Markdown table
  emitAliases(cssVars, [
    ['md-table-header-bg', 'components-markdown-table-headerBackground', 'container'],
    ['md-table-border-color', 'components-markdown-table-borderColor', 'border'],
  ]);

  // Markdown HR
  emitAliases(cssVars, [
    ['md-hr-color', 'components-markdown-hr-color', 'divider'],
  ]);

  // Markdown blockquote
  emitAliases(cssVars, [
    ['md-blockquote-border-color', 'components-markdown-blockquote-borderColor', 'palette-colors-gray-900'],
    ['md-blockquote-bg', 'components-markdown-blockquote-background', '=transparent'],
    ['md-blockquote-text-color', 'components-markdown-blockquote-textColor', 'palette-colors-gray-500'],
  ]);

  // Collapsible widget chrome (tool/reasoning/approval bubbles)
  cssVars['--cw-container'] =
    cssVars['--persona-components-collapsibleWidget-container'] ?? cssVars['--persona-surface'];
  cssVars['--cw-surface'] =
    cssVars['--persona-components-collapsibleWidget-surface'] ?? cssVars['--persona-surface'];
  cssVars['--cw-border'] =
    cssVars['--persona-components-collapsibleWidget-border'] ?? cssVars['--persona-border'];

  emitAliases(cssVars, [
    ['message-border', 'components-message-border', 'border'],
  ]);

  // Bubble geometry/type per role. No fallback source: the message layout
  // preset's value is carried in the consuming var() fallback (inline on the
  // bubble for type/padding, in widget.css for the row width cap), so an unset
  // token must leave the variable undefined.
  emitAliases(cssVars, [
    ['message-user-padding', 'components-message-user-padding'],
    ['message-user-max-width', 'components-message-user-maxWidth'],
    ['message-user-font-size', 'components-message-user-fontSize'],
    ['message-user-font-family', 'components-message-user-fontFamily'],
    ['message-user-line-height', 'components-message-user-lineHeight'],
    ['message-assistant-padding', 'components-message-assistant-padding'],
    ['message-assistant-max-width', 'components-message-assistant-maxWidth'],
    ['message-assistant-font-size', 'components-message-assistant-fontSize'],
    ['message-assistant-font-family', 'components-message-assistant-fontFamily'],
    ['message-assistant-line-height', 'components-message-assistant-lineHeight'],
  ]);

  // Icon button tokens
  const components = theme.components;
  const iconBtn = components?.iconButton;
  if (iconBtn) {
    if (iconBtn.background) cssVars['--persona-icon-btn-bg'] = iconBtn.background;
    if (iconBtn.border) cssVars['--persona-icon-btn-border'] = iconBtn.border;
    if (iconBtn.color) cssVars['--persona-icon-btn-color'] = iconBtn.color;
    if (iconBtn.padding) cssVars['--persona-icon-btn-padding'] = iconBtn.padding;
    if (iconBtn.borderRadius) cssVars['--persona-icon-btn-radius'] = iconBtn.borderRadius;
    if (iconBtn.hoverBackground) cssVars['--persona-icon-btn-hover-bg'] = iconBtn.hoverBackground;
    if (iconBtn.hoverColor) cssVars['--persona-icon-btn-hover-color'] = iconBtn.hoverColor;
    if (iconBtn.activeBackground) cssVars['--persona-icon-btn-active-bg'] = iconBtn.activeBackground;
    if (iconBtn.activeBorder) cssVars['--persona-icon-btn-active-border'] = iconBtn.activeBorder;
  }

  // Label button tokens
  const labelBtn = components?.labelButton;
  if (labelBtn) {
    if (labelBtn.background) cssVars['--persona-label-btn-bg'] = labelBtn.background;
    if (labelBtn.border) cssVars['--persona-label-btn-border'] = labelBtn.border;
    if (labelBtn.color) cssVars['--persona-label-btn-color'] = labelBtn.color;
    if (labelBtn.padding) cssVars['--persona-label-btn-padding'] = labelBtn.padding;
    if (labelBtn.borderRadius) cssVars['--persona-label-btn-radius'] = labelBtn.borderRadius;
    if (labelBtn.hoverBackground) cssVars['--persona-label-btn-hover-bg'] = labelBtn.hoverBackground;
    if (labelBtn.fontSize) cssVars['--persona-label-btn-font-size'] = labelBtn.fontSize;
    if (labelBtn.gap) cssVars['--persona-label-btn-gap'] = labelBtn.gap;
  }

  // Toggle group tokens
  const toggleGrp = components?.toggleGroup;
  if (toggleGrp) {
    if (toggleGrp.gap) cssVars['--persona-toggle-group-gap'] = toggleGrp.gap;
    if (toggleGrp.borderRadius) cssVars['--persona-toggle-group-radius'] = toggleGrp.borderRadius;
  }

  // Artifact tokens
  const artifact = components?.artifact;
  if (artifact?.toolbar) {
    const t = artifact.toolbar;
    if (t.iconHoverColor) cssVars['--persona-artifact-toolbar-icon-hover-color'] = t.iconHoverColor;
    if (t.iconHoverBackground) cssVars['--persona-artifact-toolbar-icon-hover-bg'] = t.iconHoverBackground;
    if (t.iconPadding) cssVars['--persona-artifact-toolbar-icon-padding'] = t.iconPadding;
    if (t.iconBorderRadius) cssVars['--persona-artifact-toolbar-icon-radius'] = t.iconBorderRadius;
    if (t.iconBorder) cssVars['--persona-artifact-toolbar-icon-border'] = t.iconBorder;
    // A bare "0" is a <number> in calc(), not a <length>; gap/padding feed the
    // toggle thumb's width calc, so a unitless zero would zero out the thumb.
    if (t.toggleGroupGap) cssVars['--persona-artifact-toolbar-toggle-group-gap'] = zeroLength(t.toggleGroupGap);
    if (t.toggleBorderRadius) cssVars['--persona-artifact-toolbar-toggle-radius'] = t.toggleBorderRadius;
    if (t.toggleGroupPadding) cssVars['--persona-artifact-toolbar-toggle-group-padding'] = zeroLength(t.toggleGroupPadding);
    if (t.toggleGroupBorder) cssVars['--persona-artifact-toolbar-toggle-group-border'] = t.toggleGroupBorder;
    if (t.toggleGroupBorderRadius) cssVars['--persona-artifact-toolbar-toggle-group-radius'] = t.toggleGroupBorderRadius;
    if (t.toggleGroupBackground) cssVars['--persona-artifact-toolbar-toggle-group-bg'] = resolveTokenValue(theme, t.toggleGroupBackground) ?? t.toggleGroupBackground;
    if (t.copyBackground) cssVars['--persona-artifact-toolbar-copy-bg'] = t.copyBackground;
    if (t.copyBorder) cssVars['--persona-artifact-toolbar-copy-border'] = t.copyBorder;
    if (t.copyColor) cssVars['--persona-artifact-toolbar-copy-color'] = t.copyColor;
    // Feeds the split-button halves' inner-radius calc; must stay a <length>.
    if (t.copyBorderRadius) cssVars['--persona-artifact-toolbar-copy-radius'] = zeroLength(t.copyBorderRadius);
    if (t.copyPadding) cssVars['--persona-artifact-toolbar-copy-padding'] = t.copyPadding;
    if (t.copyMenuBackground) {
      cssVars['--persona-artifact-toolbar-copy-menu-bg'] = t.copyMenuBackground;
      cssVars['--persona-dropdown-bg'] = cssVars['--persona-dropdown-bg'] ?? t.copyMenuBackground;
    }
    if (t.copyMenuBorder) {
      cssVars['--persona-artifact-toolbar-copy-menu-border'] = t.copyMenuBorder;
      cssVars['--persona-dropdown-border'] = cssVars['--persona-dropdown-border'] ?? t.copyMenuBorder;
    }
    if (t.copyMenuShadow) {
      cssVars['--persona-artifact-toolbar-copy-menu-shadow'] = t.copyMenuShadow;
      cssVars['--persona-dropdown-shadow'] = cssVars['--persona-dropdown-shadow'] ?? t.copyMenuShadow;
    }
    if (t.copyMenuBorderRadius) {
      cssVars['--persona-artifact-toolbar-copy-menu-radius'] = t.copyMenuBorderRadius;
      cssVars['--persona-dropdown-radius'] = cssVars['--persona-dropdown-radius'] ?? t.copyMenuBorderRadius;
    }
    if (t.copyMenuItemHoverBackground) {
      cssVars['--persona-artifact-toolbar-copy-menu-item-hover-bg'] = t.copyMenuItemHoverBackground;
      cssVars['--persona-dropdown-item-hover-bg'] = cssVars['--persona-dropdown-item-hover-bg'] ?? t.copyMenuItemHoverBackground;
    }
    if (t.iconBackground) cssVars['--persona-artifact-toolbar-icon-bg'] = t.iconBackground;
    if (t.toolbarBorder) cssVars['--persona-artifact-toolbar-border'] = t.toolbarBorder;
  }
  if (artifact?.tab) {
    const t = artifact.tab;
    if (t.background) cssVars['--persona-artifact-tab-bg'] = t.background;
    if (t.activeBackground) cssVars['--persona-artifact-tab-active-bg'] = t.activeBackground;
    if (t.activeBorder) cssVars['--persona-artifact-tab-active-border'] = t.activeBorder;
    if (t.borderRadius) cssVars['--persona-artifact-tab-radius'] = t.borderRadius;
    if (t.textColor) cssVars['--persona-artifact-tab-color'] = t.textColor;
    if (t.hoverBackground) cssVars['--persona-artifact-tab-hover-bg'] = t.hoverBackground;
    if (t.listBackground) cssVars['--persona-artifact-tab-list-bg'] = t.listBackground;
    if (t.listBorderColor) cssVars['--persona-artifact-tab-list-border-color'] = t.listBorderColor;
    if (t.listPadding) cssVars['--persona-artifact-tab-list-padding'] = t.listPadding;
  }
  if (artifact?.pane) {
    const t = artifact.pane;
    if (t.toolbarBackground) {
      const toolbarBg =
        resolveTokenValue(theme, t.toolbarBackground) ?? t.toolbarBackground;
      cssVars['--persona-artifact-toolbar-bg'] = toolbarBg;
    }
  }
  if (artifact?.card) {
    const t = artifact.card;
    if (t.background) cssVars['--persona-artifact-card-bg'] = t.background;
    if (t.border) cssVars['--persona-artifact-card-border'] = t.border;
    if (t.borderRadius) cssVars['--persona-artifact-card-radius'] = t.borderRadius;
    if (t.hoverBackground) cssVars['--persona-artifact-card-hover-bg'] = t.hoverBackground;
    if (t.hoverBorderColor) cssVars['--persona-artifact-card-hover-border'] = t.hoverBorderColor;
  }
  if (artifact?.inline) {
    const t = artifact.inline;
    if (t.background) {
      cssVars['--persona-artifact-inline-bg'] =
        resolveTokenValue(theme, t.background) ?? t.background;
    }
    if (t.border) cssVars['--persona-artifact-inline-border'] = t.border;
    if (t.borderRadius) cssVars['--persona-artifact-inline-radius'] = t.borderRadius;
    if (t.chromeBackground) {
      cssVars['--persona-artifact-inline-chrome-bg'] =
        resolveTokenValue(theme, t.chromeBackground) ?? t.chromeBackground;
    }
    if (t.chromeBorder) {
      cssVars['--persona-artifact-inline-chrome-border'] =
        resolveTokenValue(theme, t.chromeBorder) ?? t.chromeBorder;
    }
    if (t.titleColor) {
      cssVars['--persona-artifact-inline-title-color'] =
        resolveTokenValue(theme, t.titleColor) ?? t.titleColor;
    }
    if (t.mutedColor) {
      cssVars['--persona-artifact-inline-muted-color'] =
        resolveTokenValue(theme, t.mutedColor) ?? t.mutedColor;
    }
    if (t.frameHeight) cssVars['--persona-artifact-inline-frame-height'] = t.frameHeight;
  }

  // Code (syntax-highlighted artifact source view) tokens.
  const code = components?.code;
  if (code) {
    if (code.keywordColor) cssVars['--persona-code-keyword-color'] = code.keywordColor;
    if (code.stringColor) cssVars['--persona-code-string-color'] = code.stringColor;
    if (code.commentColor) cssVars['--persona-code-comment-color'] = code.commentColor;
    if (code.numberColor) cssVars['--persona-code-number-color'] = code.numberColor;
    if (code.tagColor) cssVars['--persona-code-tag-color'] = code.tagColor;
    if (code.attrColor) cssVars['--persona-code-attr-color'] = code.attrColor;
    if (code.propertyColor) cssVars['--persona-code-property-color'] = code.propertyColor;
    if (code.lineNumberColor) cssVars['--persona-code-line-number-color'] = code.lineNumberColor;
    if (code.gutterBorderColor) cssVars['--persona-code-gutter-border-color'] = code.gutterBorderColor;
    if (code.background)
      cssVars['--persona-code-bg'] = resolveTokenValue(theme, code.background) ?? code.background;
  }

  // Interactive-state defaults. The default preset resolves container === surface,
  // which turns every hover/active rule that falls back to --persona-container
  // into a visual no-op; anchor those states one gray step down in that case.
  // A flat DARK surface takes white-alpha washes instead: light grays paint a
  // near-white pill under light text. Unparseable surfaces keep the grays.
  // Component config emitted above must keep winning, so only fill vars not set.
  const stateSurface = cssVars['--persona-surface'];
  const stateContainer = cssVars['--persona-container'];
  const gray100 = cssVars['--persona-palette-colors-gray-100'] ?? '#f3f4f6';
  const gray200 = cssVars['--persona-palette-colors-gray-200'] ?? '#e5e7eb';
  const gray300 = cssVars['--persona-palette-colors-gray-300'] ?? '#d1d5db';
  const flatTheme = !stateContainer || stateContainer === stateSurface;
  const flatLuminance = relativeLuminance(stateSurface ?? cssVars['--persona-background']);
  const flatDark = flatTheme && flatLuminance !== undefined && flatLuminance < DARK_SURFACE_LUMINANCE;
  const flatHoverBg = flatDark ? 'rgba(255, 255, 255, 0.08)' : gray100;
  const flatActiveBg = flatDark ? 'rgba(255, 255, 255, 0.12)' : gray200;
  const flatActiveBorder = flatDark ? 'rgba(255, 255, 255, 0.16)' : gray300;
  const hoverBgDefault = flatTheme ? flatHoverBg : stateContainer;
  const activeBgDefault = flatTheme ? flatActiveBg : stateContainer;
  cssVars['--persona-icon-btn-hover-bg'] = cssVars['--persona-icon-btn-hover-bg'] ?? hoverBgDefault;
  cssVars['--persona-icon-btn-active-bg'] = cssVars['--persona-icon-btn-active-bg'] ?? activeBgDefault;
  if (flatTheme) {
    cssVars['--persona-icon-btn-active-border'] =
      cssVars['--persona-icon-btn-active-border'] ?? flatActiveBorder;
  }
  cssVars['--persona-label-btn-hover-bg'] = cssVars['--persona-label-btn-hover-bg'] ?? hoverBgDefault;
  cssVars['--persona-artifact-tab-hover-bg'] =
    cssVars['--persona-artifact-tab-hover-bg'] ?? hoverBgDefault;
  cssVars['--persona-artifact-card-hover-bg'] =
    cssVars['--persona-artifact-card-hover-bg'] ?? hoverBgDefault;

  return cssVars;
}

export function applyThemeVariables(element: HTMLElement, theme: PersonaTheme): void {
  const cssVars = themeToCssVariables(theme);

  for (const [name, value] of Object.entries(cssVars)) {
    element.style.setProperty(name, value);
  }
}

/**
 * Stable `data-persona-theme-zone` values applied to key widget regions.
 * Visual editors should use `[data-persona-theme-zone="header"]` selectors
 * rather than internal class names.
 */
export const THEME_ZONES = {
  header: 'Widget header bar',
  messages: 'Message list area',
  'user-message': 'User message bubble',
  'assistant-message': 'Assistant message bubble',
  composer: 'Footer / composer area',
  container: 'Main widget container',
  'artifact-pane': 'Artifact sidebar',
  'artifact-toolbar': 'Artifact toolbar',
  'artifact-inline': 'Inline artifact block',
  'artifact-inline-chrome': 'Inline artifact title bar',
} as const;

export type ThemeZone = keyof typeof THEME_ZONES;
