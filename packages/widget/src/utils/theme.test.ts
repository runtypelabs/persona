// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  applyThemeVariables,
  createDarkTheme,
  createLightTheme,
  createTheme,
  getActiveTheme,
  themeToCssVariables,
} from './theme';

describe('theme utils', () => {
  it.each(['transparent', '#fff0', '#ffffff00', 'rgba(1, 2, 3, 0)', 'rgb(1 2 3 / 0%)'])('leaves transparent V5 header icons unpadded: %s', (iconBackground) => {
    const variables = themeToCssVariables(getActiveTheme({ future: { v5Defaults: true }, theme: { components: { header: { iconBackground } } } }));
    expect(variables['--persona-components-header-iconPadding']).toBe('0px');
  });
  it.each(['#b9a68a', 'rgb(255, 0, 0)', 'palette.colors.primary.500'])('pads filled V5 header icons: %s', (iconBackground) => {
    const variables = themeToCssVariables(getActiveTheme({ future: { v5Defaults: true }, theme: { components: { header: { iconBackground } } } }));
    expect(variables['--persona-components-header-iconPadding']).toBe('6px');
  });
  it('resolves header padding from brands and the active dark override', () => {
    const config = { future: { v5Defaults: true }, brand: { accent: '#b9a68a' }, colorScheme: 'dark' as const };
    expect(themeToCssVariables(getActiveTheme(config))['--persona-components-header-iconPadding']).toBe('0px');
    expect(themeToCssVariables(getActiveTheme({ ...config, darkTheme: { components: { header: { iconBackground: 'semantic.colors.primary' } } } }))['--persona-components-header-iconPadding']).toBe('6px');
  });
  it.each([false, true])('honors explicit icon padding and preserves legacy defaults (v5=%s)', (v5Defaults) => {
    const future = { v5Defaults };
    expect(themeToCssVariables(getActiveTheme({ future }))['--persona-components-header-iconPadding']).toBe(v5Defaults ? '0px' : undefined);
    for (const iconPadding of ['0', '4px', '2px 8px']) {
      const variables = themeToCssVariables(getActiveTheme({ future, theme: { components: { header: { iconBackground: '#b9a68a', iconPadding } } } }));
      expect(variables['--persona-components-header-iconPadding']).toBe(iconPadding);
    }
  });
  afterEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('uses darkTheme overrides when dark mode is active', () => {
    const lightAndDarkThemeConfig = {
      colorScheme: 'dark' as const,
      theme: {
        palette: {
          colors: {
            primary: { 500: '#111111' },
          },
        },
      },
      darkTheme: {
        palette: {
          colors: {
            primary: { 500: '#22c55e' },
          },
        },
      },
    };

    const activeTheme = getActiveTheme(lightAndDarkThemeConfig);
    const cssVars = themeToCssVariables(activeTheme);

    expect(cssVars['--persona-palette-colors-primary-500']).toBe('#22c55e');
  });

  it('uses darkTheme overrides after auto-detecting dark mode', () => {
    document.documentElement.classList.add('dark');

    const lightAndDarkThemeConfig = {
      colorScheme: 'auto' as const,
      theme: {
        palette: {
          colors: {
            primary: { 500: '#111111' },
          },
        },
      },
      darkTheme: {
        palette: {
          colors: {
            primary: { 500: '#22c55e' },
          },
        },
      },
    };

    const activeTheme = getActiveTheme(lightAndDarkThemeConfig);
    const cssVars = themeToCssVariables(activeTheme);

    expect(cssVars['--persona-palette-colors-primary-500']).toBe('#22c55e');
  });

  it('preserves user radius and typography palette overrides in dark mode', () => {
    // Regression: createDarkTheme() used to spread a pre-built default palette
    // over the merged user config, which kept only `colors` and silently
    // dropped radius/typography overrides that light mode honored.
    const themeConfig = {
      colorScheme: 'dark' as const,
      theme: {
        palette: {
          radius: { xl: '4px' },
          typography: { fontFamily: { sans: 'Georgia, serif' } },
        },
      },
    };

    const activeTheme = getActiveTheme(themeConfig);
    const cssVars = themeToCssVariables(activeTheme);

    // User non-color palette overrides survive the dark rebuild…
    expect(cssVars['--persona-palette-radius-xl']).toBe('4px');
    expect(cssVars['--persona-palette-typography-fontFamily-sans']).toBe('Georgia, serif');
    // …untouched radius steps still resolve from the defaults…
    expect(cssVars['--persona-palette-radius-full']).toBe('9999px');
    // …and the dark color palette still applies underneath.
    expect(cssVars['--persona-palette-colors-primary-500']).toBe('#171717');
  });

  it('maps radius tokens into the legacy widget radius aliases', () => {
    const theme = createTheme({
      palette: {
        radius: {
          none: '0px',
          sm: '2px',
          md: '6px',
          lg: '10px',
          xl: '18px',
          full: '9999px',
        },
      },
      components: {
        panel: {
          borderRadius: 'palette.radius.xl',
        },
        input: {
          borderRadius: 'palette.radius.md',
        },
        launcher: {
          borderRadius: 'palette.radius.full',
        },
        button: {
          primary: {
            borderRadius: 'palette.radius.md',
          },
        },
        message: {
          user: {
            borderRadius: 'palette.radius.sm',
          },
          assistant: {
            borderRadius: 'palette.radius.lg',
          },
        },
      },
    } as any);

    const cssVars = themeToCssVariables(theme);

    expect(cssVars['--persona-radius-sm']).toBe('2px');
    expect(cssVars['--persona-radius-md']).toBe('6px');
    expect(cssVars['--persona-radius-lg']).toBe('10px');
    expect(cssVars['--persona-panel-radius']).toBe('18px');
    expect(cssVars['--persona-input-radius']).toBe('6px');
    expect(cssVars['--persona-message-user-radius']).toBe('2px');
    expect(cssVars['--persona-message-assistant-radius']).toBe('10px');
    expect(cssVars['--persona-launcher-radius']).toBe('9999px');
    expect(cssVars['--persona-button-radius']).toBe('6px');
  });

  it('emits history motion vars with ms appended to bare durations', () => {
    const cssVars = themeToCssVariables(
      createTheme({
        components: {
          history: {
            motion: {
              enterDurationMs: 320,
              enterEasing: 'ease-out',
              exitDurationMs: 0,
              exitEasing: 'linear',
            },
          },
        },
      } as any)
    );
    expect(cssVars['--persona-history-enter-ms']).toBe('320ms');
    expect(cssVars['--persona-history-enter-easing']).toBe('ease-out');
    expect(cssVars['--persona-history-exit-ms']).toBe('0ms');
    expect(cssVars['--persona-history-exit-easing']).toBe('linear');

    // Unset motion emits nothing: the chunk's fallbacks stay in charge.
    const bare = themeToCssVariables(createTheme({} as any));
    expect(bare['--persona-history-enter-ms']).toBeUndefined();
    expect(bare['--persona-history-exit-easing']).toBeUndefined();
  });

  it('keys launcher pill vars to shared tokens by default and launcher tokens when customized', () => {
    const defaults = themeToCssVariables(createTheme());
    expect(defaults['--persona-launcher-bg']).toBe(defaults['--persona-surface']);
    expect(defaults['--persona-launcher-fg']).toBe(defaults['--persona-primary']);
    expect(defaults['--persona-launcher-fg-muted']).toBe(defaults['--persona-muted']);
    expect(defaults['--persona-launcher-border']).toBe(defaults['--persona-border']);

    const custom = themeToCssVariables(
      createTheme({
        components: {
          launcher: {
            background: '#1e293b',
            foreground: '#f8fafc',
            border: '#334155',
          },
        },
      } as any)
    );
    expect(custom['--persona-launcher-bg']).toBe('#1e293b');
    expect(custom['--persona-launcher-fg']).toBe('#f8fafc');
    expect(custom['--persona-launcher-fg-muted']).toBe(
      'color-mix(in srgb, #f8fafc 70%, transparent)'
    );
    expect(custom['--persona-launcher-border']).toBe('#334155');
    // Launcher tokens must not leak into the shared tokens the panel reads.
    expect(custom['--persona-surface']).toBe(defaults['--persona-surface']);
    expect(custom['--persona-primary']).toBe(defaults['--persona-primary']);
  });

  it('zeroes horizontal intro-card padding when the card resolves flat', () => {
    const cssVars = themeToCssVariables(createTheme({} as any));
    expect(cssVars['--persona-intro-card-padding']).toBe('1.5rem 0');
  });

  it('keeps full intro-card padding when a background or shadow makes it a card', () => {
    const withBackground = themeToCssVariables(
      createTheme({
        components: { introCard: { background: '#ffffff' } },
      } as any)
    );
    expect(withBackground['--persona-intro-card-padding']).toBe('1.5rem');

    const withShadow = themeToCssVariables(
      createTheme({
        components: { introCard: { shadow: '0 1px 2px rgba(0,0,0,0.1)' } },
      } as any)
    );
    expect(withShadow['--persona-intro-card-padding']).toBe('1.5rem');
  });

  it('lets an explicit intro-card padding token win over the flat default', () => {
    const cssVars = themeToCssVariables(
      createTheme({
        components: { introCard: { padding: '2rem' } },
      } as any)
    );
    expect(cssVars['--persona-intro-card-padding']).toBe('2rem');
  });

  it.each([
    {
      role: 'surface',
      sentinel: '#010203',
      consumers: [
        '--persona-components-input-background',
        '--persona-input-background',
      ],
    },
    {
      role: 'container',
      sentinel: '#0a0b0c',
      consumers: [
        '--persona-components-message-assistant-background',
        '--persona-message-assistant-bg',
      ],
    },
    {
      role: 'textMuted',
      sentinel: '#0d0e0f',
      consumers: [
        '--persona-components-input-placeholder',
        '--persona-input-placeholder',
      ],
    },
    {
      role: 'text',
      sentinel: '#121314',
      consumers: [
        '--persona-components-message-assistant-text',
        '--persona-message-assistant-text',
      ],
    },
    {
      role: 'border',
      sentinel: '#232425',
      consumers: [
        '--persona-components-message-assistant-border',
        '--persona-message-assistant-border',
      ],
    },
  ])(
    'cascades semantic.colors.$role to its default input and assistant consumers',
    ({ role, sentinel, consumers }) => {
      const theme = createTheme({
        semantic: {
          colors: {
            [role]: sentinel,
          },
        },
      } as any);
      const cssVars = themeToCssVariables(theme);

      for (const consumer of consumers) {
        expect(cssVars[consumer]).toBe(sentinel);
      }
    }
  );

  it('keeps explicit input and assistant component colors above semantic defaults', () => {
    const theme = createTheme({
      semantic: {
        colors: {
          surface: '#010203',
          container: '#0a0b0c',
          text: '#121314',
          border: '#232425',
        },
      },
      components: {
        input: {
          background: '#343536',
          placeholder: '#3a3b3c',
        },
        message: {
          assistant: {
            background: '#454647',
            text: '#565758',
            border: '#676869',
          },
        },
      },
    } as any);
    const cssVars = themeToCssVariables(theme);

    expect(cssVars['--persona-input-background']).toBe('#343536');
    expect(cssVars['--persona-input-placeholder']).toBe('#3a3b3c');
    expect(cssVars['--persona-message-assistant-bg']).toBe('#454647');
    expect(cssVars['--persona-message-assistant-text']).toBe('#565758');
    expect(cssVars['--persona-message-assistant-border']).toBe('#676869');
  });

  it('maps markdown link and optional heading tokens to consumer CSS vars', () => {
    const theme = createTheme({
      components: {
        markdown: {
          link: {
            foreground: '#60a5fa',
          },
          prose: {
            fontFamily: 'Georgia, serif',
          },
          heading: {
            h1: { fontSize: '1.375rem', fontWeight: '650' },
            h2: { fontSize: '1.125rem', fontWeight: '600' },
          },
        },
      },
    } as any);

    const cssVars = themeToCssVariables(theme);

    expect(cssVars['--persona-md-link-color']).toBe('#60a5fa');
    expect(cssVars['--persona-md-h1-size']).toBe('1.375rem');
    expect(cssVars['--persona-md-h1-weight']).toBe('650');
    expect(cssVars['--persona-md-h2-size']).toBe('1.125rem');
    expect(cssVars['--persona-md-h2-weight']).toBe('600');
    expect(cssVars['--persona-md-prose-font-family']).toBe('Georgia, serif');
  });

  it('maps header chrome tokens to dedicated CSS variables with palette refs', () => {
    const theme = createTheme();
    const cssVars = themeToCssVariables(theme);

    // Default header uses solid primary role: icon-bg=primary.600, icon-fg=primary.50, etc.
    expect(cssVars['--persona-header-icon-bg']).toBe('#0f0f0f'); // primary.600
    expect(cssVars['--persona-header-icon-fg']).toBe('#ffffff'); // primary.50
    expect(cssVars['--persona-header-title-fg']).toBe('#ffffff'); // primary.50, via header.foreground
    // Subtitle and action icons now derive from the background/foreground
    // pair; the mix replaces the primary.200 they used to name directly.
    expect(cssVars['--persona-header-subtitle-fg']).toBe(
      'color-mix(in srgb, #ffffff 72%, #171717)'
    );
    expect(cssVars['--persona-header-action-icon-fg']).toBe(
      'color-mix(in srgb, #ffffff 72%, #171717)'
    );

    const custom = createTheme({
      components: {
        header: {
          iconBackground: 'palette.colors.accent.500',
          iconForeground: 'palette.colors.gray.900',
          titleForeground: 'palette.colors.secondary.500',
          subtitleForeground: 'palette.colors.gray.500',
          actionIconForeground: 'palette.colors.gray.400',
        },
      },
    } as any);
    const customVars = themeToCssVariables(custom);
    expect(customVars['--persona-header-icon-bg']).toBe('#06b6d4');
    expect(customVars['--persona-header-icon-fg']).toBe('#111827');
    expect(customVars['--persona-header-title-fg']).toBe('#8b5cf6');
    expect(customVars['--persona-header-subtitle-fg']).toBe('#6b7280');
    expect(customVars['--persona-header-action-icon-fg']).toBe('#9ca3af');
  });

  it('renders the same default header chrome in light and dark schemes', () => {
    // Golden values for the shipped header band. The dark preset overrides no
    // header token, so both schemes must resolve identically.
    const expected = {
      '--persona-header-bg': '#171717', // primary.500
      '--persona-header-border': 'color-mix(in srgb, #ffffff 14%, #171717)',
      '--persona-header-title-fg': '#ffffff', // primary.50
      '--persona-header-subtitle-fg': 'color-mix(in srgb, #ffffff 72%, #171717)',
      '--persona-header-action-icon-fg': 'color-mix(in srgb, #ffffff 72%, #171717)',
      '--persona-header-icon-bg': '#0f0f0f', // primary.600
      '--persona-header-icon-fg': '#ffffff', // primary.50
    };

    const light = themeToCssVariables(createLightTheme());
    const dark = themeToCssVariables(createDarkTheme());

    for (const [key, value] of Object.entries(expected)) {
      expect(light[key]).toBe(value);
      expect(dark[key]).toBe(value);
    }
  });

  it('derives header text and border from the background/foreground pair', () => {
    const cssVars = themeToCssVariables(
      createTheme({
        components: {
          header: { background: '#0b3d2e', foreground: '#f4f3ee' },
        },
      } as any)
    );

    expect(cssVars['--persona-header-bg']).toBe('#0b3d2e');
    expect(cssVars['--persona-header-title-fg']).toBe('#f4f3ee');
    expect(cssVars['--persona-header-subtitle-fg']).toBe(
      'color-mix(in srgb, #f4f3ee 72%, #0b3d2e)'
    );
    expect(cssVars['--persona-header-action-icon-fg']).toBe(
      'color-mix(in srgb, #f4f3ee 72%, #0b3d2e)'
    );
    expect(cssVars['--persona-header-border']).toBe(
      'color-mix(in srgb, #f4f3ee 14%, #0b3d2e)'
    );
  });

  it('lets explicit header keys win over the foreground derivation', () => {
    const cssVars = themeToCssVariables(
      createTheme({
        components: {
          header: {
            background: '#0b3d2e',
            foreground: '#f4f3ee',
            border: '#1f5c48',
            titleForeground: '#ffe066',
            actionIconForeground: '#cfd8cc',
            subtitle: { color: '#b9c8bc' },
          },
        },
      } as any)
    );

    expect(cssVars['--persona-header-border']).toBe('#1f5c48');
    expect(cssVars['--persona-header-title-fg']).toBe('#ffe066');
    expect(cssVars['--persona-header-action-icon-fg']).toBe('#cfd8cc');
    expect(cssVars['--persona-header-subtitle-fg']).toBe('#b9c8bc');
  });

  it('ranks header title color as title.color, then titleForeground, then foreground', () => {
    const base = { background: '#0b3d2e', foreground: '#f4f3ee' };

    const fromForeground = themeToCssVariables(
      createTheme({ components: { header: base } } as any)
    );
    const fromAlias = themeToCssVariables(
      createTheme({
        components: { header: { ...base, titleForeground: '#ffe066' } },
      } as any)
    );
    const fromTitleColor = themeToCssVariables(
      createTheme({
        components: {
          header: { ...base, titleForeground: '#ffe066', title: { color: '#8b5cf6' } },
        },
      } as any)
    );

    expect(fromForeground['--persona-header-title-fg']).toBe('#f4f3ee');
    expect(fromAlias['--persona-header-title-fg']).toBe('#ffe066');
    expect(fromTitleColor['--persona-header-title-fg']).toBe('#8b5cf6');
  });

  it('emits the shared header control box, glyph, and stroke tokens', () => {
    const defaults = themeToCssVariables(createTheme());

    expect(defaults['--persona-header-control-size']).toBe('32px');
    expect(defaults['--persona-header-control-icon-size']).toBe('16px');
    const v5 = themeToCssVariables(createTheme(undefined, { future: { v5Defaults: true } }));
    expect(v5['--persona-header-control-icon-size']).toBe('16px');
    expect(v5['--persona-header-control-size']).toBe('28px');
    // The stroke has no alias: widget.css reads the full-path token and owns
    // the 1.5 default, which keeps the sparse close X on its 1.05.
    expect(defaults['--persona-components-header-controlStrokeWidth']).toBeUndefined();

    const custom = themeToCssVariables(
      createTheme({
        components: {
          header: {
            controlSize: '32px',
            controlIconSize: '20px',
            controlStrokeWidth: '2',
          },
        },
      } as any)
    );

    expect(custom['--persona-header-control-size']).toBe('32px');
    expect(custom['--persona-header-control-icon-size']).toBe('20px');
    // Unitless, straight through: no px suffix, no token resolution.
    expect(custom['--persona-components-header-controlStrokeWidth']).toBe('2');
  });

  it('emits the launcher icon stroke token only when set', () => {
    const defaults = themeToCssVariables(createTheme());

    // No alias and no default: widget.css owns the shipped 2 in its var()
    // fallback, so an unset token must leave the variable undefined.
    expect(defaults['--persona-components-launcher-iconStrokeWidth']).toBeUndefined();

    const custom = themeToCssVariables(
      createTheme({
        components: {
          launcher: {
            iconStrokeWidth: '1.5',
          },
        },
      } as any)
    );

    // Unitless, straight through: no px suffix, no token resolution.
    expect(custom['--persona-components-launcher-iconStrokeWidth']).toBe('1.5');
  });

  it('emits the header and rail-header height/surface tokens only when set', () => {
    const defaults = themeToCssVariables(createTheme());
    expect(defaults['--persona-header-min-height']).toBeUndefined();
    expect(defaults['--persona-history-rail-header-bg']).toBeUndefined();
    expect(defaults['--persona-history-rail-header-border']).toBeUndefined();
    expect(defaults['--persona-history-rail-header-min-height']).toBeUndefined();

    const custom = themeToCssVariables(
      createTheme({
        components: {
          header: { minHeight: '64px' },
          history: {
            railHeader: {
              background: 'palette.colors.gray.100',
              border: '1px solid #e5e7eb',
              minHeight: '64px',
              title: {
                color: 'palette.colors.gray.900',
                fontSize: '15px',
                fontWeight: '700',
              },
            },
          },
        },
      } as any)
    );

    expect(custom['--persona-header-min-height']).toBe('64px');
    // The background goes through token resolution; the rest are raw CSS.
    expect(custom['--persona-history-rail-header-bg']).toBe('#f3f4f6');
    expect(custom['--persona-history-rail-header-border']).toBe('1px solid #e5e7eb');
    expect(custom['--persona-history-rail-header-min-height']).toBe('64px');
    // The rail title is styled straight off the auto-emitted component vars.
    expect(custom['--persona-components-history-railHeader-title-color']).toBe('#111827');
    expect(custom['--persona-components-history-railHeader-title-fontSize']).toBe('15px');
    expect(custom['--persona-components-history-railHeader-title-fontWeight']).toBe('700');
  });

  it('emits the floating rail aliases only when set', () => {
    const defaults = themeToCssVariables(createTheme());
    expect(defaults['--persona-history-overlay-margin']).toBeUndefined();
    expect(defaults['--persona-history-overlay-radius']).toBeUndefined();
    expect(defaults['--persona-history-overlay-shadow']).toBeUndefined();
    expect(defaults['--persona-history-overlay-bg']).toBeUndefined();

    const custom = themeToCssVariables(
      createTheme({
        components: {
          history: {
            overlay: {
              margin: '12px',
              borderRadius: '20px',
              shadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
              background: 'palette.colors.gray.100',
            },
          },
        },
      } as any)
    );

    expect(custom['--persona-history-overlay-margin']).toBe('12px');
    expect(custom['--persona-history-overlay-radius']).toBe('20px');
    expect(custom['--persona-history-overlay-shadow']).toBe(
      '0 8px 24px rgba(0, 0, 0, 0.4)'
    );
    // The background goes through token resolution; the rest are raw CSS.
    expect(custom['--persona-history-overlay-bg']).toBe('#f3f4f6');
  });

  it('emits the history menu aliases only when set', () => {
    const defaults = themeToCssVariables(createTheme());
    expect(defaults['--persona-history-menu-bg']).toBeUndefined();
    expect(defaults['--persona-history-menu-radius']).toBeUndefined();

    const custom = themeToCssVariables(
      createTheme({
        components: {
          history: {
            menu: {
              background: 'palette.colors.gray.100',
              borderRadius: '16px',
            },
          },
        },
      } as any)
    );

    expect(custom['--persona-history-menu-bg']).toBe('#f3f4f6');
    expect(custom['--persona-history-menu-radius']).toBe('16px');
  });

  it('emits the tooltip aliases only when set, including the arrow opt-out', () => {
    const defaults = themeToCssVariables(createTheme());
    expect(defaults['--persona-tooltip-background']).toBeUndefined();
    expect(defaults['--persona-tooltip-hint-fg']).toBeUndefined();
    expect(defaults['--persona-tooltip-radius']).toBeUndefined();
    expect(defaults['--persona-tooltip-arrow-display']).toBeUndefined();

    const custom = themeToCssVariables(
      createTheme({
        components: {
          tooltip: {
            background: 'palette.colors.gray.800',
            foreground: 'palette.colors.gray.50',
            hintForeground: 'palette.colors.gray.400',
            borderRadius: 'palette.radius.md',
            fontSize: '13px',
            padding: '8px 14px',
            maxWidth: '240px',
            shadow: 'none',
            arrow: false,
          },
        },
      } as any)
    );

    // Colors and the radius resolve through the palette; the rest are raw CSS.
    expect(custom['--persona-tooltip-background']).toBe('#1f2937');
    expect(custom['--persona-tooltip-foreground']).toBe('#f9fafb');
    expect(custom['--persona-tooltip-hint-fg']).toBe('#9ca3af');
    expect(custom['--persona-tooltip-radius']).toBe('0.375rem');
    expect(custom['--persona-tooltip-font-size']).toBe('13px');
    expect(custom['--persona-tooltip-padding']).toBe('8px 14px');
    expect(custom['--persona-tooltip-max-width']).toBe('240px');
    expect(custom['--persona-tooltip-shadow']).toBe('none');
    expect(custom['--persona-tooltip-arrow-display']).toBe('none');

    // arrow: true is the built-in look, so it emits nothing.
    const withArrow = themeToCssVariables(
      createTheme({ components: { tooltip: { arrow: true } } } as any)
    );
    expect(withArrow['--persona-tooltip-arrow-display']).toBeUndefined();
  });

  it('emits full-path CSS variables for header and welcome text style tokens', () => {
    const theme = createTheme({
      components: {
        introCard: {
          title: { fontFamily: 'Georgia, serif', fontSize: '1.5rem' },
        },
        header: {
          title: {
            fontFamily: 'Inter, sans-serif',
            color: 'palette.colors.secondary.500',
          },
        },
      },
    } as any);
    const cssVars = themeToCssVariables(theme);

    expect(cssVars['--persona-components-introCard-title-fontFamily']).toBe(
      'Georgia, serif'
    );
    expect(cssVars['--persona-components-introCard-title-fontSize']).toBe('1.5rem');
    expect(cssVars['--persona-components-header-title-fontFamily']).toBe(
      'Inter, sans-serif'
    );
    // title.color supersedes the legacy titleForeground alias.
    expect(cssVars['--persona-header-title-fg']).toBe('#8b5cf6');
  });

  it('keeps titleForeground working when no header.title.color is set', () => {
    const cssVars = themeToCssVariables(
      createTheme({
        components: {
          header: { titleForeground: 'palette.colors.gray.500' },
        },
      } as any)
    );

    expect(cssVars['--persona-header-title-fg']).toBe('#6b7280');
  });

  it('emits suggestion itemGap for every variant, defaulting to 8px', () => {
    const defaults = themeToCssVariables(createTheme());
    expect(defaults['--persona-components-suggestion-chip-itemGap']).toBe('8px');
    expect(defaults['--persona-components-suggestion-card-itemGap']).toBe('8px');
    expect(defaults['--persona-components-suggestion-list-itemGap']).toBe('8px');

    const custom = themeToCssVariables(
      createTheme({
        components: { suggestion: { list: { itemGap: '20px' } } },
      } as any)
    );
    expect(custom['--persona-components-suggestion-list-itemGap']).toBe('20px');
    // Sibling variants keep the default.
    expect(custom['--persona-components-suggestion-chip-itemGap']).toBe('8px');
  });

  it('maps button.ghost tokens to the composer ghost icon-button CSS variables', () => {
    const cssVars = themeToCssVariables(createTheme());

    // The composer's transparent icon buttons (.persona-mention-button /
    // .persona-attachment-button) read these instead of hardcoded inline styles.
    expect(cssVars['--persona-button-ghost-bg']).toBe('transparent');
    expect(cssVars['--persona-button-ghost-fg']).toBe('#111827'); // semantic.text → gray.900
    expect(cssVars['--persona-button-ghost-radius']).toBe('0.375rem'); // radius.md
    expect(cssVars['--persona-button-ghost-hover-bg']).toBe('rgba(0, 0, 0, 0.05)');

    const custom = createTheme({
      components: {
        button: {
          ghost: {
            foreground: 'palette.colors.accent.500',
            hoverBackground: 'palette.colors.gray.100',
          },
        },
      },
    } as any);
    const customVars = themeToCssVariables(custom);
    expect(customVars['--persona-button-ghost-fg']).toBe('#06b6d4'); // accent.500
    expect(customVars['--persona-button-ghost-hover-bg']).toBe('#f3f4f6'); // gray.100
  });

  it('inverts the ghost hover wash for dark color schemes', () => {
    // 5% black is invisible on a near-black surface, so every dark scheme —
    // including a host theme that never mentions button.ghost — gets a light
    // alpha wash instead. This drives the history rail's collapse toggle, its
    // un-themed rows, and the per-message action buttons.
    const light = themeToCssVariables(getActiveTheme({ colorScheme: 'light' }));
    expect(light['--persona-button-ghost-hover-bg']).toBe('rgba(0, 0, 0, 0.05)');

    const dark = themeToCssVariables(getActiveTheme({ colorScheme: 'dark' }));
    expect(dark['--persona-button-ghost-hover-bg']).toBe('rgba(255, 255, 255, 0.08)');

    // A host dark theme that overrides unrelated component tokens keeps it:
    // the dark default is deep-merged underneath, not spread over.
    const hostDark = themeToCssVariables(
      getActiveTheme({
        colorScheme: 'dark',
        darkTheme: { components: { button: { primary: { background: '#22c55e' } } } },
      } as any)
    );
    expect(hostDark['--persona-button-ghost-hover-bg']).toBe('rgba(255, 255, 255, 0.08)');

    // An explicit hoverBackground always wins, in either scheme.
    const explicitDark = themeToCssVariables(
      getActiveTheme({
        colorScheme: 'dark',
        darkTheme: {
          components: { button: { ghost: { hoverBackground: 'palette.colors.gray.800' } } },
        },
      } as any)
    );
    expect(explicitDark['--persona-button-ghost-hover-bg']).toBe('#1f2937'); // gray.800

    // Set on `theme` alone it still reaches dark mode, which merges theme
    // under darkTheme before the dark rebuild.
    const explicitViaLight = themeToCssVariables(
      getActiveTheme({
        colorScheme: 'dark',
        theme: { components: { button: { ghost: { hoverBackground: '#123456' } } } },
      } as any)
    );
    expect(explicitViaLight['--persona-button-ghost-hover-bg']).toBe('#123456');
  });

  it('lightens the history danger red for dark color schemes', () => {
    // error-600 lands ~3:1 on dark surfaces, under the AA floor for the 14px
    // destructive labels; the built-in dark defaults swap in error-400.
    const light = themeToCssVariables(getActiveTheme({ colorScheme: 'light' }));
    expect(light['--persona-history-danger-fg']).toBeUndefined();

    const dark = themeToCssVariables(getActiveTheme({ colorScheme: 'dark' }));
    expect(dark['--persona-history-danger-fg']).toBe('#f87171');

    // An explicit dangerForeground wins in either scheme.
    const explicit = themeToCssVariables(
      getActiveTheme({
        colorScheme: 'dark',
        darkTheme: {
          components: { history: { dangerForeground: '#fecaca' } },
        },
      } as any)
    );
    expect(explicit['--persona-history-danger-fg']).toBe('#fecaca');
  });

  it('lightens markdown link color for dark color schemes', () => {
    // primary.600 is #0f0f0f in both palettes, so the light default is
    // invisible on a charcoal assistant bubble. Dark schemes swap in
    // primary.300 unless the host set an explicit link foreground.
    const light = themeToCssVariables(getActiveTheme({ colorScheme: 'light' }));
    expect(light['--persona-md-link-color']).toBe('#0f0f0f');

    const dark = themeToCssVariables(getActiveTheme({ colorScheme: 'dark' }));
    expect(dark['--persona-md-link-color']).toBe('#a3a3a3');

    const hostDark = themeToCssVariables(
      getActiveTheme({
        colorScheme: 'dark',
        darkTheme: { components: { button: { primary: { background: '#22c55e' } } } },
      } as any)
    );
    expect(hostDark['--persona-md-link-color']).toBe('#a3a3a3');

    const explicitDark = themeToCssVariables(
      getActiveTheme({
        colorScheme: 'dark',
        darkTheme: {
          components: { markdown: { link: { foreground: 'palette.colors.accent.400' } } },
        },
      } as any)
    );
    expect(explicitDark['--persona-md-link-color']).toBe('#22d3ee'); // accent.400

    const explicitViaLight = themeToCssVariables(
      getActiveTheme({
        colorScheme: 'dark',
        theme: { components: { markdown: { link: { foreground: '#60a5fa' } } } },
      } as any)
    );
    expect(explicitViaLight['--persona-md-link-color']).toBe('#60a5fa');
  });

  it('emits the confirm dialog danger pair and forks the fill for dark', () => {
    // Always emitted: the dialog's inline var() must resolve so the fill
    // follows a customized error palette instead of its legacy fallback.
    const light = themeToCssVariables(getActiveTheme({ colorScheme: 'light' }));
    expect(light['--persona-danger']).toBe('#b91c1c'); // error.700
    expect(light['--persona-danger-fg']).toBe('#ffffff');
    expect(light['--persona-history-confirm-scrim']).toBeUndefined();

    const dark = themeToCssVariables(getActiveTheme({ colorScheme: 'dark' }));
    expect(dark['--persona-danger']).toBe('#dc2626'); // error.600
    // The light scrim default barely dims near-black surfaces.
    expect(dark['--persona-history-confirm-scrim']).toBe('rgba(0, 0, 0, 0.6)');

    const explicit = themeToCssVariables(
      getActiveTheme({
        colorScheme: 'dark',
        darkTheme: {
          components: {
            history: {
              confirm: {
                dangerBackground: '#7f1d1d',
                dangerForeground: '#fee2e2',
                scrim: 'rgba(0, 0, 0, 0.6)',
              },
            },
          },
        },
      } as any)
    );
    expect(explicit['--persona-danger']).toBe('#7f1d1d');
    expect(explicit['--persona-danger-fg']).toBe('#fee2e2');
    expect(explicit['--persona-history-confirm-scrim']).toBe('rgba(0, 0, 0, 0.6)');
  });

  it('preserves V4 messageActions aliases only when the group is configured', () => {
    // widget.css chains to the ghost wash and semantic text on its own, so an
    // unset group must leave every alias undefined.
    const defaults = themeToCssVariables(createTheme());
    expect(defaults['--persona-message-action-bg']).toBeUndefined();
    expect(defaults['--persona-message-action-border']).toBeUndefined();
    expect(defaults['--persona-message-action-hover-bg']).toBeUndefined();
    expect(defaults['--persona-message-action-hover-fg']).toBeUndefined();
    expect(defaults['--persona-message-action-radius']).toBeUndefined();

    const themed = themeToCssVariables(
      createTheme({
        components: {
          messageActions: {
            background: 'palette.colors.gray.50',
            border: '1px solid #333333',
            hoverBackground: 'palette.colors.gray.100',
            hoverForeground: 'semantic.colors.text',
            borderRadius: 'palette.radius.full',
          },
        },
      } as any)
    );
    expect(themed['--persona-message-action-bg']).toBe('#f9fafb'); // gray.50
    expect(themed['--persona-message-action-border']).toBe('1px solid #333333');
    expect(themed['--persona-message-action-hover-bg']).toBe('#f3f4f6'); // gray.100
    expect(themed['--persona-message-action-hover-fg']).toBe('#111827'); // semantic text
    expect(themed['--persona-message-action-radius']).toBe('9999px');

    // Partial groups emit only what they set.
    const partial = themeToCssVariables(
      createTheme({ components: { messageActions: { borderRadius: '2px' } } } as any)
    );
    expect(partial['--persona-message-action-radius']).toBe('2px');
    expect(partial['--persona-message-action-hover-bg']).toBeUndefined();
  });

  it.each(['light', 'dark'] as const)('materializes V5 message action tokens in the %s scheme', (colorScheme) => {
    const config = { future: { v5Defaults: true }, colorScheme };
    const defaults = themeToCssVariables(getActiveTheme(config));
    expect(defaults['--persona-message-action-bg']).toBe('transparent');
    expect(defaults['--persona-message-action-border']).toBe('none');
    expect(defaults['--persona-message-action-hover-bg']).toBe(
      colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'
    );
    expect(defaults['--persona-message-action-hover-fg']).toBe(defaults['--persona-text']);
    expect(defaults['--persona-message-action-radius']).toBe('8px');

    const theme = { components: {
      button: { ghost: { hoverBackground: '#123456' } },
      messageActions: { borderRadius: '3px', hoverForeground: '#abcdef' },
    } };
    const custom = themeToCssVariables(getActiveTheme({ ...config, theme, darkTheme: theme }));
    expect(custom['--persona-message-action-hover-bg']).toBe('#123456');
    expect(custom['--persona-message-action-hover-fg']).toBe('#abcdef');
    expect(custom['--persona-message-action-radius']).toBe('3px');
    expect(custom['--persona-message-action-bg']).toBe('transparent');
  });

  it('defaults artifact pane fill from semantic container and resolves toolbar background token refs', () => {
    const theme = createTheme();
    const cssVars = themeToCssVariables(theme);

    // container defaults to gray.50 now (soft gray surfaces role)
    expect(cssVars['--persona-components-artifact-pane-background']).toBe('#f9fafb');
    expect(cssVars['--persona-artifact-toolbar-bg']).toBe('#f9fafb');

    const surfacePane = createTheme({
      components: {
        artifact: {
          pane: {
            background: 'semantic.colors.surface',
            toolbarBackground: 'semantic.colors.surface',
          },
        },
      },
    } as any);
    const surfaceVars = themeToCssVariables(surfacePane);
    expect(surfaceVars['--persona-components-artifact-pane-background']).toBe('#f9fafb');
    expect(surfaceVars['--persona-artifact-toolbar-bg']).toBe('#f9fafb');
  });

  it('coerces unitless zero toggle-group gap/padding to px (calc-safe)', () => {
    const theme = createTheme({
      components: {
        artifact: {
          toolbar: {
            toggleGroupGap: '0',
            toggleGroupPadding: '0',
          },
        },
      },
    } as any);
    const cssVars = themeToCssVariables(theme);
    // The selection thumb's width calc() mixes these with lengths; a bare
    // "0" is a <number> there and would invalidate the whole expression.
    expect(cssVars['--persona-artifact-toolbar-toggle-group-gap']).toBe('0px');
    expect(cssVars['--persona-artifact-toolbar-toggle-group-padding']).toBe('0px');

    const unitful = themeToCssVariables(
      createTheme({
        components: {
          artifact: { toolbar: { toggleGroupGap: '4px', toggleGroupPadding: '0.25rem' } },
        },
      } as any)
    );
    expect(unitful['--persona-artifact-toolbar-toggle-group-gap']).toBe('4px');
    expect(unitful['--persona-artifact-toolbar-toggle-group-padding']).toBe('0.25rem');
  });

  it('maps artifact inline chrome tokens to dedicated CSS variables (with semantic refs)', () => {
    const theme = createTheme({
      components: {
        artifact: {
          inline: {
            background: 'semantic.colors.surface',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            chromeBackground: 'semantic.colors.container',
            chromeBorder: '#e5e7eb',
            titleColor: 'palette.colors.gray.900',
            mutedColor: 'palette.colors.gray.500',
            frameHeight: '400px',
          },
        },
      },
    } as any);

    const cssVars = themeToCssVariables(theme);

    // semantic.* refs resolve to concrete colors; plain values pass through.
    // surface and container both default to gray.50.
    expect(cssVars['--persona-artifact-inline-bg']).toBe('#f9fafb');
    expect(cssVars['--persona-artifact-inline-border']).toBe('1px solid #e5e7eb');
    expect(cssVars['--persona-artifact-inline-radius']).toBe('12px');
    expect(cssVars['--persona-artifact-inline-chrome-bg']).toBe('#f9fafb');
    expect(cssVars['--persona-artifact-inline-chrome-border']).toBe('#e5e7eb');
    expect(cssVars['--persona-artifact-inline-title-color']).toBe('#111827');
    expect(cssVars['--persona-artifact-inline-muted-color']).toBe('#6b7280');
    expect(cssVars['--persona-artifact-inline-frame-height']).toBe('400px');
  });

  it('maps component bubble shadow tokens to consumer CSS variables', () => {
    const cfg = {
      colorScheme: 'light' as const,
      theme: {
        components: {
          toolBubble: { shadow: 'none' },
          reasoningBubble: { shadow: 'none' },
          composer: { shadow: 'none' },
          message: {
            user: { shadow: 'none' },
            assistant: { shadow: 'none' },
          },
        },
      },
    };

    const active = getActiveTheme(cfg);
    const cssVars = themeToCssVariables(active);

    expect(cssVars['--persona-tool-bubble-shadow']).toBe('none');
    expect(cssVars['--persona-reasoning-bubble-shadow']).toBe('none');
    expect(cssVars['--persona-message-user-shadow']).toBe('none');
    expect(cssVars['--persona-message-assistant-shadow']).toBe('none');
    expect(cssVars['--persona-composer-shadow']).toBe('none');
  });

  it('falls back composer spacing/type vars to the utility-class defaults', () => {
    const cssVars = themeToCssVariables(createTheme());

    expect(cssVars['--persona-composer-padding']).toBe('0.75rem 1rem');
    expect(cssVars['--persona-composer-gap']).toBe('0.5rem');
    expect(cssVars['--persona-composer-font-size']).toBe('0.875rem');
    expect(cssVars['--persona-composer-line-height']).toBe('1.25rem');
  });

  it('maps composer spacing/type tokens to dedicated CSS variables', () => {
    const theme = createTheme({
      components: {
        composer: {
          padding: '1rem 1.25rem',
          gap: '0.75rem',
          fontSize: '1rem',
          lineHeight: '1.5rem',
        },
      },
    } as any);

    const cssVars = themeToCssVariables(theme);

    expect(cssVars['--persona-components-composer-padding']).toBe('1rem 1.25rem');
    expect(cssVars['--persona-components-composer-gap']).toBe('0.75rem');
    expect(cssVars['--persona-components-composer-fontSize']).toBe('1rem');
    expect(cssVars['--persona-components-composer-lineHeight']).toBe('1.5rem');

    expect(cssVars['--persona-composer-padding']).toBe('1rem 1.25rem');
    expect(cssVars['--persona-composer-gap']).toBe('0.75rem');
    expect(cssVars['--persona-composer-font-size']).toBe('1rem');
    expect(cssVars['--persona-composer-line-height']).toBe('1.5rem');
  });

  it('defaults the composer control-size tokens to 40px and 24px', () => {
    const cssVars = themeToCssVariables(createTheme());

    expect(cssVars['--persona-composer-control-size']).toBe('40px');
    expect(cssVars['--persona-composer-control-icon-size']).toBe('24px');
  });

  it('maps composer controlSize/controlIconSize to dedicated CSS variables', () => {
    const theme = createTheme({
      components: {
        composer: { controlSize: '32px', controlIconSize: '18px' },
      },
    } as any);

    const cssVars = themeToCssVariables(theme);

    expect(cssVars['--persona-composer-control-size']).toBe('32px');
    expect(cssVars['--persona-composer-control-icon-size']).toBe('18px');
  });

  it('defaults the motion tokens', () => {
    const cssVars = themeToCssVariables(createTheme());

    expect(cssVars['--persona-motion-duration-fast']).toBe('120ms');
    expect(cssVars['--persona-motion-duration-base']).toBe('200ms');
    expect(cssVars['--persona-motion-easing']).toBe('cubic-bezier(0.2, 0, 0, 1)');
  });

  it('maps motion tokens to dedicated CSS variables', () => {
    const theme = createTheme({
      components: {
        motion: {
          durationFast: '80ms',
          durationBase: '260ms',
          easing: 'linear',
        },
      },
    } as any);

    const cssVars = themeToCssVariables(theme);

    expect(cssVars['--persona-motion-duration-fast']).toBe('80ms');
    expect(cssVars['--persona-motion-duration-base']).toBe('260ms');
    expect(cssVars['--persona-motion-easing']).toBe('linear');
  });

  it('accepts 0ms durations as a motion kill switch', () => {
    const theme = createTheme({
      components: { motion: { durationFast: '0ms', durationBase: '0ms' } },
    } as any);

    const cssVars = themeToCssVariables(theme);

    expect(cssVars['--persona-motion-duration-fast']).toBe('0ms');
    expect(cssVars['--persona-motion-duration-base']).toBe('0ms');
  });

  it('maps scroll-to-bottom component tokens to dedicated CSS variables', () => {
    const theme = createTheme({
      components: {
        scrollToBottom: {
          background: 'palette.colors.accent.500',
          foreground: 'palette.colors.gray.50',
          border: 'palette.colors.gray.900',
          size: '40px',
          borderRadius: 'palette.radius.full',
          shadow: 'palette.shadows.md',
          padding: '0.5rem 0.875rem',
          gap: '0.5rem',
          fontSize: '0.875rem',
          iconSize: '14px',
        },
      },
    } as any);

    const cssVars = themeToCssVariables(theme);

    expect(cssVars['--persona-scroll-to-bottom-bg']).toBe('#06b6d4');
    expect(cssVars['--persona-scroll-to-bottom-fg']).toBe('#f9fafb');
    expect(cssVars['--persona-scroll-to-bottom-border']).toBe('#111827');
    expect(cssVars['--persona-scroll-to-bottom-size']).toBe('40px');
    expect(cssVars['--persona-scroll-to-bottom-radius']).toBe('9999px');
    expect(cssVars['--persona-scroll-to-bottom-shadow']).toBe(
      '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
    );
    expect(cssVars['--persona-scroll-to-bottom-padding']).toBe('0.5rem 0.875rem');
    expect(cssVars['--persona-scroll-to-bottom-gap']).toBe('0.5rem');
    expect(cssVars['--persona-scroll-to-bottom-font-size']).toBe('0.875rem');
    expect(cssVars['--persona-scroll-to-bottom-icon-size']).toBe('14px');
  });

  it('maps count badge overrides without changing the scroll pill', () => {
    const cssVars = themeToCssVariables(createTheme({
      components: {
        scrollToBottom: {
          border: '#123456',
          countBadge: {
            background: 'palette.colors.accent.500',
            foreground: '#ffffff',
            border: '#654321',
            borderRadius: '4px',
            size: '22px',
            padding: '0 7px',
            fontSize: '12px',
            fontWeight: '700',
          },
        },
      },
    }));
    expect(cssVars['--persona-scroll-to-bottom-border']).toBe('#123456');
    expect(cssVars['--persona-scroll-to-bottom-count-bg']).toBe('#06b6d4');
    expect(cssVars['--persona-scroll-to-bottom-count-fg']).toBe('#ffffff');
    expect(cssVars['--persona-scroll-to-bottom-count-border']).toBe('#654321');
    expect(cssVars['--persona-scroll-to-bottom-count-radius']).toBe('4px');
    expect(cssVars['--persona-scroll-to-bottom-count-size']).toBe('22px');
    expect(cssVars['--persona-scroll-to-bottom-count-padding']).toBe('0 7px');
    expect(cssVars['--persona-scroll-to-bottom-count-font-size']).toBe('12px');
    expect(cssVars['--persona-scroll-to-bottom-count-font-weight']).toBe('700');
  });

  it.each([false, true])('preserves CSS count badge fallbacks with V5=%s', (v5Defaults) => {
    for (const colorScheme of ['light', 'dark'] as const) {
      const cssVars = themeToCssVariables(getActiveTheme({
        apiUrl: '/api', future: { v5Defaults }, colorScheme,
        theme: { components: { scrollToBottom: { border: '#123456' } } },
        darkTheme: { components: { scrollToBottom: { border: '#123456' } } },
      }));
      expect(cssVars['--persona-scroll-to-bottom-border']).toBe('#123456');
      expect(Object.keys(cssVars).filter(key => key.startsWith('--persona-scroll-to-bottom-count-'))).toEqual([]);
      expect(cssVars['--persona-scroll-to-bottom-shadow']).toBe(cssVars['--persona-palette-shadows-sm']);
    }
  });

  it('maps introCard component tokens to dedicated CSS variables', () => {
    const theme = createTheme({
      components: {
        introCard: {
          background: 'palette.colors.accent.50',
          borderRadius: 'palette.radius.xl',
          padding: 'semantic.spacing.lg',
          shadow: '0 10px 30px rgba(53, 44, 131, 0.15)',
        },
      },
    } as any);

    const cssVars = themeToCssVariables(theme);

    expect(cssVars['--persona-components-introCard-background']).toBe('#ecfeff');
    expect(cssVars['--persona-components-introCard-borderRadius']).toBe('0.75rem');
    expect(cssVars['--persona-components-introCard-padding']).toBe('1.5rem');
    expect(cssVars['--persona-components-introCard-shadow']).toBe(
      '0 10px 30px rgba(53, 44, 131, 0.15)'
    );
    expect(cssVars['--persona-intro-card-bg']).toBe('#ecfeff');
    expect(cssVars['--persona-intro-card-radius']).toBe('0.75rem');
    expect(cssVars['--persona-intro-card-padding']).toBe('1.5rem');
    expect(cssVars['--persona-intro-card-shadow']).toBe(
      '0 10px 30px rgba(53, 44, 131, 0.15)'
    );
  });

  it('defaults the intro card to flat (transparent, no shadow) when no token is set', () => {
    const theme = createTheme({});
    const cssVars = themeToCssVariables(theme);
    expect(cssVars['--persona-intro-card-shadow']).toBe('none');
    expect(cssVars['--persona-intro-card-bg']).toBe('transparent');
  });

  it('resolves semantic suggestion tokens for every variant and state', () => {
    const theme = createTheme({
      components: {
        suggestion: {
          chip: {
            background: 'palette.colors.accent.50',
            hoverBackground: 'palette.colors.accent.100',
            focusRing: 'semantic.colors.interactive.focus',
          },
          card: {
            borderRadius: 'palette.radius.lg',
            shadow: 'palette.shadows.md',
          },
          list: {
            minHeight: '48px',
            disabledOpacity: '0.4',
          },
        },
      },
    });
    const cssVars = themeToCssVariables(theme);

    expect(cssVars['--persona-components-suggestion-chip-background']).toBe(
      '#ecfeff'
    );
    expect(
      cssVars['--persona-components-suggestion-chip-hoverBackground']
    ).toBe('#cffafe');
    expect(cssVars['--persona-components-suggestion-chip-focusRing']).toBe(
      '#0f0f0f'
    );
    expect(
      cssVars['--persona-components-suggestion-card-borderRadius']
    ).toBe('0.5rem');
    expect(cssVars['--persona-components-suggestion-card-shadow']).toContain(
      '0 4px 6px'
    );
    expect(cssVars['--persona-components-suggestion-list-minHeight']).toBe(
      '48px'
    );
    expect(
      cssVars['--persona-components-suggestion-list-disabledOpacity']
    ).toBe('0.4');
  });

  it('drives --persona-tool-bubble-shadow from the theme token (config.toolCall.shadow is applied inline on the bubble, not the root var)', () => {
    const el = document.createElement('div');
    applyThemeVariables(el, {
      colorScheme: 'light',
      theme: {
        components: {
          toolBubble: { shadow: '0 1px 2px rgba(255,0,0,0.5)' },
        },
      },
      // config.toolCall.shadow no longer rewrites the root variable: the
      // override is applied inline by createToolBubble (see tool-bubble tests).
      toolCall: { shadow: 'none' },
    });
    expect(el.style.getPropertyValue('--persona-tool-bubble-shadow').trim()).toBe(
      '0 1px 2px rgba(255,0,0,0.5)'
    );
  });

  it('stamps the resolved color scheme on the root so scheme-scoped CSS (syntax palette) follows the widget, not the OS', () => {
    const el = document.createElement('div');
    applyThemeVariables(el, { colorScheme: 'light' });
    expect(el.getAttribute('data-persona-color-scheme')).toBe('light');
    applyThemeVariables(el, { colorScheme: 'dark' });
    expect(el.getAttribute('data-persona-color-scheme')).toBe('dark');
  });

  it.each([{ v5Defaults: false }, { v5Defaults: true }])(
    'threads future.v5Defaults=%s through active theme resolution and root state',
    (future) => {
      const config = {
        colorScheme: 'dark' as const,
        future,
        theme: { palette: { colors: { gray: { 500: '#123456' } } } },
      };
      expect(getActiveTheme(config).palette.colors.gray[500]).toBe('#123456');

      const el = document.createElement('div');
      applyThemeVariables(el, config);
      expect(el.getAttribute('data-persona-defaults')).toBe(
        future.v5Defaults ? 'v5' : 'v4'
      );
    }
  );

  it('maps components.code.background to --persona-code-bg', () => {
    const theme = createTheme({
      components: { code: { background: '#fafafa' } },
    });
    const cssVars = themeToCssVariables(theme);
    expect(cssVars['--persona-code-bg']).toBe('#fafafa');
  });

  it('derives the shared scrollbar variables from components.scrollbar with border fallback', () => {
    const defaults = themeToCssVariables(createTheme({} as any));
    expect(defaults['--persona-scrollbar-thumb']).toBe(defaults['--persona-border']);
    expect(defaults['--persona-scrollbar-track']).toBe('transparent');

    const themed = themeToCssVariables(
      createTheme({
        components: { scrollbar: { thumb: '#00dfc1', track: '#111111' } },
      } as any)
    );
    expect(themed['--persona-scrollbar-thumb']).toBe('#00dfc1');
    expect(themed['--persona-scrollbar-track']).toBe('#111111');
  });

  it('exposes intro card border and composer border color tokens', () => {
    const defaults = themeToCssVariables(createTheme({} as any));
    expect(defaults['--persona-intro-card-border']).toBe('none');
    expect(defaults['--persona-composer-border-color']).toBe(defaults['--persona-border']);

    const themed = themeToCssVariables(
      createTheme({
        components: {
          introCard: { border: '1px solid rgba(0, 0, 0, 0.1)' },
          composer: { borderColor: 'rgba(29, 28, 23, 0.25)' },
        },
      } as any)
    );
    expect(themed['--persona-intro-card-border']).toBe('1px solid rgba(0, 0, 0, 0.1)');
    expect(themed['--persona-composer-border-color']).toBe('rgba(29, 28, 23, 0.25)');
  });

  it('follows the palette radius for markdown code blocks so square themes get square code', () => {
    const defaults = themeToCssVariables(createTheme({} as any));
    expect(defaults['--persona-md-code-block-border-radius']).toBe('0.375rem');

    const square = themeToCssVariables(
      createTheme({
        palette: {
          radius: { sm: '0px', md: '0px', lg: '0px', xl: '0px', '2xl': '0px' },
        },
      } as any)
    );
    expect(square['--persona-md-code-block-border-radius']).toBe('0px');

    const explicit = themeToCssVariables(
      createTheme({
        components: { markdown: { codeBlock: { borderRadius: '2px' } } },
      } as any)
    );
    expect(explicit['--persona-md-code-block-border-radius']).toBe('2px');
  });
});


