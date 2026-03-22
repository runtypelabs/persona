import type {
  PersonaTheme,
  ResolvedToken,
  ThemeValidationResult,
  ThemeValidationError,
  CreateThemeOptions,
  ComponentTokens,
  SemanticTokens,
} from '../types/theme';

export const DEFAULT_PALETTE = {
  colors: {
    primary: {
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
  spacing: {
    0: '0px',
    1: '0.25rem',
    2: '0.5rem',
    3: '0.75rem',
    4: '1rem',
    5: '1.25rem',
    6: '1.5rem',
    8: '2rem',
    10: '2.5rem',
    12: '3rem',
    16: '4rem',
    20: '5rem',
    24: '6rem',
    32: '8rem',
    40: '10rem',
    48: '12rem',
    56: '14rem',
    64: '16rem',
  },
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
    secondary: 'palette.colors.gray.500',
    accent: 'palette.colors.primary.600',
    surface: 'palette.colors.gray.50',
    background: 'palette.colors.gray.50',
    container: 'palette.colors.gray.100',
    text: 'palette.colors.gray.900',
    textMuted: 'palette.colors.gray.500',
    textInverse: 'palette.colors.gray.50',
    border: 'palette.colors.gray.200',
    divider: 'palette.colors.gray.200',
    interactive: {
      default: 'palette.colors.primary.500',
      hover: 'palette.colors.primary.600',
      focus: 'palette.colors.primary.700',
      active: 'palette.colors.primary.800',
      disabled: 'palette.colors.gray.300',
    },
    feedback: {
      success: 'palette.colors.success.500',
      warning: 'palette.colors.warning.500',
      error: 'palette.colors.error.500',
      info: 'palette.colors.primary.500',
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
      background: 'semantic.colors.primary',
      foreground: 'semantic.colors.textInverse',
      borderRadius: 'palette.radius.lg',
      padding: 'semantic.spacing.md',
    },
    secondary: {
      background: 'semantic.colors.surface',
      foreground: 'semantic.colors.text',
      borderRadius: 'palette.radius.lg',
      padding: 'semantic.spacing.md',
    },
    ghost: {
      background: 'transparent',
      foreground: 'semantic.colors.text',
      borderRadius: 'palette.radius.md',
      padding: 'semantic.spacing.sm',
    },
  },
  input: {
    background: 'semantic.colors.surface',
    placeholder: 'semantic.colors.textMuted',
    borderRadius: 'palette.radius.lg',
    padding: 'semantic.spacing.md',
    focus: {
      border: 'semantic.colors.interactive.focus',
      ring: 'semantic.colors.interactive.focus',
    },
  },
  launcher: {
    size: '60px',
    iconSize: '28px',
    borderRadius: 'palette.radius.full',
    shadow: 'palette.shadows.lg',
  },
  panel: {
    width: 'min(400px, calc(100vw - 24px))',
    maxWidth: '400px',
    height: '600px',
    maxHeight: 'calc(100vh - 80px)',
    borderRadius: 'palette.radius.xl',
    shadow: 'palette.shadows.xl',
  },
  header: {
    background: 'semantic.colors.surface',
    border: 'semantic.colors.border',
    borderRadius: 'palette.radius.xl palette.radius.xl 0 0',
    padding: 'semantic.spacing.md',
  },
  message: {
    user: {
      background: 'semantic.colors.primary',
      text: 'semantic.colors.textInverse',
      borderRadius: 'palette.radius.lg',
      shadow: 'palette.shadows.sm',
    },
    assistant: {
      background: 'semantic.colors.container',
      text: 'semantic.colors.text',
      borderRadius: 'palette.radius.lg',
      border: 'semantic.colors.border',
      shadow: 'palette.shadows.sm',
    },
  },
  toolBubble: {
    shadow: 'palette.shadows.sm',
  },
  reasoningBubble: {
    shadow: 'palette.shadows.sm',
  },
  composer: {
    shadow: 'none',
  },
  markdown: {
    inlineCode: {
      background: 'semantic.colors.container',
      foreground: 'semantic.colors.text',
    },
    link: {
      foreground: 'semantic.colors.accent',
    },
    prose: {
      fontFamily: 'inherit',
    },
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
  approval: {
    requested: {
      background: 'palette.colors.warning.50',
      border: 'palette.colors.warning.200',
      text: 'palette.colors.gray.900',
    },
    approve: {
      background: 'palette.colors.success.500',
      foreground: 'palette.colors.gray.50',
      borderRadius: 'palette.radius.md',
      padding: 'semantic.spacing.sm',
    },
    deny: {
      background: 'palette.colors.error.500',
      foreground: 'palette.colors.gray.50',
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
};

function resolveTokenValue(theme: PersonaTheme, path: string): string | undefined {
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
  userConfig?: Partial<PersonaTheme>,
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
    components: deepMergeComponents(baseTheme.components, userConfig?.components),
  };

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

export function themeToCssVariables(theme: PersonaTheme): Record<string, string> {
  const resolved = resolveTokens(theme);
  const cssVars: Record<string, string> = {};

  for (const [path, token] of Object.entries(resolved)) {
    const varName = path.replace(/\./g, '-');
    cssVars[`--persona-${varName}`] = token.value;
  }

  cssVars['--persona-primary'] = cssVars['--persona-semantic-colors-primary'] ?? cssVars['--persona-palette-colors-primary-500'];
  cssVars['--persona-secondary'] = cssVars['--persona-semantic-colors-secondary'] ?? cssVars['--persona-palette-colors-secondary-500'];
  cssVars['--persona-accent'] = cssVars['--persona-semantic-colors-accent'] ?? cssVars['--persona-palette-colors-accent-500'];
  cssVars['--persona-surface'] = cssVars['--persona-semantic-colors-surface'] ?? cssVars['--persona-palette-colors-gray-50'];
  cssVars['--persona-background'] = cssVars['--persona-semantic-colors-background'] ?? cssVars['--persona-palette-colors-gray-50'];
  cssVars['--persona-container'] = cssVars['--persona-semantic-colors-container'] ?? cssVars['--persona-palette-colors-gray-100'];
  cssVars['--persona-text'] = cssVars['--persona-semantic-colors-text'] ?? cssVars['--persona-palette-colors-gray-900'];
  cssVars['--persona-text-muted'] = cssVars['--persona-semantic-colors-text-muted'] ?? cssVars['--persona-palette-colors-gray-500'];
  cssVars['--persona-text-inverse'] = cssVars['--persona-semantic-colors-text-inverse'] ?? cssVars['--persona-palette-colors-gray-50'];
  cssVars['--persona-border'] = cssVars['--persona-semantic-colors-border'] ?? cssVars['--persona-palette-colors-gray-200'];
  cssVars['--persona-divider'] = cssVars['--persona-semantic-colors-divider'] ?? cssVars['--persona-palette-colors-gray-200'];
  cssVars['--persona-muted'] = cssVars['--persona-text-muted'];

  cssVars['--persona-voice-recording-indicator'] = cssVars['--persona-components-voice-recording-indicator'] ?? cssVars['--persona-palette-colors-error-500'];
  cssVars['--persona-voice-recording-bg'] = cssVars['--persona-components-voice-recording-background'] ?? cssVars['--persona-palette-colors-error-50'];
  cssVars['--persona-voice-processing-icon'] = cssVars['--persona-components-voice-processing-icon'] ?? cssVars['--persona-palette-colors-primary-500'];
  cssVars['--persona-voice-speaking-icon'] = cssVars['--persona-components-voice-speaking-icon'] ?? cssVars['--persona-palette-colors-success-500'];

  cssVars['--persona-approval-bg'] = cssVars['--persona-components-approval-requested-background'] ?? cssVars['--persona-palette-colors-warning-50'];
  cssVars['--persona-approval-border'] = cssVars['--persona-components-approval-requested-border'] ?? cssVars['--persona-palette-colors-warning-200'];
  cssVars['--persona-approval-text'] = cssVars['--persona-components-approval-requested-text'] ?? cssVars['--persona-palette-colors-gray-900'];
  cssVars['--persona-approval-approve-bg'] = cssVars['--persona-components-approval-approve-background'] ?? cssVars['--persona-palette-colors-success-500'];
  cssVars['--persona-approval-deny-bg'] = cssVars['--persona-components-approval-deny-background'] ?? cssVars['--persona-palette-colors-error-500'];

  cssVars['--persona-attachment-image-bg'] = cssVars['--persona-components-attachment-image-background'] ?? cssVars['--persona-palette-colors-gray-100'];
  cssVars['--persona-attachment-image-border'] = cssVars['--persona-components-attachment-image-border'] ?? cssVars['--persona-palette-colors-gray-200'];

  // Typography shorthand aliases
  cssVars['--persona-font-family'] = cssVars['--persona-semantic-typography-fontFamily'] ?? cssVars['--persona-palette-typography-fontFamily-sans'];
  cssVars['--persona-font-size'] = cssVars['--persona-semantic-typography-fontSize'] ?? cssVars['--persona-palette-typography-fontSize-base'];
  cssVars['--persona-font-weight'] = cssVars['--persona-semantic-typography-fontWeight'] ?? cssVars['--persona-palette-typography-fontWeight-normal'];
  cssVars['--persona-line-height'] = cssVars['--persona-semantic-typography-lineHeight'] ?? cssVars['--persona-palette-typography-lineHeight-normal'];

  // Radius aliases used throughout the existing widget CSS.
  cssVars['--persona-radius-sm'] = cssVars['--persona-palette-radius-sm'] ?? '0.125rem';
  cssVars['--persona-radius-md'] = cssVars['--persona-palette-radius-md'] ?? '0.375rem';
  cssVars['--persona-radius-lg'] = cssVars['--persona-palette-radius-lg'] ?? '0.5rem';
  cssVars['--persona-radius-xl'] = cssVars['--persona-palette-radius-xl'] ?? '0.75rem';
  cssVars['--persona-launcher-radius'] =
    cssVars['--persona-components-launcher-borderRadius'] ??
    cssVars['--persona-palette-radius-full'] ??
    '9999px';
  cssVars['--persona-button-radius'] =
    cssVars['--persona-components-button-primary-borderRadius'] ??
    cssVars['--persona-palette-radius-full'] ??
    '9999px';
  cssVars['--persona-panel-radius'] =
    cssVars['--persona-components-panel-borderRadius'] ??
    cssVars['--persona-radius-xl'] ??
    '0.75rem';
  cssVars['--persona-input-radius'] =
    cssVars['--persona-components-input-borderRadius'] ??
    cssVars['--persona-radius-lg'] ??
    '0.5rem';
  cssVars['--persona-message-user-radius'] =
    cssVars['--persona-components-message-user-borderRadius'] ??
    cssVars['--persona-radius-lg'] ??
    '0.5rem';
  cssVars['--persona-message-assistant-radius'] =
    cssVars['--persona-components-message-assistant-borderRadius'] ??
    cssVars['--persona-radius-lg'] ??
    '0.5rem';

  // Component-level color overrides — these map component tokens to
  // dedicated CSS variables that the widget CSS reads for individual elements.
  cssVars['--persona-header-bg'] =
    cssVars['--persona-components-header-background'] ?? cssVars['--persona-surface'];
  cssVars['--persona-header-border'] =
    cssVars['--persona-components-header-border'] ?? cssVars['--persona-divider'];

  cssVars['--persona-message-user-bg'] =
    cssVars['--persona-components-message-user-background'] ?? cssVars['--persona-accent'];
  cssVars['--persona-message-user-text'] =
    cssVars['--persona-components-message-user-text'] ?? cssVars['--persona-text-inverse'];
  cssVars['--persona-message-user-shadow'] =
    cssVars['--persona-components-message-user-shadow'] ?? '0 5px 15px rgba(15, 23, 42, 0.08)';
  cssVars['--persona-message-assistant-bg'] =
    cssVars['--persona-components-message-assistant-background'] ?? cssVars['--persona-surface'];
  cssVars['--persona-message-assistant-text'] =
    cssVars['--persona-components-message-assistant-text'] ?? cssVars['--persona-text'];
  cssVars['--persona-message-assistant-border'] =
    cssVars['--persona-components-message-assistant-border'] ?? cssVars['--persona-border'];
  cssVars['--persona-message-assistant-shadow'] =
    cssVars['--persona-components-message-assistant-shadow'] ?? '0 1px 2px 0 rgb(0 0 0 / 0.05)';

  cssVars['--persona-tool-bubble-shadow'] =
    cssVars['--persona-components-toolBubble-shadow'] ?? '0 5px 15px rgba(15, 23, 42, 0.08)';
  cssVars['--persona-reasoning-bubble-shadow'] =
    cssVars['--persona-components-reasoningBubble-shadow'] ?? '0 5px 15px rgba(15, 23, 42, 0.08)';
  cssVars['--persona-composer-shadow'] =
    cssVars['--persona-components-composer-shadow'] ?? 'none';

  cssVars['--persona-md-inline-code-bg'] =
    cssVars['--persona-components-markdown-inlineCode-background'] ?? cssVars['--persona-container'];
  cssVars['--persona-md-inline-code-color'] =
    cssVars['--persona-components-markdown-inlineCode-foreground'] ?? cssVars['--persona-text'];

  cssVars['--persona-md-link-color'] =
    cssVars['--persona-components-markdown-link-foreground'] ??
    cssVars['--persona-accent'] ??
    '#3b82f6';

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

  // Artifact tokens
  const components = theme.components;
  const artifact = components?.artifact;
  if (artifact?.toolbar) {
    const t = artifact.toolbar;
    if (t.iconHoverColor) cssVars['--persona-artifact-toolbar-icon-hover-color'] = t.iconHoverColor;
    if (t.iconHoverBackground) cssVars['--persona-artifact-toolbar-icon-hover-bg'] = t.iconHoverBackground;
    if (t.iconPadding) cssVars['--persona-artifact-toolbar-icon-padding'] = t.iconPadding;
    if (t.iconBorderRadius) cssVars['--persona-artifact-toolbar-icon-radius'] = t.iconBorderRadius;
    if (t.iconBorder) cssVars['--persona-artifact-toolbar-icon-border'] = t.iconBorder;
    if (t.toggleGroupGap) cssVars['--persona-artifact-toolbar-toggle-group-gap'] = t.toggleGroupGap;
    if (t.toggleBorderRadius) cssVars['--persona-artifact-toolbar-toggle-radius'] = t.toggleBorderRadius;
    if (t.copyBackground) cssVars['--persona-artifact-toolbar-copy-bg'] = t.copyBackground;
    if (t.copyBorder) cssVars['--persona-artifact-toolbar-copy-border'] = t.copyBorder;
    if (t.copyColor) cssVars['--persona-artifact-toolbar-copy-color'] = t.copyColor;
    if (t.copyBorderRadius) cssVars['--persona-artifact-toolbar-copy-radius'] = t.copyBorderRadius;
    if (t.copyPadding) cssVars['--persona-artifact-toolbar-copy-padding'] = t.copyPadding;
    if (t.copyMenuBackground) cssVars['--persona-artifact-toolbar-copy-menu-bg'] = t.copyMenuBackground;
    if (t.copyMenuBorder) cssVars['--persona-artifact-toolbar-copy-menu-border'] = t.copyMenuBorder;
    if (t.copyMenuShadow) cssVars['--persona-artifact-toolbar-copy-menu-shadow'] = t.copyMenuShadow;
    if (t.copyMenuBorderRadius) cssVars['--persona-artifact-toolbar-copy-menu-radius'] = t.copyMenuBorderRadius;
    if (t.copyMenuItemHoverBackground) cssVars['--persona-artifact-toolbar-copy-menu-item-hover-bg'] = t.copyMenuItemHoverBackground;
  }
  if (artifact?.tab) {
    const t = artifact.tab;
    if (t.background) cssVars['--persona-artifact-tab-bg'] = t.background;
    if (t.activeBackground) cssVars['--persona-artifact-tab-active-bg'] = t.activeBackground;
    if (t.activeBorder) cssVars['--persona-artifact-tab-active-border'] = t.activeBorder;
    if (t.borderRadius) cssVars['--persona-artifact-tab-radius'] = t.borderRadius;
    if (t.textColor) cssVars['--persona-artifact-tab-color'] = t.textColor;
  }
  if (artifact?.pane) {
    const t = artifact.pane;
    if (t.toolbarBackground) cssVars['--persona-artifact-toolbar-bg'] = t.toolbarBackground;
  }

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
} as const;

export type ThemeZone = keyof typeof THEME_ZONES;
