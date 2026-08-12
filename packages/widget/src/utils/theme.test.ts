// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { applyThemeVariables, createTheme, getActiveTheme, themeToCssVariables } from './theme';

describe('theme utils', () => {
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
    expect(cssVars['--persona-header-title-fg']).toBe('#ffffff'); // primary.50
    expect(cssVars['--persona-header-subtitle-fg']).toBe('#d4d4d4'); // primary.200
    expect(cssVars['--persona-header-action-icon-fg']).toBe('#d4d4d4'); // primary.200

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

  it('emits the shared header control box, glyph, and stroke tokens', () => {
    const defaults = themeToCssVariables(createTheme());

    expect(defaults['--persona-header-control-size']).toBe('40px');
    expect(defaults['--persona-header-control-icon-size']).toBe('24px');
    // The stroke has no alias: widget.css reads the full-path token and owns
    // the 1.5 default, which keeps the sparse close X on its 1.05.
    expect(defaults['--persona-components-header-controlStrokeWidth']).toBeUndefined();

    const custom = themeToCssVariables(
      createTheme({
        components: {
          header: {
            controlSize: '32px',
            controlIconSize: '18px',
            controlStrokeWidth: '2',
          },
        },
      } as any)
    );

    expect(custom['--persona-header-control-size']).toBe('32px');
    expect(custom['--persona-header-control-icon-size']).toBe('18px');
    // Unitless, straight through: no px suffix, no token resolution.
    expect(custom['--persona-components-header-controlStrokeWidth']).toBe('2');
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
