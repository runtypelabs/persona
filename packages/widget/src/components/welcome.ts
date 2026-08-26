import { createElement, createNode } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import { getBubbleClasses } from "./message-bubble";
import type {
  AgentWidgetConfig,
  AgentWidgetWelcomeIcon,
} from "../types";
import type { ResolvedWelcomeConfig } from "../welcome";

/**
 * Welcome surface DOM. The host is permanent: it mounts once with the panel
 * and every variant/visibility change is applied to it in place, so live
 * `controller.update()` never rebuilds it.
 */

export interface WelcomeHostElements {
  /** Permanent host; also carries `data-persona-intro-card` for slot parity. */
  host: HTMLElement;
  iconHolder: HTMLElement;
  kicker: HTMLElement;
  title: HTMLElement;
  subtitle: HTMLElement;
  starterSuggestions: HTMLElement;
}

const WELCOME_ICON_SIZE = 40;

/** Replaces the holder's content; hides it when no icon is configured. */
export const applyWelcomeIcon = (
  holder: HTMLElement,
  icon: AgentWidgetWelcomeIcon | undefined
): void => {
  holder.replaceChildren();
  if (!icon) {
    holder.hidden = true;
    return;
  }

  if (typeof icon === "function") {
    let custom: HTMLElement | SVGElement | null = null;
    try {
      custom = icon();
    } catch (error) {
      console.warn("[persona] welcome.icon renderer threw", error);
    }
    if (!custom) {
      holder.hidden = true;
      return;
    }
    holder.appendChild(custom);
    holder.hidden = false;
    return;
  }

  if (icon.type === "lucide") {
    const svg = renderLucideIcon(icon.name, WELCOME_ICON_SIZE);
    if (!svg) {
      holder.hidden = true;
      return;
    }
    holder.appendChild(svg);
  } else if (icon.type === "image") {
    holder.appendChild(
      createNode("img", {
        className: "persona-welcome-icon-image",
        attrs: { src: icon.url, alt: icon.alt },
      })
    );
  } else {
    holder.appendChild(
      createNode("span", {
        className: "persona-welcome-icon-text",
        text: icon.text,
      })
    );
  }
  holder.hidden = false;
};

/**
 * Build the welcome host. `starterSuggestions` is created by the caller so the
 * suggestion surface keeps its existing wiring.
 */
export const buildWelcomeHost = (
  config: AgentWidgetConfig | undefined,
  starterSuggestions: HTMLElement,
  options: { flatShadow?: boolean } = {}
): WelcomeHostElements => {
  const iconHolder = createNode("div", {
    className: "persona-welcome-icon",
    attrs: { "data-persona-welcome-icon": "" },
  });
  iconHolder.hidden = true;

  // Typography flows through `components.introCard.kicker` / `.title` /
  // `.subtitle`; the CSS fallbacks reproduce the utility classes these replaced.
  const kicker = createElement("p", "persona-welcome-kicker");
  kicker.hidden = true;
  const title = createElement("h2", "persona-welcome-title");
  const subtitle = createElement("p", "persona-welcome-subtitle");

  // Both wrappers are `display: contents` until `icon.placement: "inline"`
  // turns the row into a flex line, so the default layout is unchanged.
  const headText = createNode(
    "div",
    { className: "persona-welcome-head-text" },
    kicker,
    title
  );
  const titleRow = createNode(
    "div",
    { className: "persona-welcome-title-row" },
    iconHolder,
    headText
  );

  // Background and box-shadow flow through the themable `components.introCard`
  // tokens; both default to flat. Docked mode always stays flat. Padding comes
  // from `--persona-intro-card-padding` (see widget.css), which zeroes its
  // horizontal component when the card resolves flat so the text shares the
  // content column's left edge instead of carrying a phantom card inset.
  const host = createNode(
    "div",
    {
      className: "persona-welcome persona-rounded-2xl",
      attrs: {
        "data-persona-welcome": "",
        "data-persona-intro-card": "",
        "data-persona-welcome-variant": "card",
      },
      style: {
        background: "var(--persona-intro-card-bg, transparent)",
        boxShadow: options.flatShadow
          ? "none"
          : "var(--persona-intro-card-shadow, none)",
        border: "var(--persona-intro-card-border, none)",
      },
    },
    titleRow,
    subtitle,
    starterSuggestions
  );

  return { host, iconHolder, kicker, title, subtitle, starterSuggestions };
};

/**
 * Show/hide the permanent host. The body gap tightens when nothing renders
 * there so a hidden welcome leaves no phantom section spacing.
 */
export const applyWelcomeVisibility = (
  body: HTMLElement,
  host: HTMLElement,
  visible: boolean
): void => {
  host.hidden = !visible;
  host.style.display = visible ? "" : "none";
  body.classList.toggle("persona-gap-6", visible);
  body.classList.toggle("persona-gap-3", !visible);
};

/**
 * Apply resolved config to the permanent host. Every field is set on every
 * call so `controller.update()` can drop a field and see it revert.
 */