describe.each([false, true])('versioned panel mode widths (v5=%s)', (v5Defaults) => {
  it.each(['docked', 'sidebar'] as const)('uses version defaults and explicit widths in %s', (mode) => {
    const config = { apiUrl: '/api', future: { v5Defaults }, launcher: mode === 'docked' ? { mountMode: 'docked' as const } : { sidebarMode: true } };
    expect(getActiveTheme(config).components.panel.width).toBe(v5Defaults ? '400px' : '420px');
    expect(getActiveTheme({ ...config, theme: { components: { panel: { width: '510px' } } } }).components.panel.width).toBe('510px');
    expect(getActiveTheme({ ...config, colorScheme: 'dark', darkTheme: { components: { panel: { width: '530px' } } } }).components.panel.width).toBe('530px');
  });
});

describe.each([false, true])('versioned dark palette (v5=%s)', (v5Defaults) => {
  const future = { v5Defaults };
  const variables = (colorScheme: 'light' | 'dark' | 'auto') =>
    themeToCssVariables(getActiveTheme({ future, colorScheme }));

  afterEach(() => document.documentElement.classList.remove('dark'));

  it('changes neutral and markdown defaults only in V5', () => {
    const light = variables('light');
    const dark = variables('dark');
    for (const token of [
      'surface', 'background', 'text', 'border', 'md-inline-code-bg', 'md-inline-code-color',
      'md-code-block-bg', 'md-table-header-bg', 'md-blockquote-bg', 'md-blockquote-text-color',
    ]) {
      expect(dark[`--persona-${token}`], token).toBeDefined();
      if (v5Defaults) expect(dark[`--persona-${token}`], token).not.toBe(light[`--persona-${token}`]);
      else expect(dark[`--persona-${token}`], token).toBe(light[`--persona-${token}`]);
    }
    if (v5Defaults) {
      expect(dark['--persona-surface']).toBe('#1a1a1b');
      expect(dark['--persona-background']).toBe('#0f0f10');
      expect(dark['--persona-text']).toBe('#f4f4f5');
      expect(dark['--persona-border']).toBe('#2a2a2d');
      expect(dark['--persona-message-user-bg']).toBe('#27272a');
    }
  });

  it('resolves auto mode through the same versioned dark defaults', () => {
    expect(variables('auto')).toEqual(variables('light'));
    document.documentElement.classList.add('dark');
    expect(variables('auto')).toEqual(variables('dark'));
  });

  it.each(['light', 'dark', 'auto'] as const)('honors explicit palette, semantic and component tokens in %s', (colorScheme) => {
    document.documentElement.classList.add('dark');
    const css = themeToCssVariables(getActiveTheme({
      future, colorScheme,
      theme: {
        palette: { colors: { primary: { 500: '#123456' }, gray: { 500: '#abcdef' } } },
        semantic: { colors: { surface: '#223344' } },
        components: { markdown: { inlineCode: { background: '#334455' } } },
      },
      darkTheme: { components: { markdown: { table: { headerBackground: '#445566' } } } },
    }));
    expect(css['--persona-button-primary-bg']).toBe('#123456');
    expect(css['--persona-text-muted']).toBe('#abcdef');
    expect(css['--persona-surface']).toBe('#223344');
    expect(css['--persona-md-inline-code-bg']).toBe('#334455');
    if (colorScheme !== 'light') {
      expect(css['--persona-md-table-header-bg']).toBe('#445566');
      // A single custom gray stop must not reset the rest of V5's dark ramp.
      if (v5Defaults) expect(css['--persona-text']).toBe('#f4f4f5');
    }
  });
});

