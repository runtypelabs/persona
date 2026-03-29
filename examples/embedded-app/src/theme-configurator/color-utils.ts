/** Color utilities — re-exported from @runtypelabs/persona/theme-editor headless core */

export {
  parseCssValue,
  formatCssValue,
  convertToPx,
  convertFromPx,
  normalizeColorValue,
  isValidHex,
  hexToHsl,
  hslToHex,
  generateColorScale,
  SHADE_KEYS,
  COLOR_FAMILIES,
  paletteColorPath,
  resolveThemeColorPath,
  tokenRefDisplayName,
  wcagContrastRatio,
} from '@runtypelabs/persona/theme-editor';

/** Get a readable label for a color shade number */
export function shadeLabel(shade: string): string {
  return shade;
}
