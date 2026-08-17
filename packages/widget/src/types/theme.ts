export type TokenType = 'color' | 'spacing' | 'typography' | 'shadow' | 'border' | 'radius';

export type TokenReference<_T extends TokenType = TokenType> = string;

export interface ColorShade {
  50?: string;
  100?: string;
  200?: string;
  300?: string;
  400?: string;
  500?: string;
  600?: string;
  700?: string;
  800?: string;
  900?: string;
  950?: string;
  [key: string]: string | undefined;
}

export interface ColorPalette {
  gray: ColorShade;
  primary: ColorShade;
  secondary: ColorShade;
  accent: ColorShade;
  success: ColorShade;
  warning: ColorShade;
  error: ColorShade;
  info: ColorShade;
  [key: string]: ColorShade;
}

export interface SpacingScale {
  0: string;
  1: string;
  2: string;
  3: string;
  4: string;
  5: string;
  6: string;
  8: string;
  10: string;
  12: string;
  16: string;
  20: string;
  24: string;
  32: string;
  40: string;
  48: string;
  56: string;
  64: string;
  [key: string]: string;
}

export interface ShadowScale {
  none: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
  [key: string]: string;
}

export interface BorderScale {
  none: string;
  sm: string;
  md: string;
  lg: string;
  [key: string]: string;
}

export interface RadiusScale {
  none: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  full: string;
  [key: string]: string;
}

export interface TypographyScale {
  fontFamily: {
    sans: string;
    serif: string;
    mono: string;
  };
  fontSize: {
    xs: string;
    sm: string;
    base: string;
    lg: string;
    xl: string;
    '2xl': string;
    '3xl': string;
    '4xl': string;
  };
  fontWeight: {
    normal: string;
    medium: string;
    semibold: string;
    bold: string;
  };
  lineHeight: {
    tight: string;
    normal: string;
    relaxed: string;
  };
}

export interface SemanticColors {
  primary: TokenReference<'color'>;
  secondary: TokenReference<'color'>;
  accent: TokenReference<'color'>;
  surface: TokenReference<'color'>;
  background: TokenReference<'color'>;
  container: TokenReference<'color'>;
  text: TokenReference<'color'>;
  textMuted: TokenReference<'color'>;
  textInverse: TokenReference<'color'>;
  border: TokenReference<'color'>;
  divider: TokenReference<'color'>;
  interactive: {
    default: TokenReference<'color'>;
    hover: TokenReference<'color'>;
    focus: TokenReference<'color'>;
    active: TokenReference<'color'>;
    disabled: TokenReference<'color'>;
  };
  feedback: {
    success: TokenReference<'color'>;
    warning: TokenReference<'color'>;
    error: TokenReference<'color'>;
    info: TokenReference<'color'>;
  };
}

export interface SemanticSpacing {
  xs: TokenReference<'spacing'>;
  sm: TokenReference<'spacing'>;
  md: TokenReference<'spacing'>;
  lg: TokenReference<'spacing'>;
  xl: TokenReference<'spacing'>;
  '2xl': TokenReference<'spacing'>;
}

export interface SemanticTypography {
  fontFamily: TokenReference<'typography'>;
  fontSize: TokenReference<'typography'>;
  fontWeight: TokenReference<'typography'>;
  lineHeight: TokenReference<'typography'>;
}

export interface SemanticTokens {
  colors: SemanticColors;
  spacing: SemanticSpacing;
  typography: SemanticTypography;
}

export interface ComponentTokenSet {
  background?: TokenReference<'color'>;
  foreground?: TokenReference<'color'>;
  border?: TokenReference<'color'>;
  borderRadius?: TokenReference<'radius'>;
  padding?: TokenReference<'spacing'>;
  margin?: TokenReference<'spacing'>;
  shadow?: TokenReference<'shadow'>;
  opacity?: number;
  /** Hover background — used by transparent variants like `button.ghost`. */
  hoverBackground?: TokenReference<'color'>;
}

