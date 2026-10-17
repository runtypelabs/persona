import type { AgentWidgetConfig, AgentWidgetLauncherConfig } from "./types";
import type { DeepPartial, PersonaTheme } from "./types/theme";
import { deepMerge } from "./utils/deep-merge";
import { DEFAULT_APPROVAL_V5 } from "./utils/approval-config";
import { defaultProvenance, inheritDefaultProvenance } from "./utils/defaults-provenance";
import { inheritPanelAliasProvenance } from "./utils/panel-config";
import { inheritStyleProvenance } from "./utils/style-provenance";
import {
  DEFAULT_TOOLTIP_DELAY_MS,
  DEFAULT_TOOLTIP_SKIP_DELAY_MS,
} from "./utils/tooltip-timing";

/**
 * Default width for the floating launcher panel (when not overridden).
 * Benchmarks: many chat products use ~300–400px; 400px is a frequent “standard” default.
 * We use 440px to better fit code/JSON and structured replies while staying responsive via `min(..., 100vw)`.
 */
export const DEFAULT_FLOATING_LAUNCHER_WIDTH = "min(440px, calc(100vw - 24px))";

/** Max width cap paired with {@link DEFAULT_FLOATING_LAUNCHER_WIDTH} for theme defaults. */
export const DEFAULT_FLOATING_LAUNCHER_MAX_WIDTH = "440px";

/** Canonical header avatar box size, shared by the initial render and updates. */
export const DEFAULT_HEADER_ICON_SIZE = "40px";

/**
 * Canonical composer placeholder. The low-level builders fall back to this so
 * they cannot drift from `DEFAULT_WIDGET_CONFIG.copy.inputPlaceholder`.
 */
export const DEFAULT_INPUT_PLACEHOLDER = "How can I help...";

/** Shared by config resolution and standalone transcript component builders. */
export const DEFAULT_TOOL_CALL_DISPLAY = {
  collapsedMode: "tool-call",
  activePreview: false,
  grouped: false,
  groupedMode: "stack",
  previewMaxLines: 3,
  expandable: true,
  loadingAnimation: "none",
} satisfies NonNullable<NonNullable<AgentWidgetConfig["features"]>["toolCallDisplay"]>;

export const DEFAULT_REASONING_DISPLAY = {
  activePreview: false,
  previewMaxLines: 3,
  expandable: true,
  loadingAnimation: "none",
} satisfies NonNullable<NonNullable<AgentWidgetConfig["features"]>["reasoningDisplay"]>;

export const DEFAULT_LAUNCHER_CONFIG: AgentWidgetLauncherConfig = {
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
  headerIconSize: DEFAULT_HEADER_ICON_SIZE,
  // closeButtonSize / clearChat.size omitted so theme.components.header.controlSize
  // sizes the header controls; setting either here would pin them past the token.
  // Zero out browser-default <button> padding so the icon gets the full
  // content box, matching clearChat.paddingX/Y below. Without this,
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
    showTooltip: true,
    tooltipText: "Clear chat",
    paddingX: "0px",
    paddingY: "0px",
  },
  headerIconHidden: false,
  border: undefined,
  shadow:
    "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
};

/**
 * Default widget configuration
 * Single source of truth for all default values
 */
