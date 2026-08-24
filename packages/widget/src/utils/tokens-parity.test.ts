import { describe, expect, it } from 'vitest';
import {
  createTheme,
  resolveTokens,
  themeToCssVariables,
  DEFAULT_PALETTE,
  DEFAULT_SEMANTIC,
  DEFAULT_COMPONENTS,
} from './tokens';
import { createDarkTheme, createLightTheme, getActiveTheme } from './theme';
import type { DeepPartial, PersonaTheme } from '../types/theme';

/**
 * Golden parity lock for the token pipeline. Each fixture snapshots the
 * COMPLETE CSS-var map (every key, sorted), so any refactor of the default
 * tables, resolution, or var emission that shifts a single value fails here.
 * Regenerate deliberately with `vitest -u` only when output is MEANT to change.
 */

const fullMap = (theme: PersonaTheme): Record<string, string> => {
  const vars = themeToCssVariables(theme);
  return Object.fromEntries(Object.entries(vars).sort(([a], [b]) => a.localeCompare(b)));
};

const FIXTURES: Record<string, DeepPartial<PersonaTheme>> = {
  'partial primary palette': {
    palette: { colors: { primary: { 500: '#ff4400' } } },
  },
  'header background/foreground pair (color-mix derivation)': {
    components: { header: { background: '#123456', foreground: '#fedcba' } },
  },
  'explicit header keys beat derivation': {
    components: {
      header: {
        background: '#123456',
        foreground: '#fedcba',
        border: '#00ff00',
        title: { color: '#111111' },
        subtitleForeground: '#222222',
        shadow: '0 1px 2px rgba(0,0,0,0.2)',
        borderBottom: '2px solid #000',
        minHeight: '64px',
      },
    },
  },
  'non-flat container (hover anchoring off the flat branch)': {
    semantic: { colors: { container: 'palette.colors.gray.100' } },
  },
  'custom launcher foreground (subtitle wash)': {
    components: { launcher: { foreground: '#ff00ff', background: '#001122' } },
  },
  'history motion + code block tokens': {
    components: {
      history: {
        motion: { enterDurationMs: 180, exitDurationMs: '0', enterEasing: 'ease-out' },
        railHeader: { background: '#eeeeee', minHeight: '40px' },
        overlay: { background: '#ffffff', borderRadius: '12px' },
        menu: { background: '#fafafa' },
      },
      code: {
        background: 'palette.colors.gray.900',
        keywordColor: '#c678dd',
        stringColor: '#98c379',
      },
    } as DeepPartial<PersonaTheme>['components'],
  },
  'radius + typography + spacing palette overrides': {
    palette: {
      radius: { lg: '1rem', full: '4px' },
      typography: { fontFamily: { sans: 'Inter, sans-serif' }, fontSize: { base: '15px' } },
      spacing: { 4: '18px' },
    },
  },
  'button + input + message component overrides': {
    components: {
      button: {
        primary: { background: '#0044ff', foreground: '#ffffff', borderRadius: '6px' },
        ghost: { hoverBackground: 'rgba(0,0,0,0.12)', foreground: '#333333' },
      },
      input: { background: '#f8f8f8', focus: { border: '#0044ff' } },
      message: {
        user: { background: '#0044ff', text: '#ffffff' },
        assistant: { background: '#f1f1f1', border: '#dddddd' },
      },
    },
  },
};

describe('token pipeline parity (golden)', () => {
  it('default light theme emits a stable full var map', () => {
    expect(fullMap(createLightTheme())).toMatchSnapshot();
  });

  it('default dark theme emits a stable full var map', () => {
    expect(fullMap(createDarkTheme())).toMatchSnapshot();
  });

  for (const [name, override] of Object.entries(FIXTURES)) {
    it(`light + ${name}`, () => {
      expect(fullMap(createLightTheme(override))).toMatchSnapshot();
    });

    it(`dark + ${name}`, () => {
      expect(fullMap(createDarkTheme(override))).toMatchSnapshot();
    });
  }

  it('getActiveTheme layers light overrides under dark overrides in dark scheme', () => {
    const theme = getActiveTheme({
      colorScheme: 'dark',
      theme: { components: { header: { background: '#101010' } } },
      darkTheme: { components: { header: { foreground: '#e0e0e0' } } },
    });
    expect(fullMap(theme)).toMatchSnapshot();
  });

  it('resolveTokens flattens the default theme to a stable path map', () => {
    const resolved = resolveTokens(createTheme());
    const compact = Object.fromEntries(
      Object.entries(resolved)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([path, token]) => [path, `${token.type}:${token.value}`])
    );
    expect(compact).toMatchSnapshot();
  });

  it('default table exports keep their object shapes', () => {
    // Compaction may re-encode the source of these exported tables, but the
    // decoded runtime objects must stay deep-equal. Snapshot them directly.
    expect(DEFAULT_PALETTE).toMatchSnapshot();
    expect(DEFAULT_SEMANTIC).toMatchSnapshot();
    expect(DEFAULT_COMPONENTS).toMatchSnapshot();
  });
});