export interface ButtonTokens extends ComponentTokenSet {
  primary: ComponentTokenSet;
  secondary: ComponentTokenSet;
  ghost: ComponentTokenSet;
}

export interface InputTokens extends ComponentTokenSet {
  background: TokenReference<'color'>;
  placeholder: TokenReference<'color'>;
  focus: {
    border: TokenReference<'color'>;
    ring: TokenReference<'color'>;
  };
}

export interface LauncherTokens extends ComponentTokenSet {
  size: string;
  iconSize: string;
  shadow: TokenReference<'shadow'>;
}

export interface PanelTokens extends ComponentTokenSet {
  width: string;
  maxWidth: string;
  height: string;
  maxHeight: string;
  /** Gap between the detached panel and its region edges. Only used when detached. */
  inset?: string;
  /** Background of the region revealed behind a detached panel. */
  canvasBackground?: string;
}

/** Per-element text styling shared by themable text surfaces. */
export interface TextStyleTokens {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  letterSpacing?: string;
  color?: TokenReference<'color'>;
}

export interface HeaderTokens extends ComponentTokenSet {
  background: TokenReference<'color'>;
  border: TokenReference<'color'>;
  borderRadius: TokenReference<'radius'>;
  /** Background of the rounded avatar tile next to the title (Lucide / emoji / image). */
  iconBackground: TokenReference<'color'>;
  /** Foreground (glyph stroke or emoji text) on the header avatar tile. */
  iconForeground: TokenReference<'color'>;
  /** Legacy alias of `title.color`; `title.color` wins when both are set. */
  titleForeground: TokenReference<'color'>;
  /** Legacy alias of `subtitle.color`; `subtitle.color` wins when both are set. */
  subtitleForeground: TokenReference<'color'>;
  /** Header title typography (next to the icon, or minimal layout title). */
  title?: TextStyleTokens;
  /** Header subtitle typography, for the line under the title. */
  subtitle?: TextStyleTokens;
  /** Default color for clear / close icon buttons when launcher overrides are unset. */
  actionIconForeground: TokenReference<'color'>;
  /**
   * Edge of every header icon button: close, clear chat, `trailingActions`, and
   * the Messages toggle. Per-control config keys (`launcher.closeButtonSize`,
   * `launcher.clearChat.size`) still win. Coarse pointers floor the hit area at
   * 40px regardless. @default "32px"
   */
  controlSize?: string;
  /** Glyph box inside a header control. @default "20px" */
  controlIconSize?: string;
  /**
   * Stroke weight of the glyph inside a header control. Unitless, as an SVG
   * stroke-width (e.g. `"1.75"`). Sparse-viewBox glyphs (the close X) render
   * at 0.7 of it so their heavier visible weight still matches a dense
   * sibling. @default "1.5"
   */
  controlStrokeWidth?: string;
  /** Box-shadow on the header (e.g., a fade shadow to replace the default border). */
  shadow?: string;
  /** Override the header bottom border (e.g., `none`). */
  borderBottom?: string;
  /**
   * Floor for the header strip's height (e.g. `"56px"`). Pin it together with
   * `components.history.railHeader.minHeight` so the Messages rail header and
   * the conversation header read as one continuous band.
   */
  minHeight?: string;
}

