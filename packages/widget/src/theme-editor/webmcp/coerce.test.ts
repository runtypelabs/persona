import { describe, it, expect } from 'vitest';
import {
  coerceColor,
  coerceFamily,
  coerceIntensity,
  coerceScheme,
  coerceRoundnessStyle,
  coerceRadius,
  coerceTypographyRef,
  FONT_WEIGHT_REFS,
} from './coerce';

describe('coerceColor', () => {
  it('normalizes bare and short hex', () => {
    expect(coerceColor('2563eb')).toBe('#2563eb');
    expect(coerceColor('#18f')).toBe('#1188ff');
    expect(coerceColor('#2563EB')).toBe('#2563eb');
  });

  it('maps CSS color names', () => {
    expect(coerceColor('blue')).toBe('#0000ff');
    expect(coerceColor('SlateBlue')).toBe('#6a5acd');
  });

  it('passes through valid rgb/rgba and transparent', () => {
    expect(coerceColor('transparent')).toBe('transparent');
    expect(coerceColor('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)');
    expect(coerceColor('rgba(1,2,3,0.5)')).toBe('rgba(1,2,3,0.5)');
  });

  it('rejects malformed rgb-prefixed garbage', () => {
    expect(() => coerceColor('rgbfoo')).toThrow(/not a recognized color/);
    expect(() => coerceColor('rgba(')).toThrow(/not a recognized color/);
  });

  it('throws with guidance on garbage', () => {
    expect(() => coerceColor('notacolor')).toThrow(/not a recognized color/);
    expect(() => coerceColor('')).toThrow();
  });
});

describe('enum coercion', () => {
  it('coerces families with neutral synonyms', () => {
    expect(coerceFamily('gray')).toBe('neutral');
    expect(coerceFamily('Primary')).toBe('primary');
    expect(() => coerceFamily('neutral', false)).toThrow(/Valid families/);
  });

  it('coerces intensity defaulting to solid', () => {
    expect(coerceIntensity(undefined)).toBe('solid');
    expect(coerceIntensity('SOFT')).toBe('soft');
    expect(() => coerceIntensity('bright')).toThrow();
  });

  it('coerces scheme with system → auto', () => {
    expect(coerceScheme('system')).toBe('auto');
    expect(coerceScheme('Dark')).toBe('dark');
  });

  it('coerces roundness synonyms', () => {
    expect(coerceRoundnessStyle('square')).toBe('sharp');
    expect(coerceRoundnessStyle('circle')).toBe('pill');
    expect(coerceRoundnessStyle('round')).toBe('rounded');
  });
});

describe('coerceRadius', () => {
  it('turns numbers into px', () => {
    expect(coerceRadius(8)).toBe('8px');
  });
  it('normalizes css strings', () => {
    expect(coerceRadius('0.5rem')).toBe('0.5rem');
    expect(coerceRadius('9999px')).toBe('9999px');
  });
});

describe('coerceTypographyRef', () => {
  it('maps numeric weights to token refs', () => {
    expect(coerceTypographyRef(600, FONT_WEIGHT_REFS, 'fontWeight')).toBe(
      'palette.typography.fontWeight.semibold'
    );
  });
  it('throws on unknown', () => {
    expect(() => coerceTypographyRef('chunky', FONT_WEIGHT_REFS, 'fontWeight')).toThrow();
  });
});
