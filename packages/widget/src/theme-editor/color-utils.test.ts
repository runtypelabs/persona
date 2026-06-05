import { describe, it, expect } from 'vitest';
import {
  rgbToHex,
  hexToHsl,
  generateColorScale,
  wcagContrastRatio,
  SHADE_KEYS,
} from './color-utils';

describe('rgbToHex', () => {
  it('parses integer rgb()', () => {
    expect(rgbToHex('rgb(255, 0, 0)')).toBe('#ff0000');
    expect(rgbToHex('rgb(37, 99, 235)')).toBe('#2563eb');
  });

  it('drops the alpha channel from rgba()', () => {
    expect(rgbToHex('rgba(0, 128, 0, 0.5)')).toBe('#008000');
  });

  it('parses percentage channels and clamps out-of-range values', () => {
    expect(rgbToHex('rgb(100%, 0%, 0%)')).toBe('#ff0000');
    expect(rgbToHex('rgb(300, -20, 0)')).toBe('#ff0000');
  });

  it('returns null for non-rgb input', () => {
    expect(rgbToHex('#2563eb')).toBeNull();
    expect(rgbToHex('blue')).toBeNull();
    expect(rgbToHex('rgb(1, 2)')).toBeNull();
  });
});

describe('hexToHsl with rgb() input', () => {
  it('produces the same HSL as the equivalent hex', () => {
    const fromRgb = hexToHsl('rgb(37, 99, 235)');
    const fromHex = hexToHsl('#2563eb');
    expect(fromRgb.h).toBeCloseTo(fromHex.h, 5);
    expect(fromRgb.s).toBeCloseTo(fromHex.s, 5);
    expect(fromRgb.l).toBeCloseTo(fromHex.l, 5);
  });
});

describe('generateColorScale with rgb() input', () => {
  it('does not emit NaN shades for rgb() base colors', () => {
    const scale = generateColorScale('rgb(255, 0, 0)');
    for (const shade of SHADE_KEYS) {
      expect(scale[shade]).toMatch(/^#[0-9a-f]{6}$/);
      expect(scale[shade]).not.toContain('NaN');
    }
  });
});

describe('wcagContrastRatio with rgb() input', () => {
  it('matches the hex equivalent', () => {
    expect(wcagContrastRatio('rgb(255, 255, 255)', 'rgb(0, 0, 0)')).toBeCloseTo(
      wcagContrastRatio('#ffffff', '#000000'),
      5
    );
  });
});
