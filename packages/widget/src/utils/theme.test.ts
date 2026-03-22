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
        primary: '#111111',
      },
      darkTheme: {
        primary: '#22c55e',
      },
    };

    const activeTheme = getActiveTheme(lightAndDarkThemeConfig as any);
    const cssVars = themeToCssVariables(activeTheme);

    expect(cssVars['--persona-palette-colors-primary-500']).toBe('#22c55e');
  });

  it('uses darkTheme overrides after auto-detecting dark mode', () => {
    document.documentElement.classList.add('dark');

    const lightAndDarkThemeConfig = {
      colorScheme: 'auto' as const,
      theme: {
        primary: '#111111',
      },
      darkTheme: {
        primary: '#22c55e',
      },
    };

    const activeTheme = getActiveTheme(lightAndDarkThemeConfig as any);
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

  it('maps flat AgentWidgetTheme bubble shadow keys to consumer CSS variables', () => {
    const cfg = {
      colorScheme: 'light' as const,
      theme: {
        toolBubbleShadow: 'none',
        reasoningBubbleShadow: 'none',
        messageUserShadow: 'none',
        messageAssistantShadow: 'none',
        composerShadow: 'none',
      },
    };

    const active = getActiveTheme(cfg as any);
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
      theme: { toolBubbleShadow: '0 1px 2px rgba(255,0,0,0.5)' },
      toolCall: { shadow: 'none' },
    } as any);
    expect(el.style.getPropertyValue('--persona-tool-bubble-shadow').trim()).toBe('none');
  });
});
