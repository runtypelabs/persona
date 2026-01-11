import type { AgentWidgetConfig, AgentWidgetTheme } from "./types";

/**
 * Default light theme colors
 */
export const DEFAULT_LIGHT_THEME: AgentWidgetTheme = {
  primary: "#111827",
  accent: "#1d4ed8",
  surface: "#ffffff",
  muted: "#6b7280",
  container: "#f8fafc",
  border: "#f1f5f9",
  divider: "#f1f5f9",
  messageBorder: "#f1f5f9",
  inputBackground: "#ffffff",
  callToAction: "#000000",
  callToActionBackground: "#ffffff",
  sendButtonBackgroundColor: "#111827",
  sendButtonTextColor: "#ffffff",
  sendButtonBorderColor: "#60a5fa",
  closeButtonColor: "#6b7280",
  closeButtonBackgroundColor: "transparent",
  closeButtonBorderColor: "",
  clearChatIconColor: "#6b7280",
  clearChatBackgroundColor: "transparent",
  clearChatBorderColor: "transparent",
  micIconColor: "#111827",
  micBackgroundColor: "transparent",
  micBorderColor: "transparent",
  recordingIconColor: "#ffffff",
  recordingBackgroundColor: "#ef4444",
  recordingBorderColor: "transparent",
  inputFontFamily: "sans-serif",
  inputFontWeight: "400",
  radiusSm: "0.75rem",
  radiusMd: "1rem",
  radiusLg: "1.5rem",
  launcherRadius: "9999px",
  buttonRadius: "9999px",
};

/**
 * Default dark theme colors
 */
export const DEFAULT_DARK_THEME: AgentWidgetTheme = {
  primary: "#f9fafb",
  accent: "#3b82f6",
  surface: "#1f2937",
  muted: "#9ca3af",
  container: "#111827",
  border: "#374151",
  divider: "#374151",
  messageBorder: "#374151",
  inputBackground: "#111827",
  callToAction: "#ffffff",
  callToActionBackground: "#374151",
  sendButtonBackgroundColor: "#3b82f6",
  sendButtonTextColor: "#ffffff",
  sendButtonBorderColor: "#60a5fa",
  closeButtonColor: "#9ca3af",
  closeButtonBackgroundColor: "transparent",
  closeButtonBorderColor: "",
  clearChatIconColor: "#9ca3af",
  clearChatBackgroundColor: "transparent",
  clearChatBorderColor: "transparent",
  micIconColor: "#f9fafb",
  micBackgroundColor: "transparent",
  micBorderColor: "transparent",
  recordingIconColor: "#ffffff",
  recordingBackgroundColor: "#ef4444",
  recordingBorderColor: "transparent",
  inputFontFamily: "sans-serif",
  inputFontWeight: "400",
  radiusSm: "0.75rem",
  radiusMd: "1rem",
  radiusLg: "1.5rem",
  launcherRadius: "9999px",
  buttonRadius: "9999px",
};

/**
 * Default widget configuration
 * Single source of truth for all default values
 */
export const DEFAULT_WIDGET_CONFIG: Partial<AgentWidgetConfig> = {
  apiUrl: "http://localhost:43111/api/chat/dispatch",
  // Client token mode defaults (optional, only used when clientToken is set)
  clientToken: undefined,
  theme: DEFAULT_LIGHT_THEME,
  darkTheme: DEFAULT_DARK_THEME,
  colorScheme: "light",
  launcher: {
    enabled: true,
    title: "Chat Assistant",
    subtitle: "Here to help you get answers fast",
    agentIconText: "💬",
    position: "bottom-right",
    width: "min(400px, calc(100vw - 24px))",
    heightOffset: 0,
    autoExpand: false,
    callToActionIconHidden: false,
    agentIconSize: "40px",
    headerIconSize: "40px",
    closeButtonSize: "32px",
    callToActionIconName: "arrow-up-right",
    callToActionIconText: "",
    callToActionIconSize: "32px",
    callToActionIconPadding: "5px",
    callToActionIconColor: "#000000",
    callToActionIconBackgroundColor: "#ffffff",
    closeButtonColor: "#6b7280",
    closeButtonBackgroundColor: "transparent",
    clearChat: {
      iconColor: "#6b7280",
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
    border: "1px solid #e5e7eb",
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
    backgroundColor: "#111827",
    textColor: "#ffffff",
    borderColor: "#60a5fa",
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
    iconColor: "#111827",
    backgroundColor: "transparent",
    borderColor: "transparent",
    recordingIconColor: "#ffffff",
    recordingBackgroundColor: "#ef4444",
    recordingBorderColor: "transparent",
    showTooltip: true,
    tooltipText: "Start voice recognition",
  },
  features: {
    showReasoning: true,
    showToolCalls: true,
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
    showUpvote: false,  // Requires backend - disabled by default
    showDownvote: false, // Requires backend - disabled by default
    visibility: "hover",
    align: "right",
    layout: "pill-inside",
  },
  debug: false,
};

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
    theme: {
      ...DEFAULT_WIDGET_CONFIG.theme,
      ...config.theme,
    },
    darkTheme: {
      ...DEFAULT_WIDGET_CONFIG.darkTheme,
      ...config.darkTheme,
    },
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      ...config.launcher,
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
    features: {
      ...DEFAULT_WIDGET_CONFIG.features,
      ...config.features,
    },
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
