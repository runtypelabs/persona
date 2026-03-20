// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { createTheme, getActiveTheme, themeToCssVariables } from './theme';

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
    });

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
});
