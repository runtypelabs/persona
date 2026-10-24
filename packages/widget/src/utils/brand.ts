import { deepMerge } from './deep-merge';
import type { BrandConfig, ColorShade, DeepPartial, PersonaTheme } from '../types/theme';

type RGB = [number, number, number];

// Parsing stays independent of the DOM so the critical launcher and full widget
// derive identical colors, including when rendering on the server.
const parseColor = (value?: string): RGB | undefined => {
  if (typeof value !== 'string') return;
  const color = value.trim();
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as RGB;
  }
  const match = /^rgba?\(\s*([^)]*)\)$/i.exec(color);
  if (!match) return;
  const parts = match[1].trim().split(/\s*[,/]\s*|\s+/);
  if (parts.length === 4 && /^(?:1(?:\.0+)?|100%)$/.test(parts[3])) parts.pop();
  if (parts.length !== 3) return;
  const channels = parts.map((part) => {
    if (!/^\d+(?:\.\d+)?%?$/.test(part)) return NaN;
    return Number.parseFloat(part) * (part.endsWith('%') ? 2.55 : 1);
  });
  if (channels.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return;
  return channels as RGB;
};

const luminance = (rgb: RGB): number => rgb.reduce((sum, channel, i) => {
  const c = channel / 255;
  return sum + (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i];
}, 0);
const hexColor = (rgb: RGB): string => '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
const mix = (rgb: RGB, target: number, amount: number): string => hexColor(rgb.map((c) => c + (target - c) * amount) as RGB);
const foreground = (rgb: RGB): string => luminance(rgb) > 0.179 ? '#000000' : '#ffffff';

export const inferBrandColorScheme = (brand?: BrandConfig): 'light' | 'dark' | undefined => {
  const neutral = parseColor(brand?.neutral);
  return neutral ? luminance(neutral) < 0.18 ? 'dark' : 'light' : undefined;
};

