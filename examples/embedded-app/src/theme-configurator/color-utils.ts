/** Color parsing, normalization, and scale generation utilities */

import type { ColorShade } from '@runtypelabs/persona';

interface ParsedCssValue {
  value: number;
  unit: 'px' | 'rem';
}

export function parseCssValue(cssValue: string): ParsedCssValue {
  const trimmed = cssValue.trim();

  if (trimmed === '9999px') {
    return { value: 100, unit: 'px' };
  }

  const match = trimmed.match(/^([\d.]+)(px|rem)$/);
  if (!match) {
    const numValue = parseFloat(trimmed);
    return { value: isNaN(numValue) ? 0 : numValue, unit: 'px' };
  }

  return { value: parseFloat(match[1]), unit: match[2] as 'px' | 'rem' };
}

export function formatCssValue(value: number, unit: 'px' | 'rem'): string {
  if (unit === 'rem') {
    return `${value}rem`;
  }
  return `${value}px`;
}

export function convertToPx(value: number, unit: 'px' | 'rem'): number {
  return unit === 'rem' ? value * 16 : value;
}

export function convertFromPx(pxValue: number, unit: 'px' | 'rem'): number {
  return unit === 'rem' ? pxValue / 16 : pxValue;
}

export function normalizeColorValue(value: string): string {
  if (!value) return '#000000';

  const trimmed = value.trim().toLowerCase();

  if (trimmed === 'transparent') return 'transparent';
  if (trimmed.startsWith('rgba') || trimmed.startsWith('rgb')) return trimmed;

  // Ensure hex format
  if (trimmed.startsWith('#')) {
    if (trimmed.length === 4) {
      // Expand shorthand: #abc -> #aabbcc
      return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
    }
    return trimmed;
  }

  return `#${trimmed}`;
}

export function isValidHex(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const normalized = normalizeColorValue(hex);
  const r = parseInt(normalized.slice(1, 3), 16) / 255;
  const g = parseInt(normalized.slice(3, 5), 16) / 255;
  const b = parseInt(normalized.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
      break;
  }

  return { h: h * 360, s, l };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;

  let r: number, g: number, b: number;

  if (hue < 60) {
    [r, g, b] = [c, x, 0];
  } else if (hue < 120) {
    [r, g, b] = [x, c, 0];
  } else if (hue < 180) {
    [r, g, b] = [0, c, x];
  } else if (hue < 240) {
    [r, g, b] = [0, x, c];
  } else if (hue < 300) {
    [r, g, b] = [x, 0, c];
  } else {
    [r, g, b] = [c, 0, x];
  }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Generate a full color scale (50-950) from a base color (shade 500).
 * Uses HSL-based lightness interpolation for natural-looking scales.
 */
export function generateColorScale(baseHex: string): ColorShade {
  const { h, s, l } = hexToHsl(baseHex);

  // Lightness targets for each shade (based on Tailwind's approach)
  const lightnessByShade: Record<string, number> = {
    '50': 0.97,
    '100': 0.94,
    '200': 0.87,
    '300': 0.77,
    '400': 0.64,
    '500': l, // Use actual lightness from input
    '600': Math.max(0.05, l - 0.1),
    '700': Math.max(0.05, l - 0.2),
    '800': Math.max(0.05, l - 0.28),
    '900': Math.max(0.05, l - 0.35),
    '950': Math.max(0.03, l - 0.42),
  };

  // Adjust saturation: lighter shades are slightly desaturated, darker are slightly more saturated
  const saturationByShade: Record<string, number> = {
    '50': Math.min(1, s * 0.85),
    '100': Math.min(1, s * 0.9),
    '200': Math.min(1, s * 0.95),
    '300': s,
    '400': s,
    '500': s,
    '600': Math.min(1, s * 1.05),
    '700': Math.min(1, s * 1.05),
    '800': Math.min(1, s * 1.0),
    '900': Math.min(1, s * 0.95),
    '950': Math.min(1, s * 0.9),
  };

  const scale: ColorShade = {};
  for (const [shade, targetL] of Object.entries(lightnessByShade)) {
    const targetS = saturationByShade[shade];
    scale[shade] = hslToHex(h, targetS, targetL);
  }

  return scale;
}

/** Get a readable label for a color shade number */
export function shadeLabel(shade: string): string {
  return shade;
}

/** Get all shade keys in order */
export const SHADE_KEYS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const;

/** Get all palette color family names */
export const COLOR_FAMILIES = ['primary', 'secondary', 'accent', 'gray', 'success', 'warning', 'error'] as const;

/** Build a palette reference path */
export function paletteColorPath(family: string, shade: string): string {
  return `palette.colors.${family}.${shade}`;
}

/**
 * Get the display name for a token reference path.
 * e.g., 'palette.colors.primary.500' -> 'Primary 500'
 */
/**
 * Resolve a theme dot-path to a concrete CSS color string for display (e.g. inline color picker).
 * Uses the same chaining rules as the Style tab summaries: refs may be semantic.* or palette.* and recurse.
 */
export function resolveThemeColorPath(
  get: (path: string) => unknown,
  path: string,
  depth = 0
): string {
  if (depth > 5) return '#cbd5e1';

  const raw = get(path);
  if (typeof raw !== 'string') return '#cbd5e1';
  if (raw.startsWith('#') || raw.startsWith('rgb') || raw === 'transparent') return raw;

  if (
    raw.startsWith('palette.') ||
    raw.startsWith('semantic.') ||
    raw.startsWith('components.')
  ) {
    return resolveThemeColorPath(get, `theme.${raw}`, depth + 1);
  }

  return '#cbd5e1';
}

export function tokenRefDisplayName(path: string): string {
  if (!path.startsWith('palette.') && !path.startsWith('semantic.')) {
    return path; // literal value
  }

  const parts = path.split('.');
  if (parts[0] === 'palette' && parts[1] === 'colors') {
    const family = parts[2];
    const shade = parts[3];
    return `${family.charAt(0).toUpperCase() + family.slice(1)} ${shade}`;
  }

  if (parts[0] === 'semantic') {
    return parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }

  return parts[parts.length - 1];
}
