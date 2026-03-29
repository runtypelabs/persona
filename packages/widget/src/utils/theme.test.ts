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

  it('lets config.toolCall.shadow override theme tool bubble shadow on the root element', () => {
    const el = document.createElement('div');
    applyThemeVariables(el, {
      colorScheme: 'light',
      theme: {
        components: {
          toolBubble: { shadow: '0 1px 2px rgba(255,0,0,0.5)' },
        },
      },
      toolCall: { shadow: 'none' },
    });
    expect(el.style.getPropertyValue('--persona-tool-bubble-shadow').trim()).toBe('none');
  });
});
