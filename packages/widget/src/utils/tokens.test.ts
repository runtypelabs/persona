import { describe, expect, it } from 'vitest';
import {
  createTheme,
  resolveThemeDefaults,
  resolveThemeDefaultsVersion,
  themeToCssVariables,
} from './tokens';
import type { DeepPartial, PersonaTheme } from '../types/theme';

const vars = (override: DeepPartial<PersonaTheme>): Record<string, string> =>
  themeToCssVariables(createTheme(override, { validate: false }));

describe.each([{ v5Defaults: false }, { v5Defaults: true }])(
  'theme defaults ($v5Defaults)',
  ({ v5Defaults }) => {
    it('resolves an explicit overlay version while preserving explicit token precedence', () => {
      const future = { v5Defaults };
      expect(resolveThemeDefaultsVersion(future)).toBe(v5Defaults ? 'v5' : 'v4');
      expect(resolveThemeDefaults(future).palette.colors.gray[500]).toBe(
        v5Defaults ? '#737373' : '#6b7280'
      );

      const theme = createTheme(
        { palette: { colors: { gray: { 500: '#123456' } } } },
        { future, validate: false }
      );
      expect(theme.palette.colors.gray[500]).toBe('#123456');
    });

    it('materializes the selected version geometry defaults', () => {
      const css = themeToCssVariables(createTheme(undefined, { future: { v5Defaults }, validate: false }));
      expect(css['--persona-components-header-padding']).toBe(v5Defaults ? '8px 8px 8px 16px' : '20px 24px');
      expect(css['--persona-components-header-minimalPadding']).toBe(v5Defaults ? '8px 8px 8px 16px' : '16px 24px');
      expect(css['--persona-components-message-gap']).toBe(v5Defaults ? '20px' : '12px');
      expect(css['--persona-components-panel-width']).toBe(v5Defaults ? 'min(400px, calc(100vw - 24px))' : 'min(440px, calc(100vw - 24px))');
      expect(css['--persona-components-panel-height']).toBe(
        v5Defaults ? 'min(704px, calc(100dvh - 104px))' : 'min(640px, max(200px, calc(100vh - 64px)))'
      );
      expect(css['--persona-components-panel-modes-mobile-borderRadius']).toBe('0');
    });

    it('keeps explicit geometry and typography above the version overlay', () => {
      const css = themeToCssVariables(createTheme({ components: {
        message: { user: { padding: '4px', borderRadius: '7px' }, assistant: { borderWidth: '2px', lineHeight: '1.8' } },
        composer: { fontSize: '17px', controlSize: '36px' },
        input: { borderRadius: '9px' },
        header: { controlSize: '34px', iconScale: '0.75' },
      } }, { future: { v5Defaults }, validate: false }));
      expect(css['--persona-message-user-padding']).toBe('4px');
      expect(css['--persona-message-user-radius']).toBe('7px');
      expect(css['--persona-message-assistant-border-width']).toBe('2px');
      expect(css['--persona-message-assistant-line-height']).toBe('1.8');
      expect(css['--persona-composer-font-size']).toBe('17px');
      expect(css['--persona-composer-control-size']).toBe('36px');
      expect(css['--persona-input-radius']).toBe('9px');
    });

    it('uses an explicit shared turn gap in fullscreen unless separately overridden', () => {
      const shared = createTheme({ components: { message: { gap: '13px' } } }, { future: { v5Defaults }, validate: false });
      expect(shared.components.message.fullscreenGap).toBe('13px');
      const specific = createTheme({ components: { message: { gap: '13px', fullscreenGap: '31px' } } }, { future: { v5Defaults }, validate: false });
      expect(specific.components.message.fullscreenGap).toBe('31px');
    });

    it('keeps the transcript surface separate from the tinted user bubble', () => {
      const css = themeToCssVariables(createTheme(undefined, { future: { v5Defaults }, validate: false }));
      expect(css['--persona-container']).toBe(v5Defaults ? '#ffffff' : '#f9fafb');
      expect(css['--persona-message-user-bg']).toBe(v5Defaults ? '#f5f5f5' : '#171717');
    });

    it('keeps palette radius overrides connected to panel, user bubble, and composer', () => {
      const css = themeToCssVariables(createTheme({ palette: { radius: { lg: '3px', xl: '7px', '2xl': '11px', full: '99px' } } }, { future: { v5Defaults }, validate: false }));
      expect(css['--persona-panel-radius']).toBe('7px');
      expect(css['--persona-message-user-radius']).toBe(v5Defaults ? '7px' : '3px');
      expect(css['--persona-input-radius']).toBe(v5Defaults ? '99px' : '3px');
    });

    it('derives minimal header padding from an explicit shared padding unless overridden', () => {
      const shared = createTheme(
        { components: { header: { padding: '10px 12px' } } },
        { future: { v5Defaults }, validate: false }
      );
      expect(shared.components.header.minimalPadding).toBe('10px 12px');

      const specific = createTheme(
        { components: { header: { padding: '10px 12px', minimalPadding: '8px 10px' } } },
        { future: { v5Defaults }, validate: false }
      );
      expect(specific.components.header.minimalPadding).toBe('8px 10px');
    });

    it('emits prefixed collapsible-widget chrome aliases and legacy aliases', () => {
      const css = themeToCssVariables(createTheme(undefined, { future: { v5Defaults }, validate: false }));

      expect(css['--persona-cw-container']).toBe(v5Defaults ? '#fafafa' : '#f9fafb');
      expect(css['--persona-cw-surface']).toBe(v5Defaults ? '#ffffff' : '#f9fafb');
      expect(css['--persona-cw-border']).toBe(v5Defaults ? '#e5e5e5' : '#e5e7eb');
      expect(css['--cw-container']).toBe(css['--persona-cw-container']);
      expect(css['--cw-surface']).toBe(css['--persona-cw-surface']);
      expect(css['--cw-border']).toBe(css['--persona-cw-border']);
    });

    it('applies explicit collapsible-widget tokens to both alias families', () => {
      const css = themeToCssVariables(
        createTheme(
          {
            components: {
              collapsibleWidget: {
                container: '#123456',
                surface: '#234567',
                border: '#345678',
              },
            },
          },
          { future: { v5Defaults }, validate: false }
        )
      );

      expect(css['--persona-cw-container']).toBe('#123456');
      expect(css['--persona-cw-surface']).toBe('#234567');
      expect(css['--persona-cw-border']).toBe('#345678');
      expect(css['--cw-container']).toBe('#123456');
      expect(css['--cw-surface']).toBe('#234567');
      expect(css['--cw-border']).toBe('#345678');
    });
  }
);

