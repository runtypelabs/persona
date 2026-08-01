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

  const title = createElement(
    "h2",
    "persona-text-lg persona-font-semibold persona-text-persona-primary"
  );
  const subtitle = createElement(
    "p",
    "persona-mt-2 persona-text-sm persona-text-persona-muted"
  );

  // Background and box-shadow flow through the themable `components.introCard`
  // tokens; both default to flat. Docked mode always stays flat.
  const host = createNode(
    "div",
    {
      className: "persona-welcome persona-rounded-2xl persona-p-6",
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
      },
    },
    iconHolder,
    title,
    subtitle,
    starterSuggestions
  );

  return { host, iconHolder, title, subtitle, starterSuggestions };
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
  elements.subtitle.textContent = resolved.subtitle;
  // An empty subtitle omits the paragraph entirely, margin included.
  elements.subtitle.hidden = resolved.subtitle === "";
  applyWelcomeIcon(elements.iconHolder, resolved.icon);
  elements.host.setAttribute("data-persona-welcome-variant", resolved.variant);
  elements.host.setAttribute("data-persona-welcome-dismiss", resolved.dismiss);
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
  // `forwards`, not `backwards`: backwards only fills the delay phase, so the
  // element snaps back to opacity 1 for a frame after the keyframes end.
  const animation = host.animate(
    [
      { opacity: "1", transform: "none" },
      { opacity: "0", transform: "translateY(-4px)" },
    ],
    { duration: 180, easing: "ease-out", fill: "forwards" }
  );
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    onFinished(animation);
  };
  animation.finished.then(settle).catch(settle);
  return animation;
};