/** Messages (conversation history) surfaces. */
export interface HistoryTokens {
  /**
   * The Messages rail's own top strip, which runs beside the widget header
   * when `features.history.presentation` resolves to `rail`.
   */
  railHeader?: {
    /** Strip background. Defaults to the rail's surface color. */
    background?: TokenReference<'color'>;
    /** Full border-bottom shorthand (raw CSS, e.g. `"1px solid #e5e7eb"`). @default "0" */
    border?: string;
    /** Strip height floor. Defaults to `components.header.minHeight`, then 56px. */
    minHeight?: string;
    /**
     * The strip's view title ("Messages"). Muted 14px/600 by default so the
     * label defers to the conversation header band beside it; set `color`
     * (and the type keys) to promote it.
     */
    title?: TextStyleTokens;
  };
  /**
   * The floating rail that a collapsed
   * `features.history.rail.collapsedBehavior: "overlay"` opens on hover. It
   * hangs below the trigger in the conversation header; its width and edge
   * stay `features.history.rail` geometry, not tokens.
   */
  overlay?: {
    /** Gap from the trigger, the docked edge, and the bottom. @default "8px" */
    margin?: string;
    /** Corner radius, on all four corners. @default "16px" */
    borderRadius?: string;
    /** Elevation over the conversation. @default "0 12px 40px rgba(0, 0, 0, 0.25)" */
    shadow?: string;
    /** Surface behind the rail. Defaults to the rail's own surface color. */
    background?: TokenReference<'color'>;
  };
  /**
   * Destructive action text (row Delete, "Delete all conversations").
   * Defaults to `palette.colors.error.600` in light schemes and a lighter
   * red in the built-in dark theme so the 14px labels keep AA contrast.
   */
  dangerForeground?: TokenReference<'color'>;
  /**
   * The delete/forget confirmation dialog the shell shows for destructive
   * history actions. The danger pair is always emitted (`--persona-danger`
   * / `--persona-danger-fg`); scrim and shadow keep the built-in look when
   * unset.
   */
  confirm?: {
    /**
     * Destructive button fill. Defaults to `palette.colors.error.700` in
     * light schemes and `error.600` in the built-in dark theme.
     */
    dangerBackground?: TokenReference<'color'>;
    /** Destructive button label. @default "#ffffff" */
    dangerForeground?: TokenReference<'color'>;
    /** Overlay behind the dialog. @default "rgba(15, 23, 42, 0.45)" */
    scrim?: TokenReference<'color'>;
    /** Card elevation (raw CSS shadow). */
    shadow?: string;
  };
  /** The per-row overflow menu in the Messages list (rail and panel). */
  menu?: {
    /**
     * Menu surface. Defaults to the list surface lifted 8% toward white so
     * the menu reads as elevated in dark schemes.
     */
    background?: TokenReference<'color'>;
    /** Corner radius. @default "12px" */
    borderRadius?: string;
  };
  /**
   * Enter/exit motion of the Messages surface. Only the body slides; the bar
   * is persistent chrome and never animates. Durations are milliseconds and 0
   * disables that leg; `prefers-reduced-motion` always wins over these.
   */
  motion?: {
    /** Entrance slide-and-fade duration: bare ms number, or a CSS time string. @default 180 */
    enterDurationMs?: number | string;
    /** Entrance easing. @default "cubic-bezier(0, 0, 0.2, 1)" */
    enterEasing?: string;
    /** Exit slide-and-fade duration: bare ms number, or a CSS time string. @default 160 */
    exitDurationMs?: number | string;
    /** Exit easing. @default "cubic-bezier(0.4, 0, 1, 1)" */
    exitEasing?: string;
  };
}

/**
 * The portaled icon-control tooltip (header controls, composer buttons) and
 * its trailing shortcut hint chip. Unset keys keep the built-in dark look.
 */
export interface TooltipTokens {
  /** Bubble and arrow fill. @default "#111827" */
  background?: TokenReference<'color'>;
  /** Label color. @default "#ffffff" */
  foreground?: TokenReference<'color'>;
  /** Trailing shortcut hint color. @default "rgba(255, 255, 255, 0.55)" */
  hintForeground?: TokenReference<'color'>;
  /** Bubble corner radius. Defaults to `palette.radius.sm`. */
  borderRadius?: TokenReference<'radius'>;
  /** Label type size. @default "12px" */
  fontSize?: string;
  /** Bubble inset, full CSS shorthand. @default "6px 12px" */
  padding?: TokenReference<'spacing'>;
  /** Bubble box-shadow (token ref or raw CSS, e.g. `none`). */
  shadow?: string;
  /** Render the caret pointing at the control. @default true */
  arrow?: boolean;
  /** Wrap width. @default "min(320px, calc(100vw - 16px))" */
  maxWidth?: string;
}

