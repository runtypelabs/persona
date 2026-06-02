/**
 * Input coercion for the WebMCP theme tools.
 *
 * Agent inputs are flexible by design (arcade.dev "parameter coercion"): colors
 * accept hex with/without `#`, 3-digit hex, rgb(), and common CSS color names;
 * enums accept friendly synonyms. Each coercer throws an Error whose message
 * lists the valid options (arcade.dev "error-guided recovery").
 */

import {
  normalizeColorValue,
  isValidHex,
  parseCssValue,
  formatCssValue,
} from '../color-utils';

// ─── CSS named colors (common subset) ───────────────────────────

export const CSS_NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  lime: '#00ff00',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  aqua: '#00ffff',
  magenta: '#ff00ff',
  fuchsia: '#ff00ff',
  silver: '#c0c0c0',
  gray: '#808080',
  grey: '#808080',
  maroon: '#800000',
  olive: '#808000',
  purple: '#800080',
  teal: '#008080',
  navy: '#000080',
  orange: '#ffa500',
  pink: '#ffc0cb',
  hotpink: '#ff69b4',
  gold: '#ffd700',
  indigo: '#4b0082',
  violet: '#ee82ee',
  brown: '#a52a2a',
  beige: '#f5f5dc',
  ivory: '#fffff0',
  khaki: '#f0e68c',
  coral: '#ff7f50',
  salmon: '#fa8072',
  tomato: '#ff6347',
  crimson: '#dc143c',
  turquoise: '#40e0d0',
  lavender: '#e6e6fa',
  plum: '#dda0dd',
  orchid: '#da70d6',
  tan: '#d2b48c',
  chocolate: '#d2691e',
  sienna: '#a0522d',
  slategray: '#708090',
  slategrey: '#708090',
  steelblue: '#4682b4',
  royalblue: '#4169e1',
  dodgerblue: '#1e90ff',
  skyblue: '#87ceeb',
  lightblue: '#add8e6',
  midnightblue: '#191970',
  forestgreen: '#228b22',
  seagreen: '#2e8b57',
  limegreen: '#32cd32',
  olivedrab: '#6b8e23',
  darkgreen: '#006400',
  emerald: '#50c878',
  mint: '#3eb489',
  goldenrod: '#daa520',
  firebrick: '#b22222',
  darkred: '#8b0000',
  indianred: '#cd5c5c',
  deeppink: '#ff1493',
  mediumpurple: '#9370db',
  rebeccapurple: '#663399',
  darkviolet: '#9400d3',
  slateblue: '#6a5acd',
  cornflowerblue: '#6495ed',
  teal2: '#008080',
  charcoal: '#36454f',
  graphite: '#3b3b3b',
  transparent: 'transparent',
};

// ─── Colors ─────────────────────────────────────────────────────

/**
 * Coerce a flexible color input into a canonical CSS color string.
 * Accepts: `#1d4ed8`, `1d4ed8`, `#18f`, `rgb(...)`, `transparent`, and common
 * CSS color names. Throws with guidance when the value can't be understood.
 */
export function coerceColor(input: unknown): string {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new Error('Color must be a non-empty string (e.g. "#2563eb" or "blue").');
  }
  const trimmed = input.trim().toLowerCase();

  const named = CSS_NAMED_COLORS[trimmed];
  if (named) return named;

  const normalized = normalizeColorValue(trimmed);
  if (
    isValidHex(normalized) ||
    normalized === 'transparent' ||
    normalized.startsWith('rgb')
  ) {
    return normalized;
  }

  throw new Error(
    `"${input}" is not a recognized color. Pass a hex value like "#ef4444" or a CSS color name (e.g. ${Object.keys(
      CSS_NAMED_COLORS
    )
      .slice(0, 6)
      .join(', ')}).`
  );
}

// ─── Enums ──────────────────────────────────────────────────────

export type BrandFamily = 'primary' | 'secondary' | 'accent';
export type RoleFamilyInput = BrandFamily | 'neutral';

const FAMILY_SYNONYMS: Record<string, RoleFamilyInput> = {
  primary: 'primary',
  secondary: 'secondary',
  accent: 'accent',
  neutral: 'neutral',
  gray: 'neutral',
  grey: 'neutral',
};

/** Coerce a palette family. Set `allowNeutral` for role assignments. */
export function coerceFamily(input: unknown, allowNeutral = true): RoleFamilyInput {
  const key = String(input ?? '').trim().toLowerCase();
  const family = FAMILY_SYNONYMS[key];
  if (!family || (!allowNeutral && family === 'neutral')) {
    const valid = allowNeutral
      ? 'primary, secondary, accent, neutral'
      : 'primary, secondary, accent';
    throw new Error(`Unknown color family "${input}". Valid families: ${valid}.`);
  }
  return family;
}