export const applyWelcomeConfig = (
  elements: WelcomeHostElements,
  resolved: ResolvedWelcomeConfig
): void => {
  elements.title.textContent = resolved.title;
  // An empty kicker omits the line entirely, margin included.
  elements.kicker.textContent = resolved.kicker ?? "";
  elements.kicker.hidden = !resolved.kicker;
  elements.subtitle.textContent = resolved.subtitle;
  // An empty subtitle omits the paragraph entirely, margin included.
  elements.subtitle.hidden = resolved.subtitle === "";
  applyWelcomeIcon(elements.iconHolder, resolved.icon);
  elements.host.setAttribute("data-persona-welcome-variant", resolved.variant);
  elements.host.setAttribute("data-persona-welcome-dismiss", resolved.dismiss);
  elements.host.setAttribute(
    "data-persona-welcome-anchor",
    resolved.anchor ?? "bottom"
  );
  // Both are stamped only when configured: an unset option must leave the host
  // untouched so the variant defaults and host CSS keep working.
  if (resolved.iconPlacement === "inline") {
    elements.host.setAttribute("data-persona-welcome-icon-placement", "inline");
  } else {
    elements.host.removeAttribute("data-persona-welcome-icon-placement");
  }
  if (resolved.align) {
    elements.host.setAttribute("data-persona-welcome-align", resolved.align);
  } else {
    elements.host.removeAttribute("data-persona-welcome-align");
  }
};

/** Marks the element a `renderWelcome` plugin returned. */
export const WELCOME_PLUGIN_CONTENT_ATTR = "data-persona-welcome-plugin";
const WELCOME_OVERLAY_ATTR = "data-persona-welcome-overlay";
const WELCOME_OVERLAY_BODY_CLASS = "persona-welcome-overlay-active";

// An absolute child of a scrolled scroller sits at the content origin, not
// the visible viewport, and overflow: hidden freezes scrollTop rather than
// resetting it. Zero the scroll while the overlay is up, restore on clear.
const overlayScrollTop = new WeakMap<HTMLElement, number>();

/**
 * Mount plugin content inside the permanent host. The default children are
 * hidden by CSS while the content attribute is set, so nothing about their
 * own hidden state has to be saved and restored.
 */
export const mountWelcomePluginContent = (
  body: HTMLElement,
  host: HTMLElement,
  element: HTMLElement
): void => {
  element.setAttribute(WELCOME_PLUGIN_CONTENT_ATTR, "");
  host.appendChild(element);
  host.setAttribute("data-persona-welcome-content", "plugin");
  // Plugin content renders regardless of derived visibility and overlays the
  // transcript, which is what makes "return to home" over a conversation work.
  host.setAttribute(WELCOME_OVERLAY_ATTR, "");
  if (!body.classList.contains(WELCOME_OVERLAY_BODY_CLASS)) {
    overlayScrollTop.set(body, body.scrollTop);
    body.classList.add(WELCOME_OVERLAY_BODY_CLASS);
    body.scrollTop = 0;
  }
};

/** Remove plugin content and hand the host back to the default renderer. */
export const clearWelcomePluginContent = (
  body: HTMLElement,
  host: HTMLElement,
  element: HTMLElement | null
): void => {
  if (element && element !== host) element.remove();
  host.removeAttribute("data-persona-welcome-content");
  host.removeAttribute(WELCOME_OVERLAY_ATTR);
  if (body.classList.contains(WELCOME_OVERLAY_BODY_CLASS)) {
    body.classList.remove(WELCOME_OVERLAY_BODY_CLASS);
    body.scrollTop = overlayScrollTop.get(body) ?? body.scrollTop;
    overlayScrollTop.delete(body);
  }
};

/**
 * Greeting host: a sibling above `messagesWrapper`, so it is pinned at
 * transcript position zero without ever entering the morph target.
 */
export const buildGreetingHost = (): HTMLElement => {
  const host = createNode("div", {
    className: "persona-welcome-greeting persona-flex persona-flex-col",
    attrs: { "data-persona-welcome-greeting": "" },
  });
  host.hidden = true;
  return host;
};

/**
 * Render the display-only greeting bubble. Plain text by contract: no
 * markdown pipeline, no action affordances, no message id, never a session
 * message.
 */
export const renderWelcomeGreeting = (
  host: HTMLElement,
  text: string | undefined,
  config: AgentWidgetConfig | undefined
): void => {
  host.replaceChildren();
  if (!text) {
    host.hidden = true;
    return;
  }

  const layout = config?.layout?.messages?.layout ?? "bubble";
  const bubble = createNode("div", {
    className: getBubbleClasses("assistant", layout).join(" "),
    attrs: { "data-persona-theme-zone": "assistant-message" },
    text,
    style:
      layout === "flat"
        ? {
            backgroundColor: "transparent",
            color: "var(--persona-message-assistant-text, var(--persona-text))",
          }
        : {
            backgroundColor:
              "var(--persona-message-assistant-bg, var(--persona-container))",
            color: "var(--persona-message-assistant-text, var(--persona-text))",
          },
  });

  host.appendChild(createNode("div", { className: "persona-flex" }, bubble));
  host.hidden = false;
};

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Hero dismiss. WAAPI, not a CSS transition: morph re-renders strip
 * post-render CSS state and cancel transitions mid-stream. Shares the
 * starters' entrance motion spec so the two read as one system.
 *
 * Returns the animation so the caller can hold the host visible while it runs
 * and cancel it on a re-show. `onFinished` receives it, or null when the motion
 * was skipped and the callback ran synchronously.
 */