/**
 * The hover-revealed action row under a message (copy, vote, read aloud).
 * Unset keys inherit the shared ghost icon-button wash, which is already
 * scheme-aware, so most themes never need this group.
 */
export interface MessageActionsTokens {
  /** Hover fill. Defaults to `components.button.ghost.hoverBackground`. */
  hoverBackground?: TokenReference<'color'>;
  /** Hover icon color. Defaults to `semantic.colors.text`. */
  hoverForeground?: TokenReference<'color'>;
  /** Button corner radius. Defaults to `palette.radius.md`. */
  borderRadius?: TokenReference<'radius'>;
}

export interface MessageTokens {
  user: {
    background: TokenReference<'color'>;
    text: TokenReference<'color'>;
    borderRadius: TokenReference<'radius'>;
    /** User bubble box-shadow (token ref or raw CSS, e.g. `none`). */
    shadow?: string;
  };
  assistant: {
    background: TokenReference<'color'>;
    text: TokenReference<'color'>;
    borderRadius: TokenReference<'radius'>;
    /** Assistant bubble border color (CSS color). */
    border?: TokenReference<'color'>;
    /** Assistant bubble box-shadow (token ref or raw CSS, e.g. `none`). */
    shadow?: string;
  };
  /** Border color between messages in the thread. */
  border?: TokenReference<'color'>;
}

/**
 * Welcome / intro card rendered above the message list when no messages exist.
 * Set `welcome.variant: "none"` to hide it; use `layout.slots["body-top"]`
 * to replace it wholesale.
 */
export interface IntroCardTokens extends ComponentTokenSet {
  background?: TokenReference<'color'>;
  borderRadius?: TokenReference<'radius'>;
  padding?: TokenReference<'spacing'>;
  /** Box-shadow on the intro card (token ref or raw CSS, e.g. `none`). */
  shadow?: string;
  /** Full border shorthand on the intro card (raw CSS, e.g. `"1px solid rgba(0,0,0,0.1)"`). @default "none" */
  border?: string;
  /** Welcome title typography. */
  title?: TextStyleTokens;
  /** Welcome subtitle typography. */
  subtitle?: TextStyleTokens;
}

/** Collapsible widget chrome (tool bubbles, reasoning bubbles, approval bubbles). */
export interface CollapsibleWidgetTokens {
  /** Background for content areas. */
  container?: TokenReference<'color'>;
  /** Background for code blocks inside collapsible sections. */
  surface?: TokenReference<'color'>;
  /** Border color for collapsible sections. */
  border?: TokenReference<'color'>;
}

export interface MarkdownTokens {
  inlineCode: {
    background: TokenReference<'color'>;
    foreground: TokenReference<'color'>;
  };
  /** Foreground for `<a>` in rendered markdown (assistant bubbles + artifact pane). */
  link?: {
    foreground: TokenReference<'color'>;
  };
  /**
   * Body font for rendered markdown blocks (artifact pane + markdown bubbles).
   * Use a raw CSS `font-family` value, e.g. `Georgia, serif`.
   */
  prose?: {
    fontFamily?: string;
  };
  /** Optional heading scale overrides (raw CSS or resolvable token paths). */
  heading?: {
    h1?: {
      fontSize?: string;
      fontWeight?: string;
    };
    h2?: {
      fontSize?: string;
      fontWeight?: string;
    };
  };
  /** Fenced code block styling. */
  codeBlock?: {
    background?: TokenReference<'color'>;
    borderColor?: TokenReference<'color'>;
    textColor?: TokenReference<'color'>;
    /** Corner radius; follows `palette.radius.md` by default so square-corner themes get square code blocks. */
    borderRadius?: TokenReference<'radius'>;
  };
  /** Table styling. */
  table?: {
    headerBackground?: TokenReference<'color'>;
    borderColor?: TokenReference<'color'>;
  };
  /** Horizontal rule styling. */
  hr?: {
    color?: TokenReference<'color'>;
  };
  /** Blockquote styling. */
  blockquote?: {
    borderColor?: TokenReference<'color'>;
    background?: TokenReference<'color'>;
    textColor?: TokenReference<'color'>;
  };
}

