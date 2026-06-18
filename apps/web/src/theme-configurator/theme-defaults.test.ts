import { describe, expect, test } from 'vitest';
import {
  colorFieldNeedsReset,
  getPackageDefaultForComponentsPath,
  pairedThemeColorPaths,
} from './theme-defaults';

describe('theme-defaults', () => {
  test('getPackageDefaultForComponentsPath resolves header tokens for theme and darkTheme paths', () => {
    // Defaults now use direct palette refs (solid primary role)
    expect(getPackageDefaultForComponentsPath('theme.components.header.actionIconForeground')).toBe(
      'palette.colors.primary.200'
    );
    expect(getPackageDefaultForComponentsPath('darkTheme.components.header.actionIconForeground')).toBe(
      'palette.colors.primary.200'
    );
    expect(getPackageDefaultForComponentsPath('theme.components.header.titleForeground')).toBe(
      'palette.colors.primary.50'
    );
  });

  test('pairedThemeColorPaths maps theme prefix to darkTheme', () => {
    expect(pairedThemeColorPaths('theme.components.header.background')).toEqual({
      light: 'theme.components.header.background',
      dark: 'darkTheme.components.header.background',
    });
    expect(pairedThemeColorPaths('launcher.title')).toBeNull();
  });

  test('colorFieldNeedsReset when light slot is a literal', () => {
    const def = 'palette.colors.primary.50';
    const get = (p: string) => (p === 'theme.components.header.titleForeground' ? '#ff0000' : undefined);
    expect(
      colorFieldNeedsReset(get, 'theme.components.header.titleForeground', def)
    ).toBe(true);
  });

  test('colorFieldNeedsReset when darkTheme slot diverges from default', () => {
    const def = 'palette.colors.primary.50';
    const get = (p: string) =>
      p === 'theme.components.header.titleForeground'
        ? def
        : p === 'darkTheme.components.header.titleForeground'
          ? '#aabbcc'
          : undefined;
    expect(colorFieldNeedsReset(get, 'theme.components.header.titleForeground', def)).toBe(true);
  });

  test('colorFieldNeedsReset is false when both slots match default ref', () => {
    const def = 'palette.colors.primary.50';
    const get = (p: string) =>
      p === 'theme.components.header.titleForeground' || p === 'darkTheme.components.header.titleForeground'
        ? def
        : undefined;
    expect(colorFieldNeedsReset(get, 'theme.components.header.titleForeground', def)).toBe(false);
  });

  test('colorFieldNeedsReset is false when both slots are undefined', () => {
    const get = () => undefined;
    expect(
      colorFieldNeedsReset(get, 'theme.components.header.titleForeground', 'palette.colors.primary.50')
    ).toBe(false);
  });
});