export function coerceIntensity(input: unknown): 'solid' | 'soft' {
  const key = String(input ?? 'solid').trim().toLowerCase();
  if (key === 'solid' || key === 'soft') return key;
  throw new Error(`Unknown intensity "${input}". Valid intensities: solid, soft.`);
}

export function coerceScheme(input: unknown): 'light' | 'dark' | 'auto' {
  const key = String(input ?? '').trim().toLowerCase();
  if (key === 'light' || key === 'dark' || key === 'auto') return key;
  if (key === 'system') return 'auto';
  throw new Error(`Unknown color scheme "${input}". Valid: light, dark, auto.`);
}

export type RoundnessStyle = 'sharp' | 'default' | 'rounded' | 'pill';

const ROUNDNESS_SYNONYMS: Record<string, RoundnessStyle> = {
  sharp: 'sharp',
  square: 'sharp',
  none: 'sharp',
  default: 'default',
  normal: 'default',
  rounded: 'rounded',
  round: 'rounded',
  soft: 'rounded',
  pill: 'pill',
  circle: 'pill',
  full: 'pill',
};

export function coerceRoundnessStyle(input: unknown): RoundnessStyle {
  const key = String(input ?? '').trim().toLowerCase();
  const style = ROUNDNESS_SYNONYMS[key];
  if (!style) {
    throw new Error(`Unknown roundness "${input}". Valid: sharp, default, rounded, pill.`);
  }
  return style;
}

// ─── Sizes ──────────────────────────────────────────────────────

/** Coerce a radius value: numbers become `${n}px`; CSS strings are normalized. */
export function coerceRadius(input: unknown): string {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return `${input}px`;
  }
  if (typeof input === 'string' && input.trim() !== '') {
    const trimmed = input.trim();
    if (trimmed === '9999px' || /^(100%|9999px)$/.test(trimmed)) return '9999px';
    const parsed = parseCssValue(trimmed);
    return formatCssValue(parsed.value, parsed.unit);
  }
  throw new Error('Radius must be a number (px) or a CSS length string like "0.5rem".');
}

// ─── Typography keyword → token-ref maps (verbatim from sections.ts) ─

export const FONT_FAMILY_REFS: Record<string, string> = {
  sans: 'palette.typography.fontFamily.sans',
  serif: 'palette.typography.fontFamily.serif',
  mono: 'palette.typography.fontFamily.mono',
  monospace: 'palette.typography.fontFamily.mono',
};

export const FONT_SIZE_REFS: Record<string, string> = {
  xs: 'palette.typography.fontSize.xs',
  sm: 'palette.typography.fontSize.sm',
  small: 'palette.typography.fontSize.sm',
  base: 'palette.typography.fontSize.base',
  md: 'palette.typography.fontSize.base',
  medium: 'palette.typography.fontSize.base',
  lg: 'palette.typography.fontSize.lg',
  large: 'palette.typography.fontSize.lg',
  xl: 'palette.typography.fontSize.xl',
};

export const FONT_WEIGHT_REFS: Record<string, string> = {
  normal: 'palette.typography.fontWeight.normal',
  '400': 'palette.typography.fontWeight.normal',
  medium: 'palette.typography.fontWeight.medium',
  '500': 'palette.typography.fontWeight.medium',
  semibold: 'palette.typography.fontWeight.semibold',
  '600': 'palette.typography.fontWeight.semibold',
  bold: 'palette.typography.fontWeight.bold',
  '700': 'palette.typography.fontWeight.bold',
};

export const LINE_HEIGHT_REFS: Record<string, string> = {
  tight: 'palette.typography.lineHeight.tight',
  '1.25': 'palette.typography.lineHeight.tight',
  normal: 'palette.typography.lineHeight.normal',
  '1.5': 'palette.typography.lineHeight.normal',
  relaxed: 'palette.typography.lineHeight.relaxed',
  '1.625': 'palette.typography.lineHeight.relaxed',
};

export function coerceTypographyRef(
  input: unknown,
  refs: Record<string, string>,
  label: string
): string {
  const key = String(input ?? '').trim().toLowerCase();
  const ref = refs[key];
  if (!ref) {
    const valid = [...new Set(Object.values(refs).map((r) => r.split('.').pop()))].join(', ');
    throw new Error(`Unknown ${label} "${input}". Valid: ${valid}.`);
  }
  return ref;
}