export interface VoiceTokens {
  recording: {
    indicator: TokenReference<'color'>;
    background: TokenReference<'color'>;
    border: TokenReference<'color'>;
  };
  processing: {
    icon: TokenReference<'color'>;
    background: TokenReference<'color'>;
  };
  speaking: {
    icon: TokenReference<'color'>;
  };
}

export interface ApprovalTokens {
  requested: {
    background: TokenReference<'color'>;
    border: TokenReference<'color'>;
    text: TokenReference<'color'>;
    /** Box-shadow for the approval bubble (token ref or raw CSS, e.g. `none`). */
    shadow: string;
  };
  approve: ComponentTokenSet;
  deny: ComponentTokenSet;
}

export interface AttachmentTokens {
  image: {
    background: TokenReference<'color'>;
    border: TokenReference<'color'>;
  };
}

/** Tool-call row chrome (collapsible tool bubbles). */
export interface ToolBubbleTokens {
  /** Box-shadow for tool bubbles (token ref or raw CSS, e.g. `none`). */
  shadow: string;
}

/** Reasoning / “thinking” row chrome. */
export interface ReasoningBubbleTokens {
  shadow: string;
}

/** Scrollbar appearance shared by every scroller in the widget. */
export interface ScrollbarTokens {
  /** Thumb color. @default semantic.colors.border */
  thumb?: TokenReference<'color'>;
  /** Track color. @default "transparent" */
  track?: TokenReference<'color'>;
}

/** Composer (message input) chrome. */
export interface ComposerChromeTokens {
  /** Box-shadow on the composer form (raw CSS, e.g. `none`). */
  shadow: string;
  /** Border color of the composer form. @default semantic.colors.border */
  borderColor?: TokenReference<'color'>;
  /** Inner padding of the composer form (raw CSS shorthand). @default "0.75rem 1rem" */
  padding?: string;
  /** Gap between the textarea row and the actions row. @default "0.5rem" */
  gap?: string;
  /** Composer textarea font-size. @default "0.875rem" */
  fontSize?: string;
  /** Composer textarea line-height. @default "1.25rem" */
  lineHeight?: string;
}

/** Artifact toolbar chrome. */
export interface ArtifactToolbarTokens {
  iconHoverColor?: string;
  iconHoverBackground?: string;
  iconPadding?: string;
  iconBorderRadius?: string;
  iconBorder?: string;
  toggleGroupGap?: string;
  toggleBorderRadius?: string;
  /** Inner padding of the segmented view/source toggle pill. */
  toggleGroupPadding?: string;
  /** Border of the segmented view/source toggle pill (e.g., `none`). */
  toggleGroupBorder?: string;
  /** Corner radius of the segmented view/source toggle pill. */
  toggleGroupBorderRadius?: string;
  /** Background of the segmented view/source toggle pill. */
  toggleGroupBackground?: string;
  copyBackground?: string;
  copyBorder?: string;
  copyColor?: string;
  copyBorderRadius?: string;
  copyPadding?: string;
  copyMenuBackground?: string;
  copyMenuBorder?: string;
  copyMenuShadow?: string;
  copyMenuBorderRadius?: string;
  copyMenuItemHoverBackground?: string;
  /** Base background of icon buttons (defaults to --persona-surface). */
  iconBackground?: string;
  /** Border on the toolbar (e.g., `none` to remove the bottom border). */
  toolbarBorder?: string;
}

/** Artifact tab strip chrome. */
export interface ArtifactTabTokens {
  background?: string;
  activeBackground?: string;
  activeBorder?: string;
  borderRadius?: string;
  textColor?: string;
  /** Hover background for inactive tabs. */
  hoverBackground?: string;
  /** Tab list container background. */
  listBackground?: string;
  /** Tab list container border color. */
  listBorderColor?: string;
  /** Tab list container padding (CSS shorthand). */
  listPadding?: string;
}

