/**
 * Theme Reference — Structured documentation and examples for the Persona v2 theme system.
 *
 * Exported via the `@runtypelabs/persona/theme-reference` entry point so it stays
 * out of the IIFE widget bundle. Intended for AI/MCP tool consumption.
 */

import { DEFAULT_PALETTE } from './utils/tokens'
import type { DeepPartial, PersonaTheme } from './types/theme'

// ---------------------------------------------------------------------------
// Token System Documentation
// ---------------------------------------------------------------------------

export const THEME_TOKEN_DOCS = {
  overview:
    'Persona uses a three-layer design token system: palette → semantic → components. Most themes only need palette.colors overrides — semantic and component layers auto-derive from palette values. Config also accepts non-theme appearance options (launcher, sendButton, toolCall, etc.).',

  layers: {
    palette: {
      description:
        'Primitive design tokens. Override specific shades to change the entire widget feel.',
      colors: {
        description:
          '7 color scales, each with shades 50 (lightest) to 950 (darkest). Override only the shades you need.',
        scales: {
          gray: 'Neutrals — backgrounds, text, borders. Key shades: 50 (lightest bg), 100 (secondary bg), 200 (borders), 500 (muted text), 900 (primary text).',
          primary:
            'Brand color — buttons, links, interactive elements. Key shades: 500 (default), 600 (hover).',
          accent: 'Secondary highlight. Key shades: 500 (default), 600 (hover).',
          secondary: 'Tertiary color scale.',
          success: 'Positive feedback (default: green).',
          warning: 'Caution feedback (default: yellow).',
          error: 'Error/danger feedback (default: red).',
        },
      },
      radius: {
        description: 'Border radius scale. Add custom keys like launcher, button.',
        defaults: {
          none: '0px',
          sm: '0.125rem',
          md: '0.375rem',
          lg: '0.5rem',
          xl: '0.75rem',
          '2xl': '1rem',
          full: '9999px',
        },
      },
      typography: {
        fontFamily:
          'Three stacks: sans (system-ui), serif (Georgia), mono (ui-monospace). Override individual stack values.',
        fontSize:
          'Scale: xs (0.75rem), sm (0.875rem), base (1rem), lg (1.125rem), xl (1.25rem), 2xl (1.5rem), 3xl (1.875rem), 4xl (2.25rem).',
        fontWeight: 'normal (400), medium (500), semibold (600), bold (700).',
        lineHeight: 'tight (1.25), normal (1.5), relaxed (1.625).',
      },
      shadows:
        'Scale: none, sm, md, lg, xl, 2xl. Values are CSS box-shadow strings.',
      borders: 'Scale: none, sm (1px solid), md (2px solid), lg (4px solid).',
      spacing:
        'Scale: 0 (0px), 1 (0.25rem), 2 (0.5rem), 3 (0.75rem), 4 (1rem), 5 (1.25rem), 6 (1.5rem), 8 (2rem), 10 (2.5rem), 12 (3rem), 16-64.',
    },

    semantic: {
      description:
        'Design intent tokens. Auto-derived from palette by default. Override to redirect token resolution. Values are token reference strings like "palette.colors.primary.500".',
      colors: {
        primary: 'palette.colors.primary.500 — Primary brand color.',
        secondary: 'palette.colors.gray.500 — Secondary color.',
        accent: 'palette.colors.primary.600 — Accent/interactive color.',
        surface: 'palette.colors.gray.50 — Panel/card backgrounds.',
        background: 'palette.colors.gray.50 — Page background.',
        container: 'palette.colors.gray.100 — Container backgrounds.',
        text: 'palette.colors.gray.900 — Primary text.',
        textMuted: 'palette.colors.gray.500 — Muted/secondary text.',
        textInverse: 'palette.colors.gray.50 — Text on dark backgrounds.',
        border: 'palette.colors.gray.200 — Default border color.',
        divider: 'palette.colors.gray.200 — Divider lines.',
        interactive: {
          default: 'palette.colors.primary.500',
          hover: 'palette.colors.primary.600',
          focus: 'palette.colors.primary.700',
          active: 'palette.colors.primary.800',
          disabled: 'palette.colors.gray.300',
        },
        feedback: {
          success: 'palette.colors.success.500',
          warning: 'palette.colors.warning.500',
          error: 'palette.colors.error.500',
          info: 'palette.colors.primary.500',
        },
      },
      spacing:
        'xs (0.25rem), sm (0.5rem), md (1rem), lg (1.5rem), xl (2rem), 2xl (2.5rem).',
      typography:
        'fontFamily, fontSize, fontWeight, lineHeight — reference palette typography tokens.',
    },

    components: {
      description:
        'UI element tokens. Rarely needed for basic theming. Override for fine-grained control. All values are token references or raw CSS strings.',
      button: {
        description: 'Three variants: primary, secondary, ghost.',
        properties: 'background, foreground, borderRadius, padding.',
      },
      input: {
        description: 'Message input field.',
        properties:
          'background, placeholder, borderRadius, padding, focus.border, focus.ring.',
      },
      launcher: {
        description: 'Floating launcher button.',
        properties: 'size (60px), iconSize (28px), borderRadius, shadow.',
      },
      panel: {
        description: 'Chat panel container.',
        properties:
          'width, maxWidth (440px), height (600px), maxHeight, borderRadius, shadow.',
      },
      header: {
        description: 'Chat panel header.',
        properties:
          'background, border, borderRadius, padding, iconBackground, iconForeground, titleForeground, subtitleForeground, actionIconForeground, shadow, borderBottom.',
      },
      message: {
        description: 'Chat message bubbles.',
        user: 'background, text, borderRadius, shadow.',
        assistant:
          'background, text, borderRadius, border (optional), shadow (optional).',
      },
      markdown: {
        description: 'Markdown rendering in messages and artifact pane.',
        properties:
          'inlineCode (background, foreground), link.foreground, prose.fontFamily, heading.h1/h2 (fontSize, fontWeight).',
      },
      voice:
        'recording (indicator, background, border), processing (icon, background), speaking (icon).',
      approval:
        'requested (background, border, text), approve (background, foreground), deny (background, foreground).',
      attachment: 'image (background, border).',
      scrollToBottom:
        'Floating scroll-to-bottom affordance shared by transcript and event stream: background, foreground, border, size, borderRadius, shadow, padding, gap, fontSize, iconSize.',
      toolBubble: 'shadow — tool call row box-shadow.',
      reasoningBubble: 'shadow — reasoning/thinking row box-shadow.',
      composer: 'shadow — message input form box-shadow.',
      artifact:
        'toolbar (icon styling, copy menu), tab (background, active states), pane (background, toolbarBackground).',
    },
  },

  colorScheme:
    '"dark" merges darkTheme overrides on top of theme. "auto" detects system preference or <html class="dark">. "light" is default. colorScheme does NOT auto-invert colors — provide dark palette and semantic overrides yourself.',

  plugins: {
    description:
      'Plugins transform theme tokens before resolution. Use with createTheme().',
    available: {
      brandPlugin:
        'Auto-generates full color scales from a single brand hex: brandPlugin({ colors: { primary: "#7c3aed" } }).',
      accessibilityPlugin:
        'Enhanced focus indicators and disabled states.',
      highContrastPlugin: 'Increased contrast for visual accessibility.',
      reducedMotionPlugin:
        'Disables all animations (sets transitions to 0ms).',
      animationsPlugin: 'Adds transition and easing tokens.',
    },
    usage:
      'createTheme(themeOverrides, { plugins: [brandPlugin({ colors: { primary: "#7c3aed" } })] })',
  },

  widgetConfig: {
    description:
      'Non-theme config options on the widget config object that affect appearance. These are siblings of "theme" in the config, not nested inside it.',
    launcher: {
      description: 'Floating launcher button and panel positioning.',
      properties: {
        enabled: 'Show/hide the launcher button.',
        title: 'Header title text.',
        subtitle: 'Header subtitle text.',
        position:
          '"bottom-right" | "bottom-left" | "top-right" | "top-left".',
        width: 'Chat panel width (CSS value).',
        fullHeight: 'Fill full height of container.',
        mountMode: '"floating" | "docked".',
        agentIconText: 'Emoji/text for agent icon.',
        border: 'Border style for launcher button.',
        shadow: 'Box shadow for launcher button.',
        collapsedMaxWidth: 'Max-width for launcher pill when panel closed.',
      },
    },
    sendButton: {
      description: 'Send button appearance.',
      properties:
        'backgroundColor, textColor, borderWidth, borderColor, paddingX, paddingY, iconText, iconName, size.',
    },
    closeButton: {
      description: 'Close button (on launcher config).',
      properties:
        'closeButtonSize, closeButtonColor, closeButtonBackgroundColor, closeButtonBorderWidth, closeButtonBorderColor, closeButtonBorderRadius.',
    },
    clearChat: {
      description: 'Clear chat button (on launcher.clearChat config).',
      properties:
        'enabled, iconColor, backgroundColor, borderWidth, borderColor, borderRadius, size.',
    },
    scrollToBottom: {
      description:
        'Shared transcript + event-stream jump-to-latest affordance.',
      properties:
        'features.scrollToBottom.enabled, features.scrollToBottom.iconName, features.scrollToBottom.label (empty string renders icon-only). Defaults: enabled=true, iconName="arrow-down", label="".',
    },
    toolCall: {
      description:
        'Tool call display styling, text templates, loading animations, and rendering hooks. ' +
        'Text templates support placeholders ({toolName}, {duration}) and inline formatting (~dim~, *italic*, **bold**). ' +
        'renderCollapsedSummary receives elapsed (static string) and createElapsedElement() (live-updating span) in its context.',
      properties:
        'shadow, backgroundColor, borderColor, borderWidth, borderRadius, headerBackgroundColor, headerTextColor, headerPaddingX, headerPaddingY, contentBackgroundColor, contentTextColor, contentPaddingX, contentPaddingY, codeBlockBackgroundColor, codeBlockBorderColor, codeBlockTextColor, toggleTextColor, labelTextColor, activeTextTemplate, completeTextTemplate, loadingAnimationColor, loadingAnimationSecondaryColor, loadingAnimationDuration, renderCollapsedSummary, renderCollapsedPreview, renderGroupedSummary.',
    },
    reasoning: {
      description: 'Reasoning/thinking row rendering hooks.',
      properties:
        'renderCollapsedSummary, renderCollapsedPreview.',
    },
    approval: {
      description:
        'Tool approval bubble styling and behavior. Set to false to disable.',
      properties:
        'backgroundColor, borderColor, titleColor, descriptionColor, approveButtonColor, approveButtonTextColor, denyButtonColor, denyButtonTextColor, parameterBackgroundColor, parameterTextColor, title, approveLabel, denyLabel.',
    },
    copy: {
      description: 'Widget text content.',
      properties:
        'showWelcomeCard (boolean), welcomeTitle, welcomeSubtitle, inputPlaceholder, sendButtonLabel.',
    },
    voiceRecognition: {
      description: 'Voice input configuration.',
      properties: 'enabled, pauseDuration, iconColor, backgroundColor.',
    },
    textToSpeech: {
      description: 'Text-to-speech for assistant messages.',
      properties:
        'enabled, provider ("browser" | "runtype"), browserFallback, voice, rate, pitch.',
    },
    suggestionChips:
      'string[] — Suggested prompts shown to the user.',
    messageActions: {
      description: 'Message action buttons (copy, upvote, downvote).',
      properties:
        'enabled, showCopy, showUpvote, showDownvote, visibility ("hover" | "always"), align ("left" | "center" | "right"), layout ("pill-inside" | "row-inside").',
    },
    attachments: {
      description: 'File attachment configuration.',
      properties:
        'enabled, allowedTypes (string[]), maxFileSize (bytes), maxFiles, buttonIconName, buttonTooltipText.',
    },
    markdown: {
      description: 'Markdown rendering configuration.',
      properties:
        'options (gfm, breaks, headerIds, headerPrefix, pedantic, mangle, silent), disableDefaultStyles.',
    },
    layout: {
      description: 'Layout configuration.',
      showHeader: 'boolean — show/hide the header section entirely.',
      showFooter: 'boolean — show/hide the footer/composer section entirely.',
      contentMaxWidth:
        'CSS width value for centering content (e.g. "720px", "90ch").',
      header:
        '"default" | "minimal". Options: showIcon, showTitle, showSubtitle, showCloseButton, showClearChat.',
      messages:
        '"bubble" | "flat" | "minimal". Options: groupConsecutive, avatar (show, position, userAvatar, assistantAvatar), timestamp (show, position).',
    },
    statusIndicator: {
      description: 'Status text shown below the composer.',
      properties: {
        visible: 'Show/hide the status indicator.',
        align: '"left" | "center" | "right" — text alignment (default: "right").',
        idleText: 'Text shown when idle (default: "Online").',
        idleLink: 'URL to open when idle text is clicked (wraps text in a link).',
        connectingText: 'Text shown while connecting (default: "Connecting…").',
        connectedText: 'Text shown while streaming (default: "Streaming…").',
        errorText: 'Text shown on error (default: "Offline").',
      },
    },
    features: {
      description: 'Feature flags.',
      properties:
        'showReasoning (AI thinking steps), showToolCalls (tool invocations), toolCallDisplay (collapsedMode, activePreview, activeMinHeight, previewMaxLines, grouped, expandable, loadingAnimation), reasoningDisplay (activePreview, activeMinHeight, previewMaxLines), artifacts (sidebar config).',
    },
  },
}

