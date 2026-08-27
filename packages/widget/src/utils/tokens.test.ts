import { describe, expect, it } from 'vitest';
import { createTheme, themeToCssVariables } from './tokens';
import type { DeepPartial, PersonaTheme } from '../types/theme';

const vars = (override: DeepPartial<PersonaTheme>): Record<string, string> =>
  themeToCssVariables(createTheme(override, { validate: false }));

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

  it('leaves every composer surface var unset on the stock theme', () => {
    const css = vars({});

    for (const name of Object.keys(css)) {
      expect(name.startsWith('--persona-components-composer-modelPicker-')).toBe(false);
      expect(name.startsWith('--persona-components-composer-overflowMenu-')).toBe(false);
    }
  });

});