/** Artifact reference card (chat thread) chrome. */
export interface ArtifactCardTokens {
  background?: string;
  /** Full border shorthand (e.g. `1px solid #e5e7eb`). */
  border?: string;
  borderRadius?: string;
  hoverBackground?: string;
  /** Border color on hover. */
  hoverBorderColor?: string;
}

/** Artifact pane chrome. */
export interface ArtifactPaneTokens {
  /**
   * Background for the artifact column (toolbar + content), resolved from the theme.
   * Defaults to `semantic.colors.container` so the pane matches assistant message surfaces.
   * `features.artifacts.layout.paneBackground` still wins when set (layout escape hatch).
   */
  background?: string;
  toolbarBackground?: string;
}

/** Inline artifact block chrome (`display: "inline"` file preview). */
export interface ArtifactInlineTokens {
  /** Background of the inline preview frame. */
  background?: string;
  /** Full border shorthand for the frame (e.g. `1px solid #e5e7eb`). */
  border?: string;
  /** Border radius of the inline preview frame. */
  borderRadius?: string;
  /** Background of the title/toolbar chrome bar. */
  chromeBackground?: string;
  /** Bottom border of the title bar. */
  chromeBorder?: string;
  /** Title text color in the chrome bar (artifact basename). */
  titleColor?: string;
  /** Muted text color for the type label / streaming status. */
  mutedColor?: string;
  /** Preview iframe height inside the inline body. */
  frameHeight?: string;
}

/**
 * Syntax-highlighted artifact source view (pane + inline), rendered by
 * `utils/code-highlight.ts`. One Light defaults ship in `widget.css`, with a
 * One Dark override keyed off the widget's resolved color scheme (the
 * `data-persona-color-scheme` root attribute, not the OS preference); set any
 * of these to retheme the tokenizer palette and the line-number gutter.
 */
export interface CodeTokens {
  /** Keywords, booleans, null (e.g. `const`, `true`). */
  keywordColor?: string;
  /** String and template literals; HTML attribute values. */
  stringColor?: string;
  /** Line and block comments. */
  commentColor?: string;
  /** Numeric literals; CSS hex colors / units. */
  numberColor?: string;
  /** HTML tag brackets + names; doctype. */
  tagColor?: string;
  /** HTML attribute names. */
  attrColor?: string;
  /** CSS property names; JSON object keys. */
  propertyColor?: string;
  /** Line-number gutter digits. */
  lineNumberColor?: string;
  /** Right border of the line-number gutter. */
  gutterBorderColor?: string;
  /** Background of the source-view code sheet (defaults to One Light/Dark editor background). */
  background?: string;
}

/** Icon button chrome (used by createIconButton). */
export interface IconButtonTokens {
  background?: string;
  border?: string;
  color?: string;
  padding?: string;
  borderRadius?: string;
  hoverBackground?: string;
  hoverColor?: string;
  /** Background when aria-pressed="true". */
  activeBackground?: string;
  /** Border color when aria-pressed="true". */
  activeBorder?: string;
}

/** Label button chrome (used by createLabelButton). */
export interface LabelButtonTokens {
  background?: string;
  border?: string;
  color?: string;
  padding?: string;
  borderRadius?: string;
  hoverBackground?: string;
  fontSize?: string;
  gap?: string;
}

/** Scroll-to-bottom pill chrome shared by transcript + event stream. */
export interface ScrollToBottomTokens extends ComponentTokenSet {
  size?: string;
  gap?: string;
  fontSize?: string;
  iconSize?: string;
}

/** Visual tokens shared by one suggestion presentation variant. */
export interface SuggestionVariantTokens extends ComponentTokenSet {
  /** Space inside one item, between its icon and its copy. */
  gap?: string;
  /** Space between suggestion items in the container. */
  itemGap?: string;
  minHeight?: string;
  fontSize?: string;
  lineHeight?: string;
  iconSize?: string;
  hoverBackground?: TokenReference<'color'>;
  hoverForeground?: TokenReference<'color'>;
  hoverBorder?: TokenReference<'color'>;
  pressedBackground?: TokenReference<'color'>;
  focusRing?: TokenReference<'color'>;
  disabledOpacity?: string;
}