// ---------------------------------------------------------------------------
// Example Themes
// ---------------------------------------------------------------------------

export interface ThemeExample {
  description: string
  colorScheme?: 'light' | 'dark' | 'auto'
  theme: DeepPartial<PersonaTheme>
}

export const THEME_EXAMPLES: Record<string, ThemeExample> = {
  darkIndigo: {
    description:
      'Dark mode with indigo accent — override grays for dark backgrounds and semantic tokens for inverted text/surface',
    theme: {
      palette: {
        colors: {
          primary: { 500: '#6366f1', 600: '#4f46e5' },
          gray: {
            50: '#f1f5f9',
            100: '#1e293b',
            200: '#334155',
            500: '#94a3b8',
            900: '#0f172a',
            950: '#020617',
          },
        },
      },
      semantic: {
        colors: {
          surface: 'palette.colors.gray.900',
          background: 'palette.colors.gray.900',
          container: 'palette.colors.gray.100',
          text: 'palette.colors.gray.50',
          textMuted: 'palette.colors.gray.500',
          textInverse: 'palette.colors.gray.900',
          border: 'palette.colors.gray.200',
        },
      },
    },
  },
  warmVintage: {
    description: 'Warm sepia tones with serif font and subtle radius',
    theme: {
      palette: {
        colors: {
          primary: { 500: '#b45309', 600: '#92400e' },
          gray: {
            50: '#fef3c7',
            100: '#fef9c3',
            200: '#d6d3d1',
            500: '#78716c',
            900: '#44403c',
          },
        },
        radius: { sm: '0.125rem', md: '0.25rem', lg: '0.375rem' },
        typography: {
          fontFamily: {
            sans: 'Georgia, Cambria, "Times New Roman", Times, serif',
          },
        },
      },
    },
  },
  neonCyberpunk: {
    description:
      'Neon on dark with monospace font — full semantic override for dark background',
    theme: {
      palette: {
        colors: {
          primary: { 500: '#f0abfc', 600: '#e879f9' },
          accent: { 500: '#22d3ee', 600: '#06b6d4' },
          gray: {
            50: '#f0abfc',
            100: '#1e0a3c',
            200: '#3b0764',
            500: '#c084fc',
            900: '#0c0a1a',
            950: '#050412',
          },
        },
        radius: { sm: '0', md: '0.25rem', lg: '0.375rem' },
        typography: {
          fontFamily: {
            sans: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          },
        },
      },
      semantic: {
        colors: {
          surface: 'palette.colors.gray.900',
          background: 'palette.colors.gray.950',
          container: 'palette.colors.gray.100',
          text: 'palette.colors.gray.50',
          textMuted: 'palette.colors.gray.500',
          border: 'palette.colors.gray.200',
        },
      },
    },
  },
  cleanRounded: {
    description: 'Clean light theme with large radius and panel styling',
    theme: {
      palette: {
        radius: {
          sm: '6px',
          md: '8px',
          lg: '12px',
          launcher: '50px',
          button: '8px',
        },
      },
      components: {
        panel: { borderRadius: '16px', shadow: 'palette.shadows.2xl' },
      },
    },
  },
}

// ---------------------------------------------------------------------------
// Reference Payload
// ---------------------------------------------------------------------------

/**
 * Complete theme reference payload for AI / MCP tool consumption.
 *
 * Returns token system docs, the default color palette and radius scale,
 * example themes, and a list of SDK-bundled presets.
 */
export function getThemeReference() {
  return {
    tokenDocs: THEME_TOKEN_DOCS,
    defaultColorPalette: DEFAULT_PALETTE.colors,
    defaultRadius: DEFAULT_PALETTE.radius,
    examples: THEME_EXAMPLES,
    sdkPresets: ['shop', 'minimal', 'fullscreen'],
  }
}
