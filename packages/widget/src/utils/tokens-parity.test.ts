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

const conditionalAliasTokens: DeepPartial<PersonaTheme> = {
  "components": {
    "header": {
      "shadow": "custom-header-shadow",
      "borderBottom": "custom-header-border-bottom",
      "minHeight": "custom-header-min-height"
    },
    "iconButton": {
      "background": "custom-icon-btn-bg",
      "border": "custom-icon-btn-border",
      "color": "palette.colors.primary.500",
      "padding": "custom-icon-btn-padding",
      "borderRadius": "custom-icon-btn-radius",
      "hoverBackground": "custom-icon-btn-hover-bg",
      "hoverColor": "custom-icon-btn-hover-color",
      "activeBackground": "custom-icon-btn-active-bg",
      "activeBorder": "custom-icon-btn-active-border"
    },
    "labelButton": {
      "background": "custom-label-btn-bg",
      "border": "custom-label-btn-border",
      "color": "custom-label-btn-color",
      "padding": "custom-label-btn-padding",
      "borderRadius": "custom-label-btn-radius",
      "hoverBackground": "custom-label-btn-hover-bg",
      "fontSize": "custom-label-btn-font-size",
      "gap": "custom-label-btn-gap"
    },
    "toggleGroup": {
      "gap": "custom-toggle-group-gap",
      "borderRadius": "custom-toggle-group-radius"
    },
    "artifact": {
      "toolbar": {
        "iconHoverColor": "custom-artifact-toolbar-icon-hover-color",
        "iconHoverBackground": "custom-artifact-toolbar-icon-hover-bg",
        "iconPadding": "custom-artifact-toolbar-icon-padding",
        "iconBorderRadius": "custom-artifact-toolbar-icon-radius",
        "iconBorder": "custom-artifact-toolbar-icon-border",
        "toggleBorderRadius": "custom-artifact-toolbar-toggle-radius",
        "toggleGroupBorder": "custom-artifact-toolbar-toggle-group-border",
        "toggleGroupBorderRadius": "custom-artifact-toolbar-toggle-group-radius",
        "copyBackground": "custom-artifact-toolbar-copy-bg",
        "copyBorder": "custom-artifact-toolbar-copy-border",
        "copyColor": "custom-artifact-toolbar-copy-color",
        "copyPadding": "custom-artifact-toolbar-copy-padding",
        "iconBackground": "custom-artifact-toolbar-icon-bg",
        "toolbarBorder": "custom-artifact-toolbar-border"
      },
      "tab": {
        "background": "custom-artifact-tab-bg",
        "activeBackground": "custom-artifact-tab-active-bg",
        "activeBorder": "custom-artifact-tab-active-border",
        "borderRadius": "custom-artifact-tab-radius",
        "textColor": "custom-artifact-tab-color",
        "hoverBackground": "custom-artifact-tab-hover-bg",
        "listBackground": "custom-artifact-tab-list-bg",
        "listBorderColor": "custom-artifact-tab-list-border-color",
        "listPadding": "custom-artifact-tab-list-padding"
      },
      "card": {
        "border": "custom-artifact-card-border"
      },
      "inline": {
        "border": "custom-artifact-inline-border",
        "frameHeight": "custom-artifact-inline-frame-height"
      }
    },
    "code": {
      "keywordColor": "palette.colors.error.500",
      "stringColor": "custom-code-string-color",
      "commentColor": "custom-code-comment-color",
      "numberColor": "custom-code-number-color",
      "tagColor": "custom-code-tag-color",
      "attrColor": "custom-code-attr-color",
      "propertyColor": "custom-code-property-color",
      "lineNumberColor": "custom-code-line-number-color",
      "gutterBorderColor": "custom-code-gutter-border-color"
    },
    "history": {
      "overlay": {
        "margin": "custom-history-overlay-margin",
        "borderRadius": "custom-history-overlay-borderRadius",
        "shadow": "custom-history-overlay-shadow",
        "background": "custom-history-overlay-background"
      },
      "menu": {
        "background": "custom-history-menu-background",
        "borderRadius": "custom-history-menu-borderRadius"
      },
      "railHeader": {
        "background": "custom-history-railHeader-background",
        "border": "custom-history-railHeader-border",
        "minHeight": "custom-history-railHeader-minHeight"
      }
    },
    "tooltip": {
      "background": "custom-tooltip-background",
      "foreground": "custom-tooltip-foreground",
      "hintForeground": "custom-tooltip-hintForeground",
      "borderRadius": "custom-tooltip-borderRadius",
      "fontSize": "custom-tooltip-fontSize",
      "padding": "custom-tooltip-padding",
      "maxWidth": "custom-tooltip-maxWidth",
      "shadow": "custom-tooltip-shadow"
    },
    "scrollToBottom": {
      "countBadge": {
        "background": "custom-scrollToBottom-countBadge-background",
        "foreground": "custom-scrollToBottom-countBadge-foreground",
        "border": "custom-scrollToBottom-countBadge-border",
        "borderRadius": "custom-scrollToBottom-countBadge-borderRadius",
        "size": "custom-scrollToBottom-countBadge-size",
        "padding": "custom-scrollToBottom-countBadge-padding",
        "fontSize": "custom-scrollToBottom-countBadge-fontSize",
        "fontWeight": "custom-scrollToBottom-countBadge-fontWeight"
      }
    },
    "messageActions": {
      "background": "custom-messageActions-background",
      "border": "custom-messageActions-border",
      "hoverBackground": "custom-messageActions-hoverBackground",
      "hoverForeground": "custom-messageActions-hoverForeground",
      "borderRadius": "custom-messageActions-borderRadius"
    },
    "markdown": {
      "heading": {
        "h1": {
          "fontSize": "custom-markdown-heading-h1-fontSize",
          "fontWeight": "custom-markdown-heading-h1-fontWeight"
        },
        "h2": {
          "fontSize": "custom-markdown-heading-h2-fontSize",
          "fontWeight": "custom-markdown-heading-h2-fontWeight"
        }
      }
    }
  }
};
const emptyConditionalAliasTokens = JSON.parse(JSON.stringify(conditionalAliasTokens), (_key, value) => typeof value === 'string' ? '' : value) as DeepPartial<PersonaTheme>;