export const DEFAULTS_BASE: Partial<AgentWidgetConfig> = {
  apiUrl: "https://api.runtype.com/api/chat/dispatch",
  // Client token mode defaults (optional, only used when clientToken is set)
  clientToken: undefined,
  agentId: undefined,
  target: undefined,
  theme: undefined,
  darkTheme: undefined,
  colorScheme: "light",
  tooltip: {
    delayMs: DEFAULT_TOOLTIP_DELAY_MS,
    skipDelayMs: DEFAULT_TOOLTIP_SKIP_DELAY_MS,
  },
  launcher: DEFAULT_LAUNCHER_CONFIG,
  copy: {
    // No welcomeTitle / welcomeSubtitle here on purpose: `resolveWelcomeConfig`
    // owns those defaults so presence still means "the host set this".
    inputPlaceholder: DEFAULT_INPUT_PLACEHOLDER,
    sendButtonLabel: "Send",
  },
  sendButton: {
    borderWidth: "0px",
    paddingX: "12px",
    paddingY: "10px",
    borderColor: undefined,
    useIcon: true,
    iconText: "↑",
    // No `size`: unset means "follow --persona-composer-control-size"
    // (theme.components.composer.controlSize), which defaults to 40px.
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
    // No `iconSize` / `paddingX` / `paddingY`: the mic sizes from
    // --persona-composer-control-size like every other composer control, so it
    // no longer needs the hand-tuned box that squeezed a 39px glyph.
    borderWidth: "0px",
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
      streamingIndicator: "arrow",
      scrollBehavior: "instant",
      scrollDurationMs: 220,
      transition: "none",
    },
    scrollBehavior: {
      // ChatGPT-style default: pin the just-sent message near the top and let
      // the reply stream into the space below. Restore the old "stick to the
      // bottom" behavior with `mode: "follow"`.
      mode: "anchor-top",
      anchorTopOffset: 16,
      // Surface the unread count + "streaming below" hint while pinned, so the
      // reader still sees activity arriving off-screen under the pinned turn.
      // (Suppressed by default historically; opted on alongside the anchor-top
      // default so the default UX keeps the affordance.)
      showActivityWhilePinned: true,
    },
    toolCallDisplay: DEFAULT_TOOL_CALL_DISPLAY,
    reasoningDisplay: DEFAULT_REASONING_DISPLAY,
    streamAnimation: {
      type: "none",
      placeholder: "none",
      speed: 120,
      duration: 1800,
    },
    askUserQuestion: {
      enabled: true,
      slideInMs: 180,
      freeTextLabel: "Other…",
      freeTextPlaceholder: "Type your answer…",
      submitLabel: "Send",
    },
    history: {
      enabled: false,
      presentation: "panel",
      showScopeStatus: true,
      showDelete: true,
      showDeleteAll: true,
    },
  },
  // Placeholder copy that models the right shape: verb-first, user-voice,
  // one line. Integrators should swap in domain prompts.
  suggestionChips: [
    "Show me what you can help with",
    "Walk me through getting started",
    "Answer a question about this page",
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

/** Version-specific defaults, selected by the staged V5 opt-in. */
export const DEFAULTS_V4: Partial<AgentWidgetConfig> = {};
export const DEFAULT_LAUNCHER_V5: Partial<AgentWidgetLauncherConfig> = {
  variant: "circle",
  width: "min(400px, calc(100vw - 24px))",
  headerIconSize: "20px",
};
export const DEFAULTS_V5: Partial<AgentWidgetConfig> = {
  // Shared default tracked here so later brand updates retain host scheme intent.
  colorScheme: "light",
  errorDisplay: "block",
  messageActions: { visibility: undefined },
  // Let the suggestion theme token control weight; explicit legacy overrides still win.
  suggestionChipsConfig: { fontWeight: undefined },
  approval: DEFAULT_APPROVAL_V5,
  loadingIndicator: { variant: "label" },
  launcher: DEFAULT_LAUNCHER_V5,
  features: {
    artifacts: { enabled: true },
    scrollToBottom: { streamingIndicator: "dots", transition: "fade", scrollBehavior: "smooth" },
    toolCallDisplay: { variant: "row", iconVisibility: "active", autoExpand: false, grouped: true, groupedMode: "collapsible", loadingAnimation: "shimmer" },
    reasoningDisplay: { variant: "row", iconVisibility: "active", autoExpand: false, loadingAnimation: "shimmer" },
  },
  composer: { layout: "single-row", placement: "overlay" },
  sendButton: { iconName: "arrow-up" },
  statusIndicator: { mode: "transient" },
  layout: {
    contentMaxWidth: "768px",
    topFade: true,
    header: { showSubtitle: false },
    messages: { assistant: { width: "full" } },
  },
};

export type DefaultsVersion = "v4" | "v5";

/** Shared by config, token, theme, and editor resolution. Only true opts in. */
export function resolveDefaultsVersion(
  config?: Pick<AgentWidgetConfig, "future">
): DefaultsVersion {
  return config?.future?.v5Defaults === true ? "v5" : "v4";
}

export function resolveDefaults(
  config?: Pick<AgentWidgetConfig, "future">
): Partial<AgentWidgetConfig> {
  const overlay = resolveDefaultsVersion(config) === "v5" ? DEFAULTS_V5 : DEFAULTS_V4;
  return deepMerge(DEFAULTS_BASE, overlay) as Partial<AgentWidgetConfig>;
}

/** Backward-compatible export of the legacy widget defaults. */
export const DEFAULT_WIDGET_CONFIG = resolveDefaults();

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
  const defaults = resolveDefaults(config);
  if (!config) return inheritStyleProvenance(inheritDefaultProvenance(inheritPanelAliasProvenance(defaults), undefined, DEFAULTS_V5));

  return inheritStyleProvenance(inheritDefaultProvenance(inheritPanelAliasProvenance({
    ...defaults,
    ...config,
    // Leave the scheme unresolved for a brand unless the host chose one.
    // Provenance also distinguishes the inherited light default on live updates.
    colorScheme: defaultProvenance(config, ["colorScheme"]).includes("colorScheme")
      ? config.colorScheme : config.brand ? undefined : defaults.colorScheme,
    ...((defaults.approval || config.approval !== undefined) ? { approval: config.approval === false ? false : {
      ...(defaults.approval || {}),
      ...config.approval,
    } } : {}),
    theme: mergeThemePartials(defaults.theme, config.theme),
    darkTheme: mergeThemePartials(defaults.darkTheme, config.darkTheme),
    launcher: {
      ...defaults.launcher,
      ...config.launcher,
      dock: {
        ...defaults.launcher?.dock,
        ...config.launcher?.dock,
      },
      clearChat: {
        ...defaults.launcher?.clearChat,
        ...config.launcher?.clearChat,
      },
    },
    ...((defaults.composer || config.composer) ? { composer: {
      ...defaults.composer,
      ...config.composer,
    } } : {}),
    tooltip: {
      ...defaults.tooltip,
      ...config.tooltip,
    },
    copy: {
      ...defaults.copy,
      ...config.copy,
    },
    sendButton: {
      ...defaults.sendButton,
      ...config.sendButton,
    },
    statusIndicator: {
      ...defaults.statusIndicator,
      ...config.statusIndicator,
    },
    voiceRecognition: {
      ...defaults.voiceRecognition,
      ...config.voiceRecognition,
    },
    features: (() => {
      const da = defaults.features?.artifacts;
      const ca = config.features?.artifacts;
      const dsb = defaults.features?.scrollToBottom;
      const csb = config.features?.scrollToBottom;
      const dsc = defaults.features?.scrollBehavior;
      const csc = config.features?.scrollBehavior;
      const dsa = defaults.features?.streamAnimation;
      const csa = config.features?.streamAnimation;
      const dau = defaults.features?.askUserQuestion;
      const cau = config.features?.askUserQuestion;
      const dh = defaults.features?.history;
      const ch = config.features?.history;
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
      const mergedScrollBehavior =
        dsc === undefined && csc === undefined
          ? undefined
          : {
              ...dsc,
              ...csc,
            };
      const mergedStreamAnimation =
        dsa === undefined && csa === undefined
          ? undefined
          : {
              ...dsa,
              ...csa,
            };
      const mergedAskUserQuestion =
        dau === undefined && cau === undefined
          ? undefined
          : {
              ...dau,
              ...cau,
              styles: {
                ...dau?.styles,
                ...cau?.styles,
              },
            };
      const mergedHistory =
        dh === undefined && ch === undefined
          ? undefined
          : {
              ...dh,
              ...ch,
              copy: {
                ...dh?.copy,
                ...ch?.copy,
              },
            };
      return {
        ...defaults.features,
        ...config.features,
        toolCallDisplay: {
          ...defaults.features?.toolCallDisplay,
          ...config.features?.toolCallDisplay,
        },
        reasoningDisplay: {
          ...defaults.features?.reasoningDisplay,
          ...config.features?.reasoningDisplay,
        },
        ...(mergedScrollToBottom !== undefined ? { scrollToBottom: mergedScrollToBottom } : {}),
        ...(mergedScrollBehavior !== undefined ? { scrollBehavior: mergedScrollBehavior } : {}),
        ...(mergedArtifacts !== undefined ? { artifacts: mergedArtifacts } : {}),
        ...(mergedStreamAnimation !== undefined ? { streamAnimation: mergedStreamAnimation } : {}),
        ...(mergedAskUserQuestion !== undefined ? { askUserQuestion: mergedAskUserQuestion } : {}),
        ...(mergedHistory !== undefined ? { history: mergedHistory } : {}),
      };
    })(),
    suggestionChips: config.suggestionChips ?? defaults.suggestionChips,
    suggestionChipsConfig: {
      ...defaults.suggestionChipsConfig,
      ...config.suggestionChipsConfig,
    },
    layout: {
      ...defaults.layout,
      ...config.layout,
      header: {
        ...defaults.layout?.header,
        ...config.layout?.header,
      },
      messages: {
        ...defaults.layout?.messages,
        ...config.layout?.messages,
        ...((defaults.layout?.messages?.user || config.layout?.messages?.user) ? {
          user: {
            ...defaults.layout?.messages?.user,
            ...config.layout?.messages?.user,
          },
        } : {}),
        ...((defaults.layout?.messages?.assistant || config.layout?.messages?.assistant) ? {
          assistant: {
            ...defaults.layout?.messages?.assistant,
            ...config.layout?.messages?.assistant,
          },
        } : {}),
        avatar: {
          ...defaults.layout?.messages?.avatar,
          ...config.layout?.messages?.avatar,
        },
        timestamp: {
          ...defaults.layout?.messages?.timestamp,
          ...config.layout?.messages?.timestamp,
        },
      },
      slots: {
        ...defaults.layout?.slots,
        ...config.layout?.slots,
      },
    },
    markdown: {
      ...defaults.markdown,
      ...config.markdown,
      options: {
        ...defaults.markdown?.options,
        ...config.markdown?.options,
      },
    },
    messageActions: {
      ...defaults.messageActions,
      ...config.messageActions,
    },
  }, config), config, DEFAULTS_V5), config);

}