/** Starter and follow-up suggestion chrome. */
export interface SuggestionTokens {
  chip: SuggestionVariantTokens;
  card: SuggestionVariantTokens;
  list: SuggestionVariantTokens;
}

/** Toggle group chrome (used by createToggleGroup). */
export interface ToggleGroupTokens {
  /** Gap between toggle buttons. Default: 0 (connected). */
  gap?: string;
  /** Border radius for first/last buttons. */
  borderRadius?: string;
}

export interface ComponentTokens {
  button: ButtonTokens;
  input: InputTokens;
  launcher: LauncherTokens;
  panel: PanelTokens;
  header: HeaderTokens;
  /** Messages rail chrome. */
  history?: HistoryTokens;
  /** Portaled icon-control tooltip and its shortcut hint chip. */
  tooltip?: TooltipTokens;
  message: MessageTokens;
  /** Hover-revealed per-message action row (copy, vote, read aloud). */
  messageActions?: MessageActionsTokens;
  /** Welcome / intro card shown above the message list. */
  introCard?: IntroCardTokens;
  /** Markdown surfaces (chat + artifact pane). */
  markdown?: MarkdownTokens;
  voice: VoiceTokens;
  approval: ApprovalTokens;
  attachment: AttachmentTokens;
  toolBubble: ToolBubbleTokens;
  reasoningBubble: ReasoningBubbleTokens;
  composer: ComposerChromeTokens;
  /** Scrollbar appearance for every scroller in the widget. */
  scrollbar?: ScrollbarTokens;
  /** Icon button styling tokens. */
  iconButton?: IconButtonTokens;
  /** Label button styling tokens. */
  labelButton?: LabelButtonTokens;
  /** Scroll-to-bottom indicator styling tokens. */
  scrollToBottom?: ScrollToBottomTokens;
  /** Starter prompt and follow-up suggestion styling tokens. */
  suggestion?: SuggestionTokens;
  /** Toggle group styling tokens. */
  toggleGroup?: ToggleGroupTokens;
  /** Artifact toolbar, tab strip, and pane chrome. */
  artifact?: {
    toolbar?: ArtifactToolbarTokens;
    tab?: ArtifactTabTokens;
    pane?: ArtifactPaneTokens;
    card?: ArtifactCardTokens;
    inline?: ArtifactInlineTokens;
  };
  /** Collapsible widget chrome (tool/reasoning/approval bubbles). */
  collapsibleWidget?: CollapsibleWidgetTokens;
  /** Syntax-highlighted artifact source view (tokenizer palette + gutter). */
  code?: CodeTokens;
}

export interface PaletteExtras {
  transitions?: Record<string, string>;
  easings?: Record<string, string>;
}

export interface PersonaThemeBase {
  palette: {
    colors: ColorPalette;
    spacing: SpacingScale;
    typography: TypographyScale;
    shadows: ShadowScale;
    borders: BorderScale;
    radius: RadiusScale;
  } & PaletteExtras;
}

export interface PersonaThemeSemantic {
  semantic: SemanticTokens;
}

export interface PersonaThemeComponents {
  components: ComponentTokens;
}

export type PersonaTheme = PersonaThemeBase & 
  PersonaThemeSemantic & 
  PersonaThemeComponents;

/** Recursive partial for `config.theme` / `config.darkTheme` overrides. */
export type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T;

export interface ResolvedToken {
  path: string;
  value: string;
  type: TokenType;
}

export interface ThemeValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ThemeValidationResult {
  valid: boolean;
  errors: ThemeValidationError[];
  warnings: ThemeValidationError[];
}

export interface PersonaThemePlugin {
  name: string;
  version: string;
  transform(theme: PersonaTheme): PersonaTheme;
  cssVariables?: Record<string, string>;
  afterResolve?(resolved: Record<string, string>): Record<string, string>;
}

export interface CreateThemeOptions {
  plugins?: PersonaThemePlugin[];
  validate?: boolean;
  extend?: PersonaTheme;
}
