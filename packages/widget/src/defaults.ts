import type { AgentWidgetConfig } from "./types";
import type { DeepPartial, PersonaTheme } from "./types/theme";
import { deepMerge } from "./utils/deep-merge";

/**
 * Default width for the floating launcher panel (when not overridden).
 * Benchmarks: many chat products use ~300–400px; 400px is a frequent “standard” default.
 * We use 440px to better fit code/JSON and structured replies while staying responsive via `min(..., 100vw)`.
 */
export const DEFAULT_FLOATING_LAUNCHER_WIDTH = "min(440px, calc(100vw - 24px))";

/** Max width cap paired with {@link DEFAULT_FLOATING_LAUNCHER_WIDTH} for theme defaults. */
export const DEFAULT_FLOATING_LAUNCHER_MAX_WIDTH = "440px";

/**
 * Default widget configuration
 * Single source of truth for all default values
 */
export const DEFAULT_WIDGET_CONFIG: Partial<AgentWidgetConfig> = {
  apiUrl: "https://api.runtype.com/api/chat/dispatch",
  // Client token mode defaults (optional, only used when clientToken is set)
  clientToken: undefined,
  theme: undefined,
  darkTheme: undefined,
  colorScheme: "light",
  launcher: {
    enabled: true,
    mountMode: "floating",
    dock: {
      side: "right",
      width: "420px",
    },
    title: "Chat Assistant",
    subtitle: "Here to help you get answers fast",
    agentIconText: "💬",
    agentIconName: "bot",
    headerIconName: "bot",
    position: "bottom-right",
    width: DEFAULT_FLOATING_LAUNCHER_WIDTH,
    heightOffset: 0,
    autoExpand: false,
    callToActionIconHidden: false,
    agentIconSize: "40px",
    headerIconSize: "40px",
    closeButtonSize: "32px",
    // Zero out browser-default <button> padding so the icon gets the full
    // 32x32 content box, matching clearChat.paddingX/Y below. Without this,
    // UA stylesheets add ~1-2px vertical and ~6px horizontal padding that
    // eats into the border-box width and shrinks the rendered icon.
    closeButtonPaddingX: "0px",
    closeButtonPaddingY: "0px",
    callToActionIconName: "arrow-up-right",
    callToActionIconText: "",
    callToActionIconSize: "32px",
    callToActionIconPadding: "5px",
    callToActionIconColor: undefined,
    callToActionIconBackgroundColor: undefined,
    // closeButtonColor / clearChat.iconColor omitted so theme.components.header.actionIconForeground applies.
    closeButtonBackgroundColor: "transparent",
    clearChat: {
      backgroundColor: "transparent",
      borderColor: "transparent",
      enabled: true,
      placement: "inline",
      iconName: "refresh-cw",
      size: "32px",
      showTooltip: true,
      tooltipText: "Clear chat",
      paddingX: "0px",
      paddingY: "0px",
    },
    headerIconHidden: false,
    border: undefined,
    shadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
  },
  copy: {
    welcomeTitle: "Hello 👋",
    welcomeSubtitle: "Ask anything about your account or products.",
    inputPlaceholder: "How can I help...",
    sendButtonLabel: "Send",
  },
  sendButton: {
    borderWidth: "0px",
    paddingX: "12px",
    paddingY: "10px",
    borderColor: undefined,
    useIcon: true,
    iconText: "↑",
    size: "40px",
    showTooltip: true,
    tooltipText: "Send message",
    iconName: "send",
  },
  statusIndicator: {
    visible: true,
    idleText: "Online",
    connectingText: "Connecting…",
    connectedText: "Streaming…",
    errorText: "Offline",
  },
  voiceRecognition: {
    enabled: true,
    pauseDuration: 2000,
    iconName: "mic",
    iconSize: "39px",
    borderWidth: "0px",
    paddingX: "9px",
    paddingY: "14px",
    iconColor: undefined,
    backgroundColor: "transparent",
    borderColor: "transparent",
    recordingIconColor: undefined,
    recordingBackgroundColor: undefined,
    recordingBorderColor: "transparent",
    showTooltip: true,
    tooltipText: "Start voice recognition",
  },
  features: {
    showReasoning: true,
    showToolCalls: true,
    scrollToBottom: {
      enabled: true,
      iconName: "arrow-down",
      label: "",
    },
    toolCallDisplay: {
      collapsedMode: "tool-call",
      activePreview: false,
      grouped: false,
      previewMaxLines: 3,
      expandable: true,
      loadingAnimation: "none",
    },
    reasoningDisplay: {
      activePreview: false,
      previewMaxLines: 3,
      expandable: true,
      loadingAnimation: "none",
    },
    streamAnimation: {
      type: "none",
      placeholder: "none",
      speed: 120,
      duration: 1800,
    },
  },
  suggestionChips: [
    "What can you help me with?",
    "Tell me about your features",
    "How does this work?",
  ],
  suggestionChipsConfig: {
    fontFamily: "sans-serif",
    fontWeight: "500",
    paddingX: "12px",
    paddingY: "6px",
  },
  layout: {
    header: {
      layout: "default",
      showIcon: true,
      showTitle: true,
      showSubtitle: true,
      showCloseButton: true,
      showClearChat: true,
    },
    messages: {
      layout: "bubble",
      avatar: {
        show: false,
        position: "left",
      },
      timestamp: {
        show: false,
        position: "below",
      },
      groupConsecutive: false,
    },
    slots: {},
  },
  markdown: {
    options: {
      gfm: true,
      breaks: true,
    },
    disableDefaultStyles: false,
  },
  messageActions: {
    enabled: true,
    showCopy: true,
    showUpvote: false, // Requires backend - disabled by default
    showDownvote: false, // Requires backend - disabled by default
    visibility: "hover",
    align: "right",
    layout: "pill-inside",
  },
  debug: false,
};

