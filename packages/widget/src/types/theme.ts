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
}

export interface HeaderTokens extends ComponentTokenSet {
  background: TokenReference<'color'>;
  border: TokenReference<'color'>;
  borderRadius: TokenReference<'radius'>;
  /** Background of the rounded avatar tile next to the title (Lucide / emoji / image). */
  iconBackground: TokenReference<'color'>;
  /** Foreground (glyph stroke or emoji text) on the header avatar tile. */
  iconForeground: TokenReference<'color'>;
  /** Header title line (next to the icon, or minimal layout title). */
  titleForeground: TokenReference<'color'>;
  /** Header subtitle line under the title. */
  subtitleForeground: TokenReference<'color'>;
  /** Default color for clear / close icon buttons when launcher overrides are unset. */
  actionIconForeground: TokenReference<'color'>;
  /** Box-shadow on the header (e.g., a fade shadow to replace the default border). */
  shadow?: string;
  /** Override the header bottom border (e.g., `none`). */
  borderBottom?: string;
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

/** Composer (message input) chrome. */
export interface ComposerChromeTokens {
  /** Box-shadow on the composer form (raw CSS, e.g. `none`). */
  shadow: string;
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
  message: MessageTokens;
  /** Markdown surfaces (chat + artifact pane). */
  markdown?: MarkdownTokens;
  voice: VoiceTokens;
  approval: ApprovalTokens;
  attachment: AttachmentTokens;
  toolBubble: ToolBubbleTokens;
  reasoningBubble: ReasoningBubbleTokens;
  composer: ComposerChromeTokens;
  /** Icon button styling tokens. */
  iconButton?: IconButtonTokens;
  /** Label button styling tokens. */
  labelButton?: LabelButtonTokens;
  /** Scroll-to-bottom indicator styling tokens. */
  scrollToBottom?: ScrollToBottomTokens;
  /** Toggle group styling tokens. */
  toggleGroup?: ToggleGroupTokens;
  /** Artifact toolbar, tab strip, and pane chrome. */
  artifact?: {
    toolbar?: ArtifactToolbarTokens;
    tab?: ArtifactTabTokens;
    pane?: ArtifactPaneTokens;
  };
  /** Collapsible widget chrome (tool/reasoning/approval bubbles). */
  collapsibleWidget?: CollapsibleWidgetTokens;
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