/** Sparse overlay: unspecified and invalid inputs leave versioned defaults intact. */
export const deriveBrandTheme = (brand?: BrandConfig, scheme: 'light' | 'dark' = 'light', components?: DeepPartial<PersonaTheme>['components'], v5Defaults = false): DeepPartial<PersonaTheme> => {
  const theme: DeepPartial<PersonaTheme> = {};
  if (!brand) return theme;
  const accent = parseColor(brand.accent);
  if (accent) {
    // Tint toward white above 500 and shade toward black below it. The seed
    // remains at 500 rather than shifting hue by adding channel constants.
    const ramp: ColorShade = {};
    for (const [stop, amount] of [[50, .96], [100, .9], [200, .75], [300, .55], [400, .25]] as const) ramp[stop] = mix(accent, 255, amount);
    ramp[500] = hexColor(accent);
    for (const [stop, amount] of [[600, .15], [700, .3], [800, .45], [900, .6], [950, .75]] as const) ramp[stop] = mix(accent, 0, amount);
    const ink = foreground(accent);
    theme.palette = { colors: { primary: ramp, accent: ramp } };
    theme.semantic = { colors: { primary: ramp[500], accent: ramp[500], interactive: { default: ramp[500], hover: ramp[600], focus: ramp[500], active: ramp[700] } } };
    theme.components = {
      button: { primary: { background: ramp[500], foreground: ink } },
      launcher: { background: ramp[500], foreground: ink },
      header: v5Defaults
        ? { background: 'semantic.colors.container', foreground: 'semantic.colors.text', iconBackground: 'transparent', iconForeground: 'semantic.colors.text' }
        : { background: ramp[500], foreground: ink, iconBackground: ramp[500], iconForeground: ink },
      approval: { approve: { foreground: ink } },
      message: { user: v5Defaults
        ? { background: 'color-mix(in srgb, var(--persona-primary) 12%, var(--persona-container))', text: 'semantic.colors.text' }
        : { background: ramp[500], text: ink } },
    };
  }
  const neutral = parseColor(brand.neutral);
  if (neutral) {
    // A seed chosen for the opposite explicit scheme still produces a usable
    // surface: project it toward that scheme's endpoint before adding layers.
    const dark = scheme === 'dark';
    const base = (dark === (luminance(neutral) < .18)) ? neutral : parseColor(mix(neutral, dark ? 0 : 255, .9))!;
    const surface = hexColor(base);
    const container = mix(base, dark ? 255 : 0, dark ? .06 : .025);
    const border = mix(base, dark ? 255 : 0, dark ? .2 : .16);
    const ink = foreground(base);
    const gray: ColorShade = {};
    for (const [stop, amount] of [[50, 0], [100, .06], [200, .16], [300, .28], [400, .45], [500, .65], [600, .72], [700, .8], [800, .9], [900, .97], [950, 1]] as const) gray[stop] = mix(base, ink === '#ffffff' ? 255 : 0, amount);
    theme.palette = { ...theme.palette, colors: { ...theme.palette?.colors, gray } };
    theme.semantic = { ...theme.semantic, colors: { ...theme.semantic?.colors, surface, background: surface, container, border, divider: border, text: ink, textMuted: mix(base, ink === '#ffffff' ? 255 : 0, .65) } };
    theme.components = { ...theme.components, panel: { background: surface }, header: { ...theme.components?.header, background: surface, foreground: ink }, composer: { footerBackground: surface } };
  }
  if (accent) {
    const surface = parseColor(theme.semantic?.colors?.surface) ?? (scheme === 'dark' ? [15, 15, 16] : [255, 255, 255]);
    let link = hexColor(accent);
    const target = foreground(surface) === '#ffffff' ? 255 : 0;
    for (let amount = 0; amount <= 1; amount += .1) {
      link = mix(accent, target, amount);
      const a = luminance(parseColor(link)!);
      const b = luminance(surface);
      if ((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5) break;
    }
    theme.components = { ...theme.components, markdown: { link: { foreground: link } }, input: { focus: { border: link, ring: link } } };
  }
  if (brand.font?.trim()) theme.semantic = { ...theme.semantic, typography: { fontFamily: brand.font } };
  const radius = { none: '0px', sm: '4px', md: '8px', lg: '16px' }[brand.radius ?? 'none'];
  if (brand.radius && radius) {
    theme.palette = { ...theme.palette, radius: { none: '0px', sm: radius, md: radius, lg: radius, xl: radius, '2xl': radius } };
    theme.components = { ...theme.components, input: { ...theme.components?.input, borderRadius: radius }, header: { ...theme.components?.header, controlBorderRadius: radius } };
  }
  const density = { compact: [13, 44, 8], comfortable: [14, 48, 12], spacious: [15, 52, 16] }[brand.density ?? 'comfortable'];
  if (brand.density && density) {
    const [size, height, gap] = density;
    theme.semantic = { ...theme.semantic, typography: { ...theme.semantic?.typography, fontSize: `${size}px` } };
    theme.components = { ...theme.components, header: { ...theme.components?.header, minHeight: `${height}px`, padding: `${gap}px 16px`, minimalPadding: `${gap}px 16px` }, history: { railHeader: { minHeight: `${height}px` } }, composer: { ...theme.components?.composer, fontSize: `${size}px`, padding: `${gap}px`, gap: `${gap / 2}px` }, message: { ...theme.components?.message, gap: `${gap}px`, user: { ...theme.components?.message?.user, fontSize: `${size}px` }, assistant: { fontSize: `${size}px` }, operator: { fontSize: `${size}px` } } };
  }
  if (brand.elevation && ['flat', 'subtle', 'raised'].includes(brand.elevation)) {
    const flat = brand.elevation === 'flat';
    const shadow = flat ? 'none' : brand.elevation === 'subtle' ? '0 2px 8px rgba(0, 0, 0, 0.08)' : '0 12px 32px rgba(0, 0, 0, 0.18)';
    const border = flat ? '1px solid var(--persona-border)' : '1px solid color-mix(in srgb, var(--persona-border) 65%, transparent)';
    theme.palette = { ...theme.palette, shadows: { sm: shadow, md: shadow, lg: shadow, xl: shadow, '2xl': shadow } };
    const shadows = (node: Record<string, unknown>, path = ''): Record<string, unknown> => {
      const overlay: Record<string, unknown> = {};
      // V5 assistant defaults are unpadded prose, not a surface to elevate.
      // Explicit theme tokens still win; custom bubbles can opt into the brand
      // shadow scale with `palette.shadows.sm` alongside their padding/background.
      if (v5Defaults && path === 'message.assistant') return overlay;
      for (const [key, value] of Object.entries(node)) {
        if (key.toLowerCase().endsWith('shadow')) {
          overlay[key] = shadow;
          const borderKey = key === 'shadow' ? 'border' : key.replace(/Shadow$/, 'Border');
          if (borderKey in node) overlay[borderKey] = typeof node[borderKey] === 'string' && (node[borderKey] as string).includes('solid') ? border : flat ? 'semantic.colors.border' : 'color-mix(in srgb, var(--persona-border) 65%, transparent)';
        }
        else if (value && typeof value === 'object') {
          const child = shadows(value as Record<string, unknown>, path ? `${path}.${key}` : key);
          if (Object.keys(child).length) overlay[key] = child;
        }
      }
      return overlay;
    };
    const allShadows = components ? shadows(components as Record<string, unknown>) : {};
    theme.components = deepMerge(theme.components, allShadows) as DeepPartial<PersonaTheme>['components'];
    theme.components = { ...theme.components, panel: { ...theme.components?.panel, shadow, modes: { floating: { shadow, border }, inline: { shadow, border }, docked: { shadow, border }, sidebar: { shadow, border }, mobile: { shadow, border } } }, launcher: { ...theme.components?.launcher, shadow, border: 'semantic.colors.border' }, composer: { ...theme.components?.composer, shadow, borderColor: 'semantic.colors.border' }, toolBubble: { shadow }, reasoningBubble: { shadow } };
  }
  return theme;
};
