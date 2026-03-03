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
}

export interface MessageTokens {
  user: {
    background: TokenReference<'color'>;
    text: TokenReference<'color'>;
    borderRadius: TokenReference<'radius'>;
  };
  assistant: {
    background: TokenReference<'color'>;
    text: TokenReference<'color'>;
    borderRadius: TokenReference<'radius'>;
  };
}

export interface ComponentTokens {
  button: ButtonTokens;
  input: InputTokens;
  launcher: LauncherTokens;
  panel: PanelTokens;
  header: HeaderTokens;
  message: MessageTokens;
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