const FIXTURES: Record<string, DeepPartial<PersonaTheme>> = {
  'custom conditional aliases (raw references stay raw)': conditionalAliasTokens,
  'empty conditional aliases retain their fallback semantics': emptyConditionalAliasTokens,
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
  'flat dark surface (white-alpha interactive washes)': {
    semantic: { colors: { surface: '#0e111b', background: '#0e111b', container: '#0e111b' } },
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
  'message geometry + stop button tokens': {
    components: {
      message: {
        user: {
          padding: '0.5rem 0.875rem',
          maxWidth: '48rem',
          fontSize: '1rem',
          fontFamily: 'Georgia, serif',
          lineHeight: '1.6',
        },
        assistant: {
          padding: '0 0',
          maxWidth: '100%',
          fontSize: '1.0625rem',
          fontFamily: 'Georgia, serif',
        },
      },
      button: { stop: { background: '#e5e5e5', foreground: '#111111' } },
    },
  },
  'composer overlay band + input backdrop filter': {
    components: {
      composer: { overlayBand: 'linear-gradient(180deg, rgba(0,0,0,0) 0, #000 96px)' },
      input: { backdropFilter: 'blur(8px)' },
    },
  },
  'intro card kicker typography': {
    components: {
      introCard: {
        kicker: { fontSize: '0.75rem', letterSpacing: '0.04em', color: '#8a8a82' },
      },
    },
  },
  'composer segmented mode track': {
    components: {
      composer: {
        segmented: {
          trackBackground: '#e8e6dc',
          trackBorderRadius: '10px',
          padding: '3px',
          activeBackground: '#ffffff',
          activeForeground: '#141413',
          activeShadow: '0 1px 3px rgba(0,0,0,0.16)',
          inactiveForeground: '#6b6a63',
          itemPadding: '0.3125rem 0.75rem',
        },
      },
    },
  },
  'composer model picker popover': {
    components: {
      composer: {
        modelPicker: {
          menuBackground: '#ffffff',
          menuBorderRadius: '12px',
          rowHoverBackground: 'palette.colors.gray.100',
          labelColor: '#141413',
          descriptionColor: '#6b6a63',
          suffixColor: '#8a8a82',
        },
      },
    },
  },
  'composer model picker closed control + overflow menu': {
    components: {
      composer: {
        modelPicker: {
          background: '#303030',
          hoverBackground: '#3f3f3f',
          borderColor: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '9999px',
          labelColor: '#c4c7c5',
        },
        overflowMenu: {
          background: '#353535',
          borderColor: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          foreground: '#ececec',
          shadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
        },
      },
    },
  },
};

describe('token pipeline parity (golden)', () => {
  for (const makeTheme of [createLightTheme, createDarkTheme]) {
    it(`${makeTheme.name} resolves artifact aliases while retaining raw borders and heights`, () => {
      const reference = 'palette.colors.primary.500';
      const theme = makeTheme({
        palette: { colors: { primary: { 500: '#123abc' } } },
        components: {
          artifact: {
            card: {
              background: reference,
              border: reference,
              borderRadius: 'palette.radius.lg',
              hoverBackground: reference,
              hoverBorderColor: 'unresolved-reference',
            },
            inline: {
              background: reference,
              border: reference,
              borderRadius: 'palette.radius.lg',
              chromeBackground: reference,
              chromeBorder: reference,
              titleColor: reference,
              mutedColor: reference,
              frameHeight: 'palette.spacing.4',
            },
          },
        },
      });
      const vars = themeToCssVariables(theme);
      expect(Object.fromEntries(Object.entries(vars).filter(([key]) =>
        key.startsWith('--persona-artifact-card-') || key.startsWith('--persona-artifact-inline-')
      ))).toEqual({
        '--persona-artifact-card-bg': '#123abc',
        '--persona-artifact-card-border': reference,
        '--persona-artifact-card-radius': theme.palette.radius.lg,
        '--persona-artifact-card-hover-bg': '#123abc',
        '--persona-artifact-card-hover-border': 'unresolved-reference',
        '--persona-artifact-inline-bg': '#123abc',
        '--persona-artifact-inline-border': reference,
        '--persona-artifact-inline-radius': theme.palette.radius.lg,
        '--persona-artifact-inline-chrome-bg': '#123abc',
        '--persona-artifact-inline-chrome-border': '#123abc',
        '--persona-artifact-inline-title-color': '#123abc',
        '--persona-artifact-inline-muted-color': '#123abc',
        '--persona-artifact-inline-frame-height': 'palette.spacing.4',
      });
    });

    it(`${makeTheme.name} skips empty artifact aliases and keeps the hover fallback`, () => {
      const theme = makeTheme({
        components: {
          artifact: {
            card: { background: '', border: '', borderRadius: '', hoverBackground: '', hoverBorderColor: '' },
            inline: { background: '', border: '', borderRadius: '', chromeBackground: '', chromeBorder: '', titleColor: '', mutedColor: '', frameHeight: '' },
          },
        },
      });
      const vars = themeToCssVariables(theme);
      expect(Object.fromEntries(Object.entries(vars).filter(([key]) =>
        key.startsWith('--persona-artifact-card-') || key.startsWith('--persona-artifact-inline-')
      ))).toEqual({
        '--persona-artifact-card-hover-bg': vars['--persona-icon-btn-hover-bg'],
      });
    });
  }

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
