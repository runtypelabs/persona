import type {
  AgentWidgetConfig,
  AgentWidgetMessage,
  AgentWidgetWelcomeAlign,
  AgentWidgetWelcomeAnchor,
  AgentWidgetWelcomeDismiss,
  AgentWidgetWelcomeIcon,
  AgentWidgetWelcomeIconPlacement,
  AgentWidgetWelcomeVariant,
} from "./types";
import {
  DEFAULT_ANCHOR_COMPOSER_TOP,
  DEFAULT_COMPOSER_GAP,
  parseAnchorFraction,
} from "./utils/composer-placement";

/**
 * Single source of truth for the welcome surface. Renderers consume the
 * resolved shape only and never read `copy.welcome*` directly.
 *
 * The defaults live here, not in `defaults.ts`: `mergeConfigUpdate`
 * re-applies `mergeWithDefaults` after every patch, so anything defaulted
 * there would be materialized into the stored config and presence-based
 * precedence could no longer tell a host-set value from a default.
 */

/** Default welcome title, applied when neither `welcome` nor `copy` sets one. */
export const DEFAULT_WELCOME_TITLE = "Hello 👋";

/**
 * Scope statement in the assistant's voice, deliberately generic so the
 * placeholder shape reads as something to replace with domain copy.
 */
export const DEFAULT_WELCOME_SUBTITLE =
  "I can answer questions and help you get things done here.";

export interface ResolvedWelcomeConfig {
  title: string;
  /** Empty string when unset: the renderer omits the line. */
  kicker?: string;
  subtitle: string;
  icon?: AgentWidgetWelcomeIcon;
  /**
   * Undefined means "follow the variant" and stamps no attribute, so host CSS
   * keeps owning the alignment.
   */
  align?: AgentWidgetWelcomeAlign;
  /** Resolved from the icon's own `placement`; the function form is `"above"`. */
  iconPlacement: AgentWidgetWelcomeIconPlacement;
  variant: AgentWidgetWelcomeVariant;
  dismiss: AgentWidgetWelcomeDismiss;
  /** Undefined under `variant: "hero"`, which suppresses the greeting. */
  message?: string;
  /**
   * Optional on the interface, always populated by `resolveWelcomeConfig`:
   * a plugin literal built against an older minor must still type-check.
   */
  layout?: "top" | "centered";
  anchor?: AgentWidgetWelcomeAnchor;
  /** Percentage string; validated, falls back to "44%". */
  anchorComposerTop?: string;
  composerGap?: string;
}

// Keyed on the config object: the resolver runs on every render, so warnings
// fire once per config identity instead of once per frame.
const warnedConfigs = new WeakSet<AgentWidgetConfig>();

const isSet = <T, K extends keyof T>(source: T | undefined, key: K): boolean =>
  !!source && source[key] !== undefined;

const warnOnce = (config: AgentWidgetConfig | undefined, messages: string[]) => {
  if (!config || config.debug !== true || !messages.length || warnedConfigs.has(config)) return;
  warnedConfigs.add(config);
  messages.forEach((message) => console.warn(`[persona] ${message}`));
};

/**
 * Per-field, presence-based precedence: `welcome.*` wins, else the legacy
 * `copy` alias, else the default above.
 */
