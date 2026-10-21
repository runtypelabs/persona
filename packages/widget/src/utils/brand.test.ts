import { describe, expect, it } from 'vitest';
import { deriveBrandTheme, inferBrandColorScheme } from './brand';
import { getActiveTheme, getColorScheme, getCssVariables } from './theme';

describe('brand derivation', () => {
  it.each(['light', 'dark'] as const)('separates V5 identity, bubble, and action colors in %s mode', (colorScheme) => {
    const config = { colorScheme, future: { v5Defaults: true }, brand: { accent: '#7c3aed' } };
    const vars = getCssVariables(getActiveTheme(config));
    expect(vars['--persona-button-primary-bg']).toBe('#7c3aed');
    expect(vars['--persona-header-icon-bg']).toBe('transparent');
    expect(vars['--persona-components-header-iconPadding']).toBe('0px');
    expect(vars['--persona-header-bg']).toBe(vars['--persona-container']);
    expect(vars['--persona-message-user-bg']).toBe('color-mix(in srgb, var(--persona-primary) 12%, var(--persona-container))');
    expect(vars['--persona-message-user-text']).toBe(vars['--persona-text']);
    const custom = getCssVariables(getActiveTheme({ ...config, theme: { components: {
      header: { iconBackground: '#123456' }, message: { user: { background: '#abcdef', text: '#123456' } },
    } } }));
    expect(custom['--persona-header-icon-bg']).toBe('#123456');
    expect(custom['--persona-components-header-iconPadding']).toBe('6px');
    expect(custom['--persona-message-user-bg']).toBe('#abcdef');
    expect(custom['--persona-message-user-text']).toBe('#123456');
    const v4 = getCssVariables(getActiveTheme({ ...config, future: { v5Defaults: false } }));
    expect(v4['--persona-header-icon-bg']).toBe('#7c3aed');
    expect(v4['--persona-message-user-bg']).toBe('#7c3aed');
  });
  for (const v5Defaults of [false, true]) {
    it(`preserves defaults and explicit token precedence (${v5Defaults})`, () => {
      const future = { v5Defaults };
      expect(getActiveTheme({ future, brand: {} })).toEqual(getActiveTheme({ future }));
      const theme = getActiveTheme({ future, brand: { accent: '#f00', font: 'Brand' }, theme: { semantic: { typography: { fontFamily: 'Explicit' } } }, darkTheme: { semantic: { typography: { fontFamily: 'Dark' } } }, colorScheme: 'dark' });
      expect(theme.semantic.typography.fontFamily).toBe('Dark');
      expect(theme.palette.colors.primary[500]).toBe('#ff0000');
    });
    it(`derives all six fields (${v5Defaults})`, () => {
      const vars = getCssVariables(getActiveTheme({ future: { v5Defaults }, brand: { accent: '#123456', neutral: '#161b22', font: 'Brand, sans-serif', radius: 'sm', density: 'compact', elevation: 'flat' } }));
      expect(vars['--persona-primary']).toBe('#123456');
      expect(vars['--persona-surface']).toBe('#161b22');
      expect(vars['--persona-font-family']).toBe('Brand, sans-serif');
      expect(vars['--persona-font-size']).toBe('13px');
      expect(vars['--persona-components-header-minHeight']).toBe('44px');
      expect(vars['--persona-panel-shadow']).toBe('none');
    });
  }
  it.each(['#000', '#fff', '#ff0000', '#ffff00', '#777777', 'rgb(20 30 40)', 'rgba(20,30,40,1)'])('chooses readable foreground for %s', (accent) => {
    const t = deriveBrandTheme({ accent });
    const color = t.palette?.colors?.primary?.[500]!;
    const channels = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    const l = channels.reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
    const white = t.components?.button?.primary?.foreground === '#ffffff';
    expect(white ? 1.05 / (l + .05) : (l + .05) / .05).toBeGreaterThanOrEqual(4.5);
  });
  it.each(['garbage', '#zzzzzz', '#12', 'rgb(300,0,0)', 'rgba(0,0,0,.5)', 'rgb(1x 2 3)'])('ignores malformed or transparent color %s', (color) => {
    expect(deriveBrandTheme({ accent: color, neutral: color })).toEqual({});
    expect(inferBrandColorScheme({ neutral: color })).toBeUndefined();
  });
  it('infers neutral scheme only when the color scheme is omitted', () => {
    expect(getColorScheme({ brand: { neutral: '#111111' } })).toBe('dark');
    expect(getColorScheme({ brand: { neutral: '#111111' }, colorScheme: 'light' })).toBe('light');
    expect(getColorScheme({ brand: { neutral: '#ffffff' }, colorScheme: 'dark' })).toBe('dark');
  });
  it.each([['compact', '13px', '44px'], ['comfortable', '14px', '48px'], ['spacious', '15px', '52px']] as const)('maps %s density', (density, size, height) => {
    const theme = deriveBrandTheme({ density });
    expect(theme.semantic?.typography?.fontSize).toBe(size);
    expect(theme.components?.header?.minHeight).toBe(height);
  });
  it.each([['none', '0px'], ['sm', '4px'], ['md', '8px'], ['lg', '16px']] as const)('maps %s radius while preserving circles', (radius, value) => {
    const theme = deriveBrandTheme({ radius });
    expect(theme.palette?.radius?.xl).toBe(value);
    expect(theme.palette?.radius?.full).toBeUndefined();
  });
  it.each(['flat', 'subtle', 'raised'] as const)('pairs %s elevation shadows and borders', (elevation) => {
    const theme = deriveBrandTheme({ elevation });
    expect(theme.components?.panel?.modes?.floating?.border).toContain('var(--persona-border)');
    expect(theme.components?.panel?.shadow).toBe(theme.palette?.shadows?.xl);
  });
  describe.each(['light', 'dark'] as const)('%s message presentation', (colorScheme) => {
    const elevations = [
      ['flat', 'none'],
      ['subtle', '0 2px 8px rgba(0, 0, 0, 0.08)'],
      ['raised', '0 12px 32px rgba(0, 0, 0, 0.18)'],
    ] as const;
    it.each(elevations)('keeps V5 prose plain with %s elevation at every density', (elevation, shadow) => {
      for (const density of ['compact', 'comfortable', 'spacious'] as const) {
        const config = { colorScheme, future: { v5Defaults: true }, brand: { elevation, density } };
        const vars = getCssVariables(getActiveTheme(config));
        expect(vars['--persona-message-assistant-shadow']).toBe('none');
        expect(vars['--persona-message-assistant-border']).toBe('transparent');
        expect(vars['--persona-message-assistant-padding']).toBe('0px');
        // These existing surfaces still follow elevation; this is not a global
        // rule that every default of `none` must opt out of brand styling.
        expect(vars['--persona-message-user-shadow']).toBe(shadow);
        expect(getActiveTheme(config).components.introCard?.shadow).toBe(shadow);
        const v4 = getCssVariables(getActiveTheme({ ...config, future: { v5Defaults: false } }));
        expect(v4['--persona-message-assistant-shadow']).toBe(shadow);
        expect(v4['--persona-message-assistant-border']).not.toBe('transparent');
      }
    });
    it.each(elevations)('lets custom padded bubbles follow %s elevation', (elevation, shadow) => {
      for (const [density, padding] of [['compact', '8px'], ['comfortable', '12px'], ['spacious', '16px']] as const) {
        const theme = { components: { message: { assistant: {
          background: 'semantic.colors.container', padding, borderRadius: '12px',
          border: 'semantic.colors.border', borderWidth: '1px', shadow: 'palette.shadows.sm',
        } } } };
        // Shared overrides and dark-only overrides both remain authoritative.
        for (const overrides of colorScheme === 'dark' ? [{ theme }, { darkTheme: theme }] : [{ theme }]) {
          const vars = getCssVariables(getActiveTheme({
            colorScheme, future: { v5Defaults: true }, brand: { elevation, density }, ...overrides,
          }));
          expect(vars['--persona-message-assistant-shadow']).toBe(shadow);
          expect(vars['--persona-message-assistant-padding']).toBe(padding);
          expect(vars['--persona-message-assistant-border']).not.toBe('transparent');
          expect(vars['--persona-message-assistant-border-width']).toBe('1px');
        }
      }
    });
    it('preserves explicit assistant shadows and borders over brand elevation', () => {
      const vars = getCssVariables(getActiveTheme({
        colorScheme, future: { v5Defaults: true }, brand: { elevation: 'raised' },
        theme: { components: { message: { assistant: { shadow: '0 1px 2px red', border: '#123456' } } } },
        ...(colorScheme === 'dark' ? { darkTheme: { components: { message: { assistant: { shadow: 'none', border: '#abcdef' } } } } } : {}),
      }));
      expect(vars['--persona-message-assistant-shadow']).toBe(colorScheme === 'dark' ? 'none' : '0 1px 2px red');
      expect(vars['--persona-message-assistant-border']).toBe(colorScheme === 'dark' ? '#abcdef' : '#123456');
    });
  });
  it.each([false, true])('keeps neutral-derived surfaces and elevation coherent (%s)', (v5Defaults) => {
    const theme = getActiveTheme({ future: { v5Defaults }, brand: { neutral: '#161b22', radius: 'none', elevation: 'flat' } });
    const vars = getCssVariables(theme);
    expect(vars['--persona-input-radius']).toBe('0px');
    expect(vars['--persona-components-approval-requested-shadow']).toBe('none');
    expect(vars['--persona-components-suggestion-card-shadow']).toBe('none');
    expect(theme.palette.colors.gray[50]).toBe('#161b22');
    expect(theme.palette.colors.gray[900]).not.toBe('#111827');
    expect(theme.components.markdown?.inlineCode?.background).toMatch(/^palette.colors.gray.(50|100)$/);
  });
  it.each([['#ffff00', '#ffffff'], ['#111111', '#111111'], ['#ff0000', '#161b22']])('keeps accent links readable on neutral %s / %s', (accent, neutral) => {
    const theme = deriveBrandTheme({ accent, neutral }, inferBrandColorScheme({ neutral }));
    const lightness = (color: string) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
    const a = lightness(theme.components?.markdown?.link?.foreground!);
    const b = lightness(theme.semantic?.colors?.surface!);
    expect((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toBeGreaterThanOrEqual(4.5);
  });
  it('builds monotonic tint and shade ramps from an exact accent', () => {
    const colors = deriveBrandTheme({ accent: '#6478a0' }).palette?.colors?.primary;
    expect(colors?.[500]).toBe('#6478a0');
    const values = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((stop) => parseInt(colors?.[stop]?.slice(1, 3) ?? '', 16));
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });
});