export const animateWelcomeOut = (
  host: HTMLElement,
  onFinished: (animation: Animation | null) => void
): Animation | null => {
  if (
    prefersReducedMotion() ||
    typeof host.animate !== "function" ||
    !host.isConnected
  ) {
    onFinished(null);
    return null;
  }
  // Collapse layout in the SAME motion as the fade. The default welcome is
  // in-flow above the transcript (unlike plugin welcomes, which overlay it),
  // so an opacity-only exit would hold the hero's height for the whole fade
  // and then release it in one frame at the hidden flip — the first message
  // renders below the hero, then teleports to the top when the repin lands.
  //
  // Height alone is not enough: the hero centers itself with auto margins,
  // and auto margins absorb whatever the height collapse frees, so the
  // transcript below would still not move until the flip. The margins'
  // USED values are measured from geometry (computed style reports the
  // keyword, not pixels, for flex auto margins) and animated to zero in the
  // same keyframes, with a negative end margin canceling the host's flex gap
  // slot — the transcript slides up continuously and the hidden flip at the
  // end changes nothing the eye can see.
  const rect = host.getBoundingClientRect();
  const parent = host.parentElement;
  let gap = 0;
  let usedMarginTop = 0;
  let usedMarginBottom = 0;
  if (parent) {
    const parentStyle = getComputedStyle(parent);
    gap = parseFloat(parentStyle.rowGap) || 0;
    const prev = host.previousElementSibling;
    const next = host.nextElementSibling;
    const parentRect = parent.getBoundingClientRect();
    const contentTop =
      parentRect.top +
      (parseFloat(parentStyle.borderTopWidth) || 0) +
      (parseFloat(parentStyle.paddingTop) || 0) -
      parent.scrollTop;
    usedMarginTop = Math.max(
      0,
      prev
        ? rect.top - prev.getBoundingClientRect().bottom - gap
        : rect.top - contentTop
    );
    usedMarginBottom = Math.max(
      0,
      next ? next.getBoundingClientRect().top - rect.bottom - gap : 0
    );
  }
  const previousOverflow = host.style.overflow;
  host.style.overflow = "hidden";
  // Padding collapses with the height: under border-box sizing a height of
  // zero clamps at the vertical padding, which would leave a padding-tall
  // remnant releasing in one frame at the flip.
  const hostStyle = getComputedStyle(host);
  const paddingTop = parseFloat(hostStyle.paddingTop) || 0;
  const paddingBottom = parseFloat(hostStyle.paddingBottom) || 0;
  // `forwards`, not `backwards`: backwards only fills the delay phase, so the
  // element snaps back to opacity 1 for a frame after the keyframes end.
  const animation = host.animate(
    [
      {
        opacity: "1",
        transform: "none",
        height: `${rect.height}px`,
        minHeight: "0px",
        paddingTop: `${paddingTop}px`,
        paddingBottom: `${paddingBottom}px`,
        marginTop: `${usedMarginTop}px`,
        marginBottom: `${usedMarginBottom}px`,
      },
      {
        opacity: "0",
        transform: "translateY(-4px)",
        height: "0px",
        minHeight: "0px",
        paddingTop: "0px",
        paddingBottom: "0px",
        marginTop: "0px",
        marginBottom: `${-gap}px`,
      },
    ],
    { duration: 180, easing: "ease-out", fill: "forwards" }
  );
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    // Restored on BOTH settle paths (finish and a re-show's cancel), so a
    // welcome brought back by clearChat keeps its natural overflow.
    host.style.overflow = previousOverflow;
    onFinished(animation);
  };
  animation.finished.then(settle).catch(settle);
  return animation;
};

/**
 * Empty -> active composer drop (and the clearChat rise). WAAPI, never a CSS
 * transition: the widget re-stamps footer cssText on every chrome sync, which
 * leaves a `bottom` transition stuck `running` at its start value.
 *
 * `distance` is the lift the footer just gave up; the caller has already
 * written the final `--persona-composer-lift`, so this only replays the
 * visual travel. Returns null when motion is skipped.
 */
export const animateComposerLiftChange = (
  footer: HTMLElement,
  distance: number,
  direction: "drop" | "rise"
): Animation | null => {
  if (
    distance <= 1 ||
    prefersReducedMotion() ||
    typeof footer.animate !== "function" ||
    !footer.isConnected
  ) {
    return null;
  }
  const offset = direction === "drop" ? -distance : distance;
  // `fill: "none"`: the resting state is already final, so a fill would only
  // risk pinning a stale transform across a later re-show.
  return footer.animate(
    [{ transform: `translateY(${offset}px)` }, { transform: "none" }],
    { duration: 260, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "none" }
  );
};