const flatSurface = (surface: string): DeepPartial<PersonaTheme> => ({
  semantic: { colors: { surface, background: surface, container: surface } },
});

describe('interactive-state defaults', () => {
  it('gives a flat dark theme white-alpha hover/active washes', () => {
    const css = vars(flatSurface('#0e111b'));

    expect(css['--persona-icon-btn-hover-bg']).toBe('rgba(255, 255, 255, 0.08)');
    expect(css['--persona-icon-btn-active-bg']).toBe('rgba(255, 255, 255, 0.12)');
    expect(css['--persona-icon-btn-active-border']).toBe('rgba(255, 255, 255, 0.16)');
    expect(css['--persona-label-btn-hover-bg']).toBe('rgba(255, 255, 255, 0.08)');
    expect(css['--persona-artifact-tab-hover-bg']).toBe('rgba(255, 255, 255, 0.08)');
    expect(css['--persona-artifact-card-hover-bg']).toBe('rgba(255, 255, 255, 0.08)');
  });

  it('treats pure black and rgb() dark surfaces as dark', () => {
    expect(vars(flatSurface('#000000'))['--persona-icon-btn-hover-bg']).toBe(
      'rgba(255, 255, 255, 0.08)'
    );
    expect(vars(flatSurface('#000'))['--persona-icon-btn-hover-bg']).toBe(
      'rgba(255, 255, 255, 0.08)'
    );
    expect(vars(flatSurface('rgb(14, 17, 27)'))['--persona-icon-btn-hover-bg']).toBe(
      'rgba(255, 255, 255, 0.08)'
    );
    expect(vars(flatSurface('rgba(14, 17, 27, 1)'))['--persona-icon-btn-hover-bg']).toBe(
      'rgba(255, 255, 255, 0.08)'
    );
  });

  it('falls back to background when surface and container resolve to nothing', () => {
    const theme = createTheme(flatSurface('#0e111b'), { validate: false });
    // Strip the semantic keys and the palette shades their aliases fall back to.
    const semanticColors = theme.semantic.colors as unknown as Record<string, unknown>;
    delete semanticColors.surface;
    delete semanticColors.container;
    delete (theme.palette.colors.gray as Record<string, unknown>)['50'];
    delete (theme.palette.colors.gray as Record<string, unknown>)['100'];
    const css = themeToCssVariables(theme);

    expect(css['--persona-surface']).toBeUndefined();
    expect(css['--persona-background']).toBe('#0e111b');
    expect(css['--persona-icon-btn-hover-bg']).toBe('rgba(255, 255, 255, 0.08)');
  });

  it('keeps the gray washes on a flat light theme', () => {
    const css = vars(flatSurface('#ffffff'));

    expect(css['--persona-icon-btn-hover-bg']).toBe('#f3f4f6');
    expect(css['--persona-icon-btn-active-bg']).toBe('#e5e7eb');
    expect(css['--persona-icon-btn-active-border']).toBe('#d1d5db');
    expect(css['--persona-label-btn-hover-bg']).toBe('#f3f4f6');
  });

  it('keeps the gray washes when the surface color cannot be parsed', () => {
    const css = vars(flatSurface('var(--host-surface)'));

    expect(css['--persona-icon-btn-hover-bg']).toBe('#f3f4f6');
    expect(css['--persona-icon-btn-active-bg']).toBe('#e5e7eb');
    expect(css['--persona-icon-btn-active-border']).toBe('#d1d5db');
  });

  it('anchors a non-flat dark theme on the container, unchanged', () => {
    const css = vars({
      semantic: { colors: { surface: '#0e111b', background: '#0e111b', container: '#1b2130' } },
    });

    expect(css['--persona-icon-btn-hover-bg']).toBe('#1b2130');
    expect(css['--persona-icon-btn-active-bg']).toBe('#1b2130');
    expect(css['--persona-icon-btn-active-border']).toBeUndefined();
  });

  it('lets explicit icon-button config win on a flat dark theme', () => {
    const css = vars({
      ...flatSurface('#0e111b'),
      components: {
        iconButton: {
          hoverBackground: '#ff00ff',
          activeBackground: '#00ff00',
          activeBorder: '#0000ff',
        },
      },
    });

    expect(css['--persona-icon-btn-hover-bg']).toBe('#ff00ff');
    expect(css['--persona-icon-btn-active-bg']).toBe('#00ff00');
    expect(css['--persona-icon-btn-active-border']).toBe('#0000ff');
  });
});