it('keeps V5 dark body and markdown text above AA contrast', () => {
  const css = themeToCssVariables(getActiveTheme({ colorScheme: 'dark', future: { v5Defaults: true } }));
  const luminance = (hex: string) => {
    const channels = hex.slice(1).match(/.{2}/g)!.map((channel) => {
      const value = parseInt(channel, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  for (const [foreground, background] of [
    ['text', 'surface'], ['text', 'background'], ['text', 'container'],
    ['text-muted', 'surface'], ['text-muted', 'container'],
    ['text', 'message-user-bg'], ['md-inline-code-color', 'md-inline-code-bg'],
    ['md-code-block-text-color', 'md-code-block-bg'], ['text', 'md-table-header-bg'],
    ['md-blockquote-text-color', 'md-blockquote-bg'], ['md-link-color', 'surface'],
    ['button-primary-fg', 'button-primary-bg'],
  ]) {
    const values = [foreground, background].map((token) => luminance(css[`--persona-${token}`]));
    expect((Math.max(...values) + 0.05) / (Math.min(...values) + 0.05), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
  }
});

describe.each([false, true])('welcome typography defaults (V5: %s)', (v5Defaults) => {
  it('resolves lighter V5 typography and preserves V4 fallbacks', () => {
    const css = themeToCssVariables(getActiveTheme({ future: { v5Defaults } }));
    expect(css['--persona-components-introCard-title-fontSize']).toBe(v5Defaults ? '22px' : undefined);
    expect(css['--persona-components-introCard-title-fontWeight']).toBe(v5Defaults ? '500' : undefined);
    expect(css['--persona-components-header-title-fontWeight']).toBe(v5Defaults ? '500' : undefined);
    for (const variant of ['chip', 'card', 'list']) {
      expect(css[`--persona-components-suggestion-${variant}-fontWeight`]).toBe(v5Defaults ? '400' : undefined);
    }
    if (v5Defaults) expect(css['--persona-input-radius']).toBe('9999px');
  });

  it('honors explicit typography and composer corners', () => {
    const css = themeToCssVariables(getActiveTheme({ future: { v5Defaults }, theme: { components: {
      introCard: { title: { fontWeight: '400', fontSize: '30px' } },
      header: { title: { fontWeight: '600' } },
      suggestion: { card: { fontWeight: '600' } },
      input: { borderRadius: '20px' },
    } } }));
    expect(css['--persona-components-introCard-title-fontWeight']).toBe('400');
    expect(css['--persona-components-introCard-title-fontSize']).toBe('30px');
    expect(css['--persona-components-header-title-fontWeight']).toBe('600');
    expect(css['--persona-components-suggestion-card-fontWeight']).toBe('600');
    expect(css['--persona-input-radius']).toBe('20px');
  });
});

describe.each([false, true])('activity aliases (V5 %s)', v5Defaults => {
  it('emits versioned spacing and preserves independent spacing overrides', () => {
    const defaults = themeToCssVariables(getActiveTheme({ future: { v5Defaults } }));
    const expected = { indent: '0px', groupIndent: '0px', groupGap: '0px', groupPadding: '0px', transcriptGap: '0px', responseGap: '12px', bodyPadding: '4px 0', bodyFontWeight: '400', sectionGap: '8px' };
    for (const [key, value] of Object.entries(expected)) {
      expect(defaults[`--persona-components-activity-${key}`]).toBe(v5Defaults ? value : undefined);
    }
    const activity = { indent: '12px', groupIndent: '6px', groupGap: '3px', groupPadding: '2px 0', transcriptGap: '6px', responseGap: '16px', bodyPadding: '10px 0', bodySize: '15px', bodyLineHeight: '1.7', bodyFontWeight: '500', sectionGap: '14px' };
    const overridden = themeToCssVariables(getActiveTheme({ future: { v5Defaults }, theme: { components: { activity } } }));
    for (const [key, value] of Object.entries(activity)) {
      expect(overridden[`--persona-components-activity-${key}`]).toBe(value);
    }
  });
  it('keeps legacy values usable while preferring explicit activity tokens', () => {
    const vars = (activity?: { labelSize?: string; bodySurface?: string }) => themeToCssVariables(getActiveTheme({ future: { v5Defaults }, theme: { components: {
      toolBubble: { labelSize: '17px', shadow: 'none' }, collapsibleWidget: { surface: '#123456' }, ...(activity ? { activity } : {}),
    } } }));
    expect(vars()['--persona-components-toolBubble-labelSize']).toBe('17px');
    expect(vars()['--persona-components-activity-bodySurface']).toBe(v5Defaults ? 'transparent' : '#123456');
    expect(vars({ labelSize: '15px', bodySurface: '#abcdef' })['--persona-components-toolBubble-labelSize']).toBe('15px');
    expect(vars({ bodySurface: '#abcdef' })['--persona-components-activity-bodySurface']).toBe('#abcdef');
  });
});

describe.each(['light', 'dark'] as const)('V5 header surface (%s)', colorScheme => {
  it('matches the transcript container while preserving explicit header colors', () => {
    const config = { colorScheme, future: { v5Defaults: true } };
    const css = themeToCssVariables(getActiveTheme(config));
    expect(css['--persona-header-bg']).toBe(css['--persona-container']);
    const custom = themeToCssVariables(getActiveTheme({ ...config, theme: { components: { header: { background: '#123456' } } } }));
    expect(custom['--persona-header-bg']).toBe('#123456');
  });
});

describe('V5 header control surfaces', () => {
  it('keeps V4 tokens unset and preserves explicit V5 overrides', () => {
    const legacy = themeToCssVariables(createTheme());
    const v5 = themeToCssVariables(createTheme(undefined, { future: { v5Defaults: true } }));
    expect(legacy['--persona-components-header-controlBorderRadius']).toBeUndefined();
    expect(v5['--persona-components-header-controlBorderRadius']).toBe('8px');
    expect(v5['--persona-components-header-controlHoverBackground']).toContain('8%');
    const custom = themeToCssVariables(createTheme({
      components: { header: { controlBorderRadius: '4px', controlHoverBackground: 'red' } },
    }, { future: { v5Defaults: true } }));
    expect(custom['--persona-components-header-controlBorderRadius']).toBe('4px');
    expect(custom['--persona-components-header-controlHoverBackground']).toBe('red');
  });
});


it.each(['light', 'dark'] as const)('emits V5 artifact card and inline defaults in %s', colorScheme => {
  const config = { future: { v5Defaults: true }, colorScheme };
  const css = themeToCssVariables(getActiveTheme(config));
  expect(css['--persona-artifact-card-bg']).toBe(css['--persona-surface']);
  expect(css['--persona-artifact-card-border']).toBe('1px solid var(--persona-border)');
  expect(css['--persona-artifact-card-radius']).toBe('12px');
  expect(css['--persona-artifact-card-hover-border']).toBe(css['--persona-border']);
  expect(css['--persona-artifact-card-hover-bg']).toBe(colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)');
  expect(css['--persona-artifact-inline-bg']).toBe(css['--persona-surface']);
  expect(css['--persona-artifact-inline-border']).toBe('1px solid var(--persona-border)');
  expect(css['--persona-artifact-inline-radius']).toBe('12px');
  expect(css['--persona-artifact-inline-chrome-bg']).toBe(css['--persona-surface']);
  expect(css['--persona-artifact-inline-chrome-border']).toBe(css['--persona-border']);
  expect(css['--persona-artifact-inline-title-color']).toBe(css['--persona-text']);
  expect(css['--persona-artifact-inline-muted-color']).toBe(css['--persona-muted']);
  const theme = { components: { artifact: {
    card: { background: '#123456', borderRadius: '3px', hoverBackground: '#234567' },
    inline: { borderRadius: '4px', chromeBackground: '#345678', titleColor: '#abcdef' },
  } } };
  const custom = themeToCssVariables(getActiveTheme({ ...config, theme, darkTheme: theme }));
  expect(custom['--persona-artifact-card-bg']).toBe('#123456');
  expect(custom['--persona-artifact-card-radius']).toBe('3px');
  expect(custom['--persona-artifact-card-hover-bg']).toBe('#234567');
  expect(custom['--persona-artifact-inline-radius']).toBe('4px');
  expect(custom['--persona-artifact-inline-chrome-bg']).toBe('#345678');
  expect(custom['--persona-artifact-inline-title-color']).toBe('#abcdef');
});

it('preserves V4 artifact card and inline CSS fallbacks', () => {
  const css = themeToCssVariables(getActiveTheme({}));
  expect(css['--persona-artifact-card-bg']).toBeUndefined();
  expect(css['--persona-artifact-card-radius']).toBeUndefined();
  expect(css['--persona-artifact-inline-bg']).toBeUndefined();
  expect(css['--persona-artifact-inline-radius']).toBeUndefined();
});


describe("activity overflow theme inheritance", () => {
  it.each([false, true])("keeps shared and per-kind properties independent (V5 %s)", v5Defaults => {
    const variables = themeToCssVariables(getActiveTheme({ future: { v5Defaults }, theme: { components: {
      activity: { overflow: { maxHeight: "360px", fadeHeight: "16px" } },
      toolBubble: { overflow: { maxHeight: "140px" } },
      reasoningBubble: { overflow: { fadeHeight: "0px" } },
    } } }));
    expect(variables["--persona-components-activity-overflow-maxHeight"]).toBe("360px");
    expect(variables["--persona-components-activity-overflow-fadeHeight"]).toBe("16px");
    expect(variables["--persona-components-toolBubble-overflow-maxHeight"]).toBe("140px");
    expect(variables["--persona-components-toolBubble-overflow-fadeHeight"]).toBeUndefined();
    expect(variables["--persona-components-reasoningBubble-overflow-maxHeight"]).toBeUndefined();
    expect(variables["--persona-components-reasoningBubble-overflow-fadeHeight"]).toBe("0px");
  });
  it("removes theme overrides live without materializing duplicate defaults", () => {
    const root = document.createElement("div");
    const config = { future: { v5Defaults: true }, theme: { components: { toolBubble: { overflow: { maxHeight: "none", fadeHeight: "0px" } } } } };
    applyThemeVariables(root, config);
    expect(root.style.getPropertyValue("--persona-components-toolBubble-overflow-maxHeight")).toBe("none");
    applyThemeVariables(root, { future: { v5Defaults: true } });
    expect(root.style.getPropertyValue("--persona-components-toolBubble-overflow-maxHeight")).toBe("");
    expect(root.style.getPropertyValue("--persona-components-toolBubble-overflow-fadeHeight")).toBe("");
  });
});
