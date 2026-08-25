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
  if (!config || config.debug !== true || !messages.length) return;
  if (warnedConfigs.has(config)) return;
  warnedConfigs.add(config);
  messages.forEach((message) => console.warn(`[persona] ${message}`));
};

/**
 * Per-field, presence-based precedence: `welcome.*` wins, else the legacy
 * `copy` alias, else the default above.
 */
export const resolveWelcomeConfig = (
  config?: AgentWidgetConfig
): ResolvedWelcomeConfig => {
  const welcome = config?.welcome;
  const copy = config?.copy;

  const variant: AgentWidgetWelcomeVariant = isSet(welcome, "variant")
    ? welcome!.variant!
    : copy?.showWelcomeCard === false
      ? "none"
      : "card";

  // Hero IS the greeting: `dismiss` is forced and `message` is suppressed.
  const dismiss: AgentWidgetWelcomeDismiss =
    variant === "hero"
      ? "on-first-message"
      : isSet(welcome, "dismiss")
        ? welcome!.dismiss!
        : "never";

  const conflicts: string[] = [];
  if (isSet(welcome, "title") && isSet(copy, "welcomeTitle")) {
    conflicts.push(
      "welcome.title and copy.welcomeTitle are both set; welcome.title wins. copy.welcomeTitle is deprecated."
    );
  }
  if (isSet(welcome, "subtitle") && isSet(copy, "welcomeSubtitle")) {
    conflicts.push(
      "welcome.subtitle and copy.welcomeSubtitle are both set; welcome.subtitle wins. copy.welcomeSubtitle is deprecated."
    );
  }
  if (isSet(welcome, "variant") && isSet(copy, "showWelcomeCard")) {
    conflicts.push(
      "welcome.variant and copy.showWelcomeCard are both set; welcome.variant wins. copy.showWelcomeCard is deprecated."
    );
  }
  if (variant === "hero" && isSet(welcome, "message")) {
    conflicts.push(
      'welcome.message is ignored when welcome.variant is "hero": the hero is the greeting.'
    );
  }
  if (variant === "hero" && isSet(welcome, "dismiss") && welcome!.dismiss !== "on-first-message") {
    conflicts.push(
      'welcome.dismiss is pinned to "on-first-message" when welcome.variant is "hero".'
    );
  }

  const anchor: AgentWidgetWelcomeAnchor =
    welcome?.anchor === "center" ? "center" : "bottom";
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
      : copy?.welcomeTitle ?? DEFAULT_WELCOME_TITLE,
    kicker: welcome?.kicker ?? "",
    subtitle: isSet(welcome, "subtitle")
      ? welcome!.subtitle!
      : copy?.welcomeSubtitle ?? DEFAULT_WELCOME_SUBTITLE,
    icon: welcome?.icon,
    align:
      welcome?.align === "start" || welcome?.align === "center"
        ? welcome.align
        : undefined,
    iconPlacement:
      welcome?.icon && typeof welcome.icon !== "function" &&
      welcome.icon.placement === "inline"
        ? "inline"
        : "above",
    variant,
    dismiss,
    message: variant === "hero" ? undefined : welcome?.message,
    anchor,
    anchorComposerTop: anchorTopValid
      ? welcome!.anchorComposerTop!
      : DEFAULT_ANCHOR_COMPOSER_TOP,
    composerGap: welcome?.composerGap?.trim() || DEFAULT_COMPOSER_GAP,
  };
};

/**
 * Conversation state for composer anchoring: `"empty"` until the transcript
 * contains a user message. Independent of welcome visibility (a `dismiss:
 * "never"` card stays up in an active conversation, and `variant: "none"`
 * hides it in an empty one).
 */
export const resolveConversationState = (
  messages: readonly AgentWidgetMessage[] | undefined
): "empty" | "active" =>
  (messages ?? []).some((message) => message.role === "user")
    ? "active"
    : "empty";

/**
 * Derived visibility, never stored. "User activity" is the same predicate the
 * starters use: the session contains at least one `role: "user"` message.
 */
export const isWelcomeVisible = (
  resolved: ResolvedWelcomeConfig,
  messages: readonly AgentWidgetMessage[] | undefined
): boolean => {
  if (resolved.variant === "none") return false;
  if (resolved.dismiss === "never") return true;
  return !(messages ?? []).some((message) => message.role === "user");
};
