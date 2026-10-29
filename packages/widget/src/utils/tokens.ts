import { CIRCLE_LAUNCHER_TOKENS } from "./launcher-variant";
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
  DEFAULT_FLOATING_LAUNCHER_WIDTH,
  resolveDefaultsVersion,
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

const DEFAULT_PALETTE_BASE = {
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
    purple: {
      50: '#faf5ff',
      100: '#f3e8ff',
      200: '#e9d5ff',
      300: '#d8b4fe',
      400: '#c084fc',
      500: '#a855f7',
      600: '#9333ea',
      700: '#7e22ce',
      800: '#6b21a8',
      900: '#581c87',
      950: '#3b0764',
    },
    teal: {
      50: '#f0fdfa',
      100: '#ccfbf1',
      200: '#99f6e4',
      300: '#5eead4',
      400: '#2dd4bf',
      500: '#14b8a6',
      600: '#0d9488',
      700: '#0f766e',
      800: '#115e59',
      900: '#134e4a',
      950: '#042f2e',
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

const DEFAULT_SEMANTIC_BASE: SemanticTokens = {
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

/** Operator bubble fill: the container tinted with the theme primary. */
const OPERATOR_BACKGROUND = 'color-mix(in srgb, var(--persona-primary) 6%, var(--persona-container))';
/** Operator bubble border: a stronger primary tint than the fill. */
const OPERATOR_BORDER = 'color-mix(in srgb, var(--persona-primary) 20%, var(--persona-container))';

const DEFAULT_COMPONENTS_BASE: ComponentTokens = {
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
    // Matches the existing floating runtime geometry. `maxWidth` and
    // `maxHeight` intentionally do not impose a second cap; ui.ts applies
    // the responsive width and heightOffset rules for this mode.
    maxWidth: 'none',
    height: 'min(640px, max(200px, calc(100vh - 64px)))',
    maxHeight: 'none',
    borderRadius: 'palette.radius.xl',
    shadow: 'palette.shadows.xl',
    inset: DEFAULT_PANEL_INSET,
    canvasBackground: DEFAULT_PANEL_CANVAS_BACKGROUND,
    modes: {
      floating: {
        border: '1px solid var(--persona-border)',
        shadow: 'palette.shadows.xl',
        borderRadius: 'palette.radius.xl',
      },
      inline: {
        border: '1px solid var(--persona-border)',
        shadow: 'none',
        borderRadius: 'palette.radius.xl',
      },
      docked: { border: 'none', shadow: 'none', borderRadius: 'palette.radius.xl' },
      sidebar: { border: 'none', borderRadius: '0' },
      mobile: { border: 'none', shadow: 'none', borderRadius: '0' },
    },
  },
  header: {
    // Header role: solid primary. Border, subtitle, and action icons stay
    // unset so they derive from this background/foreground pair.
    background: 'palette.colors.primary.500',
    foreground: 'palette.colors.primary.50',
    borderRadius: 'palette.radius.xl palette.radius.xl 0 0',
    padding: '20px 24px',
    minimalPadding: '16px 24px',
    iconBackground: 'palette.colors.primary.600',
    iconForeground: 'palette.colors.primary.50',
  },
  message: {
    gap: '12px',
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
    operator: {
      // Operator role (human takeover): a primary-tinted container, so it
      // reads apart from the assistant on the same side and follows `brand`.
      background: OPERATOR_BACKGROUND,
      text: 'semantic.colors.text',
      borderRadius: 'palette.radius.lg',
      border: OPERATOR_BORDER,
      borderWidth: '1px',
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
  // Event-stream badge chips: 100-tone fill / dark text per family. tool/agent
  // keep their pre-token literals (#6b21a8 / #115e59), which sit at the 800
  // step of the canonical purple/teal ramps.
  eventStream: {
    badge: {
      flow: { background: 'palette.colors.success.100', foreground: 'palette.colors.success.700' },
      step: { background: 'palette.colors.primary.100', foreground: 'palette.colors.primary.700' },
      reasoning: { background: 'palette.colors.warning.100', foreground: 'palette.colors.warning.700' },
      tool: { background: 'palette.colors.purple.100', foreground: 'palette.colors.purple.800' },
      agent: { background: 'palette.colors.teal.100', foreground: 'palette.colors.teal.800' },
      error: { background: 'palette.colors.error.100', foreground: 'palette.colors.error.700' },
      default: { background: 'palette.colors.gray.100', foreground: 'palette.colors.gray.600' },
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

/** Shared defaults with a small opt-in V5 overlay. */
const DEFAULT_PALETTE_GRAY_V4 = DEFAULT_PALETTE_BASE.colors.gray;
const DEFAULT_PALETTE_GRAY_V5 = {
  50: '#fafafa', 100: '#f5f5f5', 200: '#e5e5e5', 300: '#d4d4d4',
  400: '#a3a3a3', 500: '#737373', 600: '#525252', 700: '#404040',
  800: '#262626', 900: '#171717', 950: '#0a0a0a',
};

export const DEFAULT_PALETTE_V4 = {
  ...DEFAULT_PALETTE_BASE,
  colors: { ...DEFAULT_PALETTE_BASE.colors, gray: DEFAULT_PALETTE_GRAY_V4 },
};
export const DEFAULT_PALETTE_V5 = {
  ...DEFAULT_PALETTE_BASE,
  colors: { ...DEFAULT_PALETTE_BASE.colors, gray: DEFAULT_PALETTE_GRAY_V5 },
  radius: { none: '0px', sm: '4px', md: '8px', lg: '12px', xl: '16px', '2xl': '24px', full: '9999px' },
};
export const DEFAULT_PALETTE = DEFAULT_PALETTE_V4;

export const DEFAULT_SEMANTIC_V4 = DEFAULT_SEMANTIC_BASE;
export const DEFAULT_SEMANTIC_V5: SemanticTokens = {
  ...DEFAULT_SEMANTIC_BASE,
  colors: {
    ...DEFAULT_SEMANTIC_BASE.colors,
    surface: '#ffffff', background: '#ffffff', container: 'semantic.colors.surface',
    textInverse: '#ffffff',
  },
  typography: { ...DEFAULT_SEMANTIC_BASE.typography, fontSize: '14px', lineHeight: '1.5' },
};
export const DEFAULT_SEMANTIC = DEFAULT_SEMANTIC_V4;

export const DEFAULT_COMPONENTS_V4 = DEFAULT_COMPONENTS_BASE;
export const DEFAULT_COMPONENTS_V5: ComponentTokens = {
  ...DEFAULT_COMPONENTS_BASE,
  scrollToBottom: {
    ...DEFAULT_COMPONENTS_BASE.scrollToBottom,
    background: 'semantic.colors.surface',
    foreground: 'semantic.colors.text',
    border: 'semantic.colors.border',
    size: '32px',
  },
  messageActions: {
    background: 'transparent',
    border: 'none',
    hoverBackground: 'components.button.ghost.hoverBackground',
    hoverForeground: 'semantic.colors.text',
    borderRadius: 'palette.radius.md',
  },
  launcher: CIRCLE_LAUNCHER_TOKENS,
  activity: {
    // CSS owns contextual parent, nested, and coarse-pointer row heights.
    labelSize: "13px", iconSize: "16px", indent: "0px",
    transcriptGap: "0px", responseGap: "12px",
    groupIndent: "16px", groupGap: "2px", groupPadding: "2px 0",
    bodyPadding: "4px 0", bodyFontWeight: "400", sectionGap: "8px", bodySurface: "transparent",
  },
  toolBubble: { shadow: "none" },
  reasoningBubble: { shadow: "none" },
  input: { ...DEFAULT_COMPONENTS_BASE.input, borderRadius: 'palette.radius.full' },
  introCard: { ...DEFAULT_COMPONENTS_BASE.introCard, title: { fontSize: '22px', fontWeight: '500' } },
  suggestion: {
    chip: { ...DEFAULT_COMPONENTS_BASE.suggestion!.chip, fontWeight: '400' },
    card: { ...DEFAULT_COMPONENTS_BASE.suggestion!.card, fontWeight: '400' },
    list: { ...DEFAULT_COMPONENTS_BASE.suggestion!.list, fontWeight: '400' },
  },
  panel: {
    ...DEFAULT_COMPONENTS_BASE.panel,
    width: 'min(400px, calc(100vw - 24px))',
    height: 'min(704px, calc(100dvh - 104px))',
    borderRadius: 'palette.radius.xl',
  },
  header: {
    ...DEFAULT_COMPONENTS_BASE.header,
    background: 'semantic.colors.container', foreground: 'semantic.colors.text',
    padding: '8px 8px 8px 16px', minimalPadding: '8px 8px 8px 16px',
    minHeight: '48px', borderBottom: 'none',
    iconBackground: 'transparent', iconForeground: 'semantic.colors.text', iconScale: '1', iconPadding: 'auto',
    controlSize: '28px', controlIconSize: '16px', controlStrokeWidth: '1.5',
    actionIconForeground: 'semantic.colors.textMuted',
    controlBorderRadius: '8px',
    controlHoverBackground: 'color-mix(in srgb, var(--persona-text) 8%, transparent)',
    controlHoverForeground: 'semantic.colors.text',
    controlFocusOutline: '2px solid color-mix(in srgb, var(--persona-text) 50%, transparent)',
    title: { fontSize: '14px', fontWeight: '500', lineHeight: '1.5' },
  },
  message: {
    ...DEFAULT_COMPONENTS_BASE.message,
    gap: '20px', fullscreenGap: '28px', topFadeHeight: '18px',
    user: {
      ...DEFAULT_COMPONENTS_BASE.message.user,
      background: 'palette.colors.gray.100', text: 'semantic.colors.text',
      borderRadius: 'palette.radius.xl', shadow: 'none', padding: '8px 14px',
      fontSize: '14px', lineHeight: '1.5',
    },
    assistant: {
      ...DEFAULT_COMPONENTS_BASE.message.assistant,
      background: 'transparent', border: 'transparent', borderWidth: '0px',
      borderRadius: '0px', shadow: 'none', padding: '0px',
      fontSize: '14px', lineHeight: '1.55',
    },
    // The V5 assistant is flat prose, so the operator keeps a bubble with the
    // user bubble's V5 geometry to stay visibly distinct on the same side. It
    // is outlined, not filled: the stock near-black primary tints a fill to
    // the user bubble's gray, so identity never depends on the primary hue.
    operator: {
      ...DEFAULT_COMPONENTS_BASE.message.operator,
      background: 'transparent', border: 'semantic.colors.border',
      borderRadius: 'palette.radius.xl', shadow: 'none', padding: '8px 14px',
      fontSize: '14px', lineHeight: '1.5',
    },
  },
  artifact: {
    ...DEFAULT_COMPONENTS_BASE.artifact,
    card: {
      background: 'semantic.colors.surface',
      border: '1px solid var(--persona-border)',
      borderRadius: 'palette.radius.lg',
      hoverBackground: 'components.button.ghost.hoverBackground',
      hoverBorderColor: 'semantic.colors.border',
    },
    inline: {
      background: 'semantic.colors.surface',
      border: '1px solid var(--persona-border)',
      borderRadius: 'palette.radius.lg',
      chromeBackground: 'semantic.colors.surface',
      chromeBorder: 'semantic.colors.border',
      titleColor: 'semantic.colors.text',
      mutedColor: 'semantic.colors.textMuted',
    },
  },
  composer: {
    ...DEFAULT_COMPONENTS_BASE.composer,
    padding: '8px', fontSize: '15px', lineHeight: '1.5', controlSize: '32px', controlIconSize: '20px',
    expandedPadding: '12px 16px', expandedBorderRadius: '24px',
    sendIconSize: '18px', sendButtonRadius: '9999px', footerBorder: 'none',
    overflowMenu: { borderRadius: '12px' },
    overlayBand: 'linear-gradient(to bottom, transparent, var(--persona-container) 24px)',
    focusBorderColor: 'color-mix(in srgb, var(--persona-text) 28%, var(--persona-border))',
    focusRing: '1px solid color-mix(in srgb, var(--persona-text) 12%, transparent)',
  },
};
export const DEFAULT_COMPONENTS = DEFAULT_COMPONENTS_V4;

export type ThemeDefaultsVersion = 'v4' | 'v5';

export const resolveThemeDefaultsVersion = (future?: { v5Defaults?: boolean }): ThemeDefaultsVersion =>
  resolveDefaultsVersion({ future });

export const resolveThemeDefaults = (future?: { v5Defaults?: boolean }) => {
  const version = resolveThemeDefaultsVersion(future);
  return version === 'v5'
    ? { palette: DEFAULT_PALETTE_V5, semantic: DEFAULT_SEMANTIC_V5, components: DEFAULT_COMPONENTS_V5 }
    : { palette: DEFAULT_PALETTE_V4, semantic: DEFAULT_SEMANTIC_V4, components: DEFAULT_COMPONENTS_V4 };
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

export function createTheme(
  userConfig?: DeepPartial<PersonaTheme>,
  options: CreateThemeOptions = {}
): PersonaTheme {
  const baseTheme = resolveThemeDefaults(options.future) as PersonaTheme;
  const components = userConfig?.components;

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
    components: components ? mergeRecords(
      baseTheme.components as unknown as Record<string, unknown>,
      components as Record<string, unknown>
    ) as unknown as ComponentTokens : baseTheme.components,
  } as PersonaTheme;

  // Project shared activity aliases without mutating the versioned defaults.
  const activity = components?.activity;
  for (const kind of ['toolBubble', 'reasoningBubble'] as const) {
    const tokens = theme.components[kind] = { ...theme.components[kind] };
    for (const field of ['rowHeight', 'labelSize', 'iconSize', 'indent', 'bodySurface'] as const) {
      if (activity?.[field] !== undefined && (field !== 'bodySurface' || components?.[kind]?.bodySurface === undefined)) tokens[field] = activity[field];
    }
  }
  const legacySurface = components?.collapsibleWidget?.surface;
  // V4 keeps the historical shared surface. V5 separates activity from code
  // widgets; callers use activity.bodySurface (or the per-kind override).
  if (resolveDefaultsVersion(options) === 'v4' && legacySurface !== undefined && activity?.bodySurface === undefined) {
    theme.components.activity = { ...theme.components.activity, bodySurface: legacySurface };
  }

  // Shared header padding also supplies minimal padding unless authored separately.
  const suppliedHeader = components?.header;
  if (suppliedHeader?.padding !== undefined && suppliedHeader.minimalPadding === undefined) {
    theme.components.header.minimalPadding = theme.components.header.padding;
  }

  const suppliedComposer = components?.composer;
  // An input-only override leaves the composer's defaults shared after merging.
  // Derive expanded values on a fresh object so a brand cannot mutate defaults
  // for a sibling instance or survive removal from the current configuration.
  theme.components.composer = { ...theme.components.composer };
  if (suppliedComposer?.padding !== undefined && suppliedComposer.expandedPadding === undefined) {
    theme.components.composer.expandedPadding = suppliedComposer.padding;
  }
  if (components?.input?.borderRadius !== undefined && suppliedComposer?.expandedBorderRadius === undefined) {
    theme.components.composer.expandedBorderRadius = components.input.borderRadius;
  }

  const suppliedMessage = components?.message;
  if (suppliedMessage?.gap !== undefined && suppliedMessage.fullscreenGap === undefined) {
    theme.components.message.fullscreenGap = theme.components.message.gap;
  }

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

const COMMON_ALIASES: AliasRow[] = [
    ['primary', 'semantic-colors-primary', 'palette-colors-primary-500'],
    ['secondary', 'semantic-colors-secondary', 'palette-colors-secondary-500'],
    ['accent', 'semantic-colors-accent', 'palette-colors-accent-500'],
    ['surface', 'semantic-colors-surface', 'palette-colors-gray-50'],
    ['background', 'semantic-colors-background', 'palette-colors-gray-50'],
    ['container', 'semantic-colors-container', 'palette-colors-gray-100'],
    ['text', 'semantic-colors-text', 'palette-colors-gray-900'],
    ['text-muted', 'semantic-colors-textMuted', 'palette-colors-gray-500'],
    ['text-inverse', 'semantic-colors-textInverse', 'palette-colors-gray-50'],
    ['border', 'semantic-colors-border', 'palette-colors-gray-200'],
    ['divider', 'semantic-colors-divider', 'palette-colors-gray-200'],
    ['muted', 'text-muted'],
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
];

// The collapsed launcher needs canonical tokens and shared text/launcher aliases,
// but none of the panel, artifact, or message compatibility aliases.
const canonicalThemeVariables = (theme: PersonaTheme): Record<string, string> => {
  const resolved = resolveTokens(theme);
  const cssVars: Record<string, string> = {};

  for (const [path, token] of Object.entries(resolved)) {
    const varName = path.replace(/\./g, '-');
    cssVars[`--persona-${varName}`] = token.value;
  }

  return cssVars;
};

const emitLauncherMuted = (cssVars: Record<string, string>): void => {
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

};

const resolveHeaderIconPadding = (cssVars: Record<string, string>): void => {
  // Resolve after aliases so palette references and dark/brand overrides count.
  // CSS variables with runtime-dependent colors can use explicit iconPadding.
  const iconPadding = cssVars['--persona-components-header-iconPadding'];
  if (iconPadding === 'auto') {
    const background = (cssVars['--persona-components-header-iconBackground'] ?? cssVars['--persona-primary']).trim().toLowerCase();
    const channels = background.match(/^(?:rgba?|hsla?)\(([^)]+)\)$/)?.[1].split(/[,\s/]+/).filter(Boolean);
    const transparent = background === 'transparent' ||
      /^#(?:[\da-f]{3}0|[\da-f]{6}00)$/.test(background) ||
      (channels?.length === 4 && parseFloat(channels[3]) === 0);
    cssVars['--persona-components-header-iconPadding'] = transparent ? '0px' : '6px';
  }

};

export function launcherThemeToCssVariables(theme: PersonaTheme): Record<string, string> {
  const cssVars = canonicalThemeVariables(theme);
  emitAliases(cssVars, COMMON_ALIASES);
  emitLauncherMuted(cssVars);
  emitAliases(cssVars, [
    ['launcher-border', 'components-launcher-border', 'border'],
    ['launcher-shadow', 'components-launcher-shadow', '=0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)'],
  ]);
  resolveHeaderIconPadding(cssVars);
  return cssVars;
}

export function themeToCssVariables(theme: PersonaTheme): Record<string, string> {
  const cssVars = canonicalThemeVariables(theme);

  emitAliases(cssVars, COMMON_ALIASES);
  emitAliases(cssVars, [
    ['ask-sheet-bg', 'components-askUserQuestion-sheet-background'],
    ['ask-sheet-border', 'components-askUserQuestion-sheet-border'],
    ['ask-sheet-shadow', 'components-askUserQuestion-sheet-shadow'],
    ['ask-pill-bg', 'components-askUserQuestion-pill-background'],
    ['ask-pill-fg', 'components-askUserQuestion-pill-foreground'],
    ['ask-pill-radius', 'components-askUserQuestion-pill-borderRadius'],
    ['ask-pill-bg-selected', 'components-askUserQuestion-pill-selectedBackground'],
    ['ask-pill-fg-selected', 'components-askUserQuestion-pill-selectedForeground'],
    ['ask-input-bg', 'components-askUserQuestion-customInput-background'],
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
  ]);
  emitLauncherMuted(cssVars);

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

  // Preserve the existing truthy guards and raw values (including references).
  // Nullish aliases and zero-length normalization stay on their own paths.
  const emitTruthy = (source: object | undefined, prefix: string, rows: readonly (readonly [string, string, boolean?])[], sourcePrefix = ''): void => {
    if (!source) return;
    for (const [key, alias, resolve] of rows) {
      const value = (source as Record<string, string | undefined>)[sourcePrefix + key];
      if (value) cssVars[`--persona-${prefix}${alias}`] = resolve ? resolveTokenValue(theme, value) ?? value : value;
    }
  };

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

  resolveHeaderIconPadding(cssVars);

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
    ['header-control-icon-size', 'components-header-controlIconSize', '=16px'],
  ]);

  // Conditional aliases retain the consuming stylesheet's fallback when unset.
  emitTruthy(theme.components?.header, 'header-', [
    ['shadow', 'shadow'],
    ['borderBottom', 'border-bottom'],
    ['minHeight', 'min-height'],
  ]);
  emitTruthy(cssVars, 'history-rail-header-', [
    ['background', 'bg'],
    ['border', 'border'],
    ['minHeight', 'min-height'],
  ], '--persona-components-history-railHeader-');

  // Floating (overlay-collapsed) rail. Same conditional rule: the host's
  // inline styles carry every default in their var() fallback.
  emitTruthy(cssVars, 'history-overlay-', [
    ['margin', 'margin'],
    ['borderRadius', 'radius'],
    ['shadow', 'shadow'],
    ['background', 'bg'],
  ], '--persona-components-history-overlay-');

  // Row overflow menu. Same conditional rule: the chunk's CSS carries the
  // elevated color-mix default in its var() fallback.
  emitTruthy(cssVars, 'history-menu-', [
    ['background', 'bg'],
    ['borderRadius', 'radius'],
  ], '--persona-components-history-menu-');
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
  emitTruthy(cssVars, 'tooltip-', [
    ['background', 'background'],
    ['foreground', 'foreground'],
    ['hintForeground', 'hint-fg'],
    ['borderRadius', 'radius'],
    ['fontSize', 'font-size'],
    ['padding', 'padding'],
    ['maxWidth', 'max-width'],
    ['shadow', 'shadow'],
  ], '--persona-components-tooltip-');
  // Booleans never resolve into a token, so the arrow reads off the theme.
  if (theme.components?.tooltip?.arrow === false)
    cssVars['--persona-tooltip-arrow-display'] = 'none';

  // Keep badge defaults in CSS so an omitted badge border follows the pill,
  // and its colors follow semantic overrides without freezing resolved values.
  emitTruthy(cssVars, 'scroll-to-bottom-count-', [
    ['background', 'bg'],
    ['foreground', 'fg'],
    ['border', 'border'],
    ['borderRadius', 'radius'],
    ['size', 'size'],
    ['padding', 'padding'],
    ['fontSize', 'font-size'],
    ['fontWeight', 'font-weight'],
  ], '--persona-components-scrollToBottom-countBadge-');
  // The approval state falls back to the pill's own colors in CSS.
  emitTruthy(cssVars, 'scroll-to-bottom-approval-', [
    ['background', 'bg'],
    ['foreground', 'fg'],
    ['border', 'border'],
    ['fontWeight', 'font-weight'],
  ], '--persona-components-scrollToBottom-approval-');

  // V5 materializes message-action defaults in the theme; V4 retains the CSS
  // fallbacks. References follow ghost/semantic overrides in either scheme.
  emitTruthy(cssVars, 'message-action-', [
    ['background', 'bg'],
    ['border', 'border'],
    ['hoverBackground', 'hover-bg'],
    ['hoverForeground', 'hover-fg'],
    ['borderRadius', 'radius'],
  ], '--persona-components-messageActions-');

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
    // Event-stream badge chips. Materialized in every theme (light defaults in
    // DEFAULT_COMPONENTS, dark pairs in the built-in dark layer), so the
    // chip's inline var() refs always resolve inside a themed root and
    // re-resolve on scheme toggles; the literal terminals only cover unthemed
    // direct mounts.
    ['event-badge-flow-bg', 'components-eventStream-badge-flow-background', '=#dcfce7'],
    ['event-badge-flow-fg', 'components-eventStream-badge-flow-foreground', '=#15803d'],
    ['event-badge-step-bg', 'components-eventStream-badge-step-background', '=#f5f5f5'],
    ['event-badge-step-fg', 'components-eventStream-badge-step-foreground', '=#0a0a0a'],
    ['event-badge-reasoning-bg', 'components-eventStream-badge-reasoning-background', '=#fef9c3'],
    ['event-badge-reasoning-fg', 'components-eventStream-badge-reasoning-foreground', '=#a16207'],
    ['event-badge-tool-bg', 'components-eventStream-badge-tool-background', '=#f3e8ff'],
    ['event-badge-tool-fg', 'components-eventStream-badge-tool-foreground', '=#6b21a8'],
    ['event-badge-agent-bg', 'components-eventStream-badge-agent-background', '=#ccfbf1'],
    ['event-badge-agent-fg', 'components-eventStream-badge-agent-foreground', '=#115e59'],
    ['event-badge-error-bg', 'components-eventStream-badge-error-background', '=#fee2e2'],
    ['event-badge-error-fg', 'components-eventStream-badge-error-foreground', '=#b91c1c'],
    ['event-badge-default-bg', 'components-eventStream-badge-default-background', '=#f3f4f6'],
    ['event-badge-default-fg', 'components-eventStream-badge-default-foreground', '=#4b5563'],
    ['tool-bubble-shadow', 'components-toolBubble-shadow', '=0 5px 15px rgba(15, 23, 42, 0.08)'],
    ['reasoning-bubble-shadow', 'components-reasoningBubble-shadow', '=0 5px 15px rgba(15, 23, 42, 0.08)'],
    ['composer-shadow', 'components-composer-shadow', '=none'],
  ]);

  // Composer spacing/type. Fallbacks reproduce the utility classes the form
  // used to carry (`px-4 py-3`, `gap-2`, `text-sm`) exactly.
  emitAliases(cssVars, [
    ['panel-background', 'components-panel-background', 'surface'],
    ['transcript-background', 'components-message-background', 'container'],
    ['transcript-top-fade-background', 'components-message-topFadeBackground', 'transcript-background'],
    ['composer-footer-background', 'components-composer-footerBackground', 'surface'],
    ['composer-footer-padding', 'components-composer-footerPadding', '=1rem 1.5rem'],
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
    // `components.composer.segmented.*`, `.modelPicker.*`, and `.overflowMenu.*`
    // get no short aliases: the rows cost gzip in the critical launcher bundle,
    // which never draws a composer. widget.css reads the auto-emitted full
    // paths, like introCard title/subtitle.
    ['scrollbar-thumb', 'components-scrollbar-thumb', 'border', '=#e5e7eb'],
    ['scrollbar-track', 'components-scrollbar-track', '=transparent'],
    ['md-inline-code-bg', 'components-markdown-inlineCode-background', 'container'],
    ['md-inline-code-color', 'components-markdown-inlineCode-foreground', 'text'],
    ['md-link-color', 'components-markdown-link-foreground', 'accent', '=#0f0f0f'],
  ]);

  emitTruthy(cssVars, 'md-', [
    ['h1-fontSize', 'h1-size'],
    ['h1-fontWeight', 'h1-weight'],
    ['h2-fontSize', 'h2-size'],
    ['h2-fontWeight', 'h2-weight'],
  ], '--persona-components-markdown-heading-');

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
  const collapsibleWidgetAliases = [
    ['container', 'surface'],
    ['surface', 'surface'],
    ['border', 'border'],
  ] as const;
  for (const [name, semanticFallback] of collapsibleWidgetAliases) {
    const value =
      cssVars[`--persona-components-collapsibleWidget-${name}`] ??
      cssVars[`--persona-${semanticFallback}`];
    if (value !== undefined) {
      cssVars[`--persona-cw-${name}`] = value;
      // Kept for custom styles that adopted the original unprefixed aliases.
      cssVars[`--cw-${name}`] = value;
    }
  }

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
    ['message-assistant-border-width', 'components-message-assistant-borderWidth'],
    ['message-assistant-max-width', 'components-message-assistant-maxWidth'],
    ['message-assistant-font-size', 'components-message-assistant-fontSize'],
    ['message-assistant-font-family', 'components-message-assistant-fontFamily'],
    ['message-assistant-line-height', 'components-message-assistant-lineHeight'],
    ['message-operator-padding', 'components-message-operator-padding'],
    ['message-operator-max-width', 'components-message-operator-maxWidth'],
    ['message-operator-font-size', 'components-message-operator-fontSize'],
    ['message-operator-font-family', 'components-message-operator-fontFamily'],
    ['message-operator-line-height', 'components-message-operator-lineHeight'],
  ]);

  // Icon button tokens
  const components = theme.components;
  emitTruthy(components?.iconButton, 'icon-btn-', [
    ['background', 'bg'],
    ['border', 'border'],
    ['color', 'color'],
    ['padding', 'padding'],
    ['borderRadius', 'radius'],
    ['hoverBackground', 'hover-bg'],
    ['hoverColor', 'hover-color'],
    ['activeBackground', 'active-bg'],
    ['activeBorder', 'active-border'],
  ]);

  // Label button tokens
  emitTruthy(components?.labelButton, 'label-btn-', [
    ['background', 'bg'],
    ['border', 'border'],
    ['color', 'color'],
    ['padding', 'padding'],
    ['borderRadius', 'radius'],
    ['hoverBackground', 'hover-bg'],
    ['fontSize', 'font-size'],
    ['gap', 'gap'],
  ]);

  // Toggle group tokens
  emitTruthy(components?.toggleGroup, 'toggle-group-', [
    ['gap', 'gap'],
    ['borderRadius', 'radius'],
  ]);

  // Artifact tokens
  const artifact = components?.artifact;
  if (artifact?.toolbar) {
    const t = artifact.toolbar;
    emitTruthy(t, 'artifact-toolbar-icon-', [
      ['iconHoverColor', 'hover-color'],
      ['iconHoverBackground', 'hover-bg'],
      ['iconPadding', 'padding'],
      ['iconBorderRadius', 'radius'],
      ['iconBorder', 'border'],
    ]);
    // A bare "0" is a <number> in calc(), not a <length>; gap/padding feed the
    // toggle thumb's width calc, so a unitless zero would zero out the thumb.
    if (t.toggleGroupGap) cssVars['--persona-artifact-toolbar-toggle-group-gap'] = zeroLength(t.toggleGroupGap);
    if (t.toggleBorderRadius) cssVars['--persona-artifact-toolbar-toggle-radius'] = t.toggleBorderRadius;
    if (t.toggleGroupPadding) cssVars['--persona-artifact-toolbar-toggle-group-padding'] = zeroLength(t.toggleGroupPadding);
    emitTruthy(t, 'artifact-toolbar-toggle-group-', [
      ['toggleGroupBorder', 'border'],
      ['toggleGroupBorderRadius', 'radius'],
    ]);
    if (t.toggleGroupBackground) cssVars['--persona-artifact-toolbar-toggle-group-bg'] = resolveTokenValue(theme, t.toggleGroupBackground) ?? t.toggleGroupBackground;
    emitTruthy(t, 'artifact-toolbar-copy-', [
      ['copyBackground', 'bg'],
      ['copyBorder', 'border'],
      ['copyColor', 'color'],
    ]);
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
    emitTruthy(t, 'artifact-toolbar-', [
      ['iconBackground', 'icon-bg'],
      ['toolbarBorder', 'border'],
    ]);
  }
  if (artifact?.tab) {
    const t = artifact.tab;
    emitTruthy(t, 'artifact-tab-', [
      ['background', 'bg'],
      ['activeBackground', 'active-bg'],
      ['activeBorder', 'active-border'],
      ['borderRadius', 'radius'],
      ['textColor', 'color'],
      ['hoverBackground', 'hover-bg'],
      ['listBackground', 'list-bg'],
      ['listBorderColor', 'list-border-color'],
      ['listPadding', 'list-padding'],
    ]);
  }
  if (artifact?.pane) {
    const t = artifact.pane;
    if (t.toolbarBackground) {
      const toolbarBg =
        resolveTokenValue(theme, t.toolbarBackground) ?? t.toolbarBackground;
      cssVars['--persona-artifact-toolbar-bg'] = toolbarBg;
    }
  }
  // The third column opts into reference resolution; raw border/height stay raw.
  emitTruthy(artifact?.card, 'artifact-card-', [
    ['background', 'bg', true],
    ['border', 'border'],
    ['borderRadius', 'radius', true],
    ['hoverBackground', 'hover-bg', true],
    ['hoverBorderColor', 'hover-border', true],
  ]);
  emitTruthy(artifact?.inline, 'artifact-inline-', [
    ['background', 'bg', true],
    ['border', 'border'],
    ['borderRadius', 'radius', true],
    ['chromeBackground', 'chrome-bg', true],
    ['chromeBorder', 'chrome-border', true],
    ['titleColor', 'title-color', true],
    ['mutedColor', 'muted-color', true],
    ['frameHeight', 'frame-height'],
  ]);

  // Code (syntax-highlighted artifact source view) tokens.
  const code = components?.code;
  if (code) {
    emitTruthy(code, 'code-', [
      ['keywordColor', 'keyword-color'],
      ['stringColor', 'string-color'],
      ['commentColor', 'comment-color'],
      ['numberColor', 'number-color'],
      ['tagColor', 'tag-color'],
      ['attrColor', 'attr-color'],
      ['propertyColor', 'property-color'],
      ['lineNumberColor', 'line-number-color'],
      ['gutterBorderColor', 'gutter-border-color'],
    ]);
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
  'operator-message': 'Operator message bubble',
  composer: 'Footer / composer area',
  container: 'Main widget container',
  'artifact-pane': 'Artifact sidebar',
  'artifact-toolbar': 'Artifact toolbar',
  'artifact-inline': 'Inline artifact block',
  'artifact-inline-chrome': 'Inline artifact title bar',
} as const;

export type ThemeZone = keyof typeof THEME_ZONES;