function mergeThemePartials(
  base: DeepPartial<PersonaTheme> | undefined,
  override: DeepPartial<PersonaTheme> | undefined
): DeepPartial<PersonaTheme> | undefined {
  if (!base && !override) return undefined;
  if (!base) return override;
  if (!override) return base;
  return deepMerge(
    base as Record<string, unknown>,
    override as Record<string, unknown>
  ) as DeepPartial<PersonaTheme>;
}

/**
 * Helper to deep merge user config with defaults
 * This ensures all default values are present while allowing selective overrides
 */
export function mergeWithDefaults(
  config?: Partial<AgentWidgetConfig>
): Partial<AgentWidgetConfig> {
  if (!config) return DEFAULT_WIDGET_CONFIG;

  return {
    ...DEFAULT_WIDGET_CONFIG,
    ...config,
    theme: mergeThemePartials(DEFAULT_WIDGET_CONFIG.theme, config.theme),
    darkTheme: mergeThemePartials(DEFAULT_WIDGET_CONFIG.darkTheme, config.darkTheme),
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      ...config.launcher,
      dock: {
        ...DEFAULT_WIDGET_CONFIG.launcher?.dock,
        ...config.launcher?.dock,
      },
      clearChat: {
        ...DEFAULT_WIDGET_CONFIG.launcher?.clearChat,
        ...config.launcher?.clearChat,
      },
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      ...config.copy,
    },
    sendButton: {
      ...DEFAULT_WIDGET_CONFIG.sendButton,
      ...config.sendButton,
    },
    statusIndicator: {
      ...DEFAULT_WIDGET_CONFIG.statusIndicator,
      ...config.statusIndicator,
    },
    voiceRecognition: {
      ...DEFAULT_WIDGET_CONFIG.voiceRecognition,
      ...config.voiceRecognition,
    },
    features: (() => {
      const da = DEFAULT_WIDGET_CONFIG.features?.artifacts;
      const ca = config.features?.artifacts;
      const dsb = DEFAULT_WIDGET_CONFIG.features?.scrollToBottom;
      const csb = config.features?.scrollToBottom;
      const dsa = DEFAULT_WIDGET_CONFIG.features?.streamAnimation;
      const csa = config.features?.streamAnimation;
      const mergedArtifacts =
        da === undefined && ca === undefined
          ? undefined
          : {
              ...da,
              ...ca,
              layout: {
                ...da?.layout,
                ...ca?.layout,
              },
            };
      const mergedScrollToBottom =
        dsb === undefined && csb === undefined
          ? undefined
          : {
              ...dsb,
              ...csb,
            };
      const mergedStreamAnimation =
        dsa === undefined && csa === undefined
          ? undefined
          : {
              ...dsa,
              ...csa,
            };
      return {
        ...DEFAULT_WIDGET_CONFIG.features,
        ...config.features,
        ...(mergedScrollToBottom !== undefined ? { scrollToBottom: mergedScrollToBottom } : {}),
        ...(mergedArtifacts !== undefined ? { artifacts: mergedArtifacts } : {}),
        ...(mergedStreamAnimation !== undefined ? { streamAnimation: mergedStreamAnimation } : {}),
      };
    })(),
    suggestionChips: config.suggestionChips ?? DEFAULT_WIDGET_CONFIG.suggestionChips,
    suggestionChipsConfig: {
      ...DEFAULT_WIDGET_CONFIG.suggestionChipsConfig,
      ...config.suggestionChipsConfig,
    },
    layout: {
      ...DEFAULT_WIDGET_CONFIG.layout,
      ...config.layout,
      header: {
        ...DEFAULT_WIDGET_CONFIG.layout?.header,
        ...config.layout?.header,
      },
      messages: {
        ...DEFAULT_WIDGET_CONFIG.layout?.messages,
        ...config.layout?.messages,
        avatar: {
          ...DEFAULT_WIDGET_CONFIG.layout?.messages?.avatar,
          ...config.layout?.messages?.avatar,
        },
        timestamp: {
          ...DEFAULT_WIDGET_CONFIG.layout?.messages?.timestamp,
          ...config.layout?.messages?.timestamp,
        },
      },
      slots: {
        ...DEFAULT_WIDGET_CONFIG.layout?.slots,
        ...config.layout?.slots,
      },
    },
    markdown: {
      ...DEFAULT_WIDGET_CONFIG.markdown,
      ...config.markdown,
      options: {
        ...DEFAULT_WIDGET_CONFIG.markdown?.options,
        ...config.markdown?.options,
      },
    },
    messageActions: {
      ...DEFAULT_WIDGET_CONFIG.messageActions,
      ...config.messageActions,
    },
  };
}