/**
 * `components.composer.modelPicker.*` and `.overflowMenu.*` carry no short
 * aliases (they would cost gzip in the launcher bundle, which draws no
 * composer), so the emitted contract is the full path. The rules that read
 * them are covered in styles/widget-styles.test.ts.
 */
describe('composer surface tokens', () => {
  it('emits the model picker closed-control vars as full paths', () => {
    const css = vars({
      components: {
        composer: {
          modelPicker: {
            background: '#303030',
            hoverBackground: '#3f3f3f',
            borderColor: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '9999px',
            labelColor: '#c4c7c5',
          },
        },
      },
    });

    expect(css['--persona-components-composer-modelPicker-background']).toBe('#303030');
    expect(css['--persona-components-composer-modelPicker-hoverBackground']).toBe('#3f3f3f');
    expect(css['--persona-components-composer-modelPicker-borderColor']).toBe(
      'rgba(255, 255, 255, 0.08)'
    );
    expect(css['--persona-components-composer-modelPicker-borderRadius']).toBe('9999px');
    expect(css['--persona-components-composer-modelPicker-labelColor']).toBe('#c4c7c5');
  });

  it('resolves a token reference on a model picker surface key', () => {
    const css = vars({
      components: {
        composer: { modelPicker: { background: 'palette.colors.gray.800' } },
      },
    });

    expect(css['--persona-components-composer-modelPicker-background']).toBe('#1f2937');
  });

  it('emits the overflow menu panel vars as full paths', () => {
    const css = vars({
      components: {
        composer: {
          overflowMenu: {
            background: '#353535',
            borderColor: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            foreground: '#ececec',
            shadow: 'none',
          },
        },
      },
    });

    expect(css['--persona-components-composer-overflowMenu-background']).toBe('#353535');
    expect(css['--persona-components-composer-overflowMenu-borderColor']).toBe(
      'rgba(255, 255, 255, 0.08)'
    );
    expect(css['--persona-components-composer-overflowMenu-borderRadius']).toBe('12px');
    expect(css['--persona-components-composer-overflowMenu-foreground']).toBe('#ececec');
    expect(css['--persona-components-composer-overflowMenu-shadow']).toBe('none');
  });

  it('emits extended overflow row and panel tokens, resolving palette references', () => {
    const menu = {
      padding: '8px', rowGap: '4px', rowPadding: '10px 12px', rowBorderRadius: 'palette.radius.md',
      fontSize: '14px', lineHeight: '1.5', iconSize: '20px', iconGap: '12px',
      hoverBackground: 'palette.colors.gray.800', focusBackground: '#ddd',
      descriptionColor: '#666', descriptionFontSize: '12px', dividerColor: '#ccc',
      dividerSpacing: '8px 0', minWidth: '220px', maxHeight: '480px',
    };
    const css = vars({ components: { composer: { overflowMenu: menu } } });
    for (const [key, value] of Object.entries(menu)) {
      const expected = key === 'rowBorderRadius' ? '0.375rem' : key === 'hoverBackground' ? '#1f2937' : value;
      expect(css[`--persona-components-composer-overflowMenu-${key}`]).toBe(expected);
    }
  });

  it('leaves every composer surface var unset on the stock theme', () => {
    const css = vars({});

    for (const name of Object.keys(css)) {
      expect(name.startsWith('--persona-components-composer-modelPicker-')).toBe(false);
      expect(name.startsWith('--persona-components-composer-overflowMenu-')).toBe(false);
    }
  });

});