export const resolveWelcomeConfig = (
  config?: AgentWidgetConfig,
  fullscreen = config?.launcher?.fullHeight === true &&
    !config.launcher.sidebarMode && config.launcher.mountMode !== "docked"
): ResolvedWelcomeConfig => {
  const welcome = config?.welcome;
  const copy = config?.copy;
  const v5 = config?.future?.v5Defaults === true;
  const layout = welcome?.layout ?? (v5 ? "centered" : "top");

  const variant: AgentWidgetWelcomeVariant = isSet(welcome, "variant")
    ? welcome!.variant!
    : copy?.showWelcomeCard === false
      ? "none"
      : "card";

  // Legacy V4 heroes force dismissal; opting into layout makes it configurable.
  // A hero remains the greeting, so its separate message is always suppressed.
  const dismiss: AgentWidgetWelcomeDismiss =
    variant === "hero" && !v5 && welcome?.layout === undefined
      ? "on-first-message"
      : isSet(welcome, "dismiss")
        ? welcome!.dismiss!
        : v5 || variant === "hero" ? "on-first-message" : "never";

  const conflicts: string[] = [];
  for (const [field, legacy] of [
    ["title", "welcomeTitle"],
    ["subtitle", "welcomeSubtitle"],
    ["variant", "showWelcomeCard"],
  ] as const) {
    if (isSet(welcome, field) && isSet(copy, legacy)) {
      conflicts.push(
        `welcome.${field} and copy.${legacy} are both set; welcome.${field} wins. copy.${legacy} is deprecated.`
      );
    }
  }
  if (variant === "hero" && isSet(welcome, "message")) {
    conflicts.push(
      'welcome.message is ignored when welcome.variant is "hero": the hero is the greeting.'
    );
  }
  if (!v5 && welcome?.layout === undefined && variant === "hero" && isSet(welcome, "dismiss") && welcome!.dismiss !== "on-first-message") {
    conflicts.push(
      'welcome.dismiss is pinned to "on-first-message" when welcome.variant is "hero".'
    );
  }

  const anchor: AgentWidgetWelcomeAnchor =
    welcome?.anchor ?? (variant !== "none" && layout === "centered" && fullscreen ? "center" : "bottom");
  const anchorTopValid = parseAnchorFraction(welcome?.anchorComposerTop) !== null;
  if (isSet(welcome, "anchorComposerTop") && !anchorTopValid) {
    conflicts.push(
      'welcome.anchorComposerTop must be a percentage between 0% and 100%; falling back to "44%".'
    );
  }
  if (
    anchor !== "center" &&
    (isSet(welcome, "anchorComposerTop") || isSet(welcome, "composerGap"))
  ) {
    conflicts.push(
      'welcome.anchorComposerTop is ignored unless welcome.anchor is "center".'
    );
  }
  warnOnce(config, conflicts);

  return {
    title: isSet(welcome, "title")
      ? welcome!.title!
      : copy?.welcomeTitle ?? (v5 ? "What can I help with?" : DEFAULT_WELCOME_TITLE),
    kicker: welcome?.kicker ?? "",
    subtitle: isSet(welcome, "subtitle")
      ? welcome!.subtitle!
      : copy?.welcomeSubtitle ?? (v5 ? "" : DEFAULT_WELCOME_SUBTITLE),
    icon: welcome?.icon,
    align:
      welcome?.align === "start" || welcome?.align === "center"
        ? welcome.align
        : layout === "centered" ? "center" : undefined,
    iconPlacement:
      welcome?.icon && typeof welcome.icon !== "function" &&
      welcome.icon.placement === "inline"
        ? "inline"
        : "above",
    variant,
    dismiss,
    message: variant === "hero" ? undefined : welcome?.message,
    layout,
    anchor,
    anchorComposerTop: anchorTopValid
      ? welcome!.anchorComposerTop!
      : DEFAULT_ANCHOR_COMPOSER_TOP,
    composerGap: welcome?.composerGap?.trim() || DEFAULT_COMPOSER_GAP,
  };
};

/**
 * Real transcript activity exits the empty layout, including proactive or
 * restored assistant-only activity. Blank assistant placeholders and hidden
 * system context do not. Configured `welcome.message` is separate UI chrome,
 * so an intentional greeting never activates the conversation by itself.
 */
const hasVisibleContent = (message: AgentWidgetMessage): boolean =>
  Boolean(
    message.content.trim() ||
    message.contentParts?.some((part) => part.type !== "text" || part.text.trim())
  );

const hasConversationActivity = (
  messages: readonly AgentWidgetMessage[] = []
): boolean =>
  messages.some((message) =>
    message.role === "user" ||
    // A human operator speaking is conversation, even before any agent turn,
    // including a media-only message (an image, file, audio or video part).
    (message.role === "operator" && hasVisibleContent(message)) ||
    (message.role === "assistant" && (
      hasVisibleContent(message) ||
      message.toolCall || message.tools?.length || message.reasoning || message.approval
    ))
  );

export const resolveConversationState = (
  messages: readonly AgentWidgetMessage[] | undefined
): "empty" | "active" => hasConversationActivity(messages) ? "active" : "empty";

/**
 * Derived visibility, never stored. A dismissible welcome yields to real
 * transcript activity; `dismiss: "never"` keeps the authored surface visible.
 */
export const isWelcomeVisible = (
  resolved: ResolvedWelcomeConfig,
  messages: readonly AgentWidgetMessage[] | undefined
): boolean =>
  resolved.variant !== "none" &&
  (resolved.dismiss === "never" || !hasConversationActivity(messages));
