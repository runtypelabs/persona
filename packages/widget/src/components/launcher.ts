import { createElement, createNode, cx } from "../utils/dom";
import { AgentWidgetConfig, AgentWidgetLauncherTeaserConfig } from "../types";
import { positionMap } from "../utils/positioning";
import { isDockedMountMode } from "../utils/dock";
import { renderLucideIcon } from "../utils/icons";
import { DEFAULT_OVERLAY_Z_INDEX } from "../utils/constants";

export interface LauncherButton {
  element: HTMLButtonElement;
  update: (config: AgentWidgetConfig) => void;
  destroy: () => void;
}

export const createLauncherButton = (
  config: AgentWidgetConfig | undefined,
  onToggle: () => void
): LauncherButton => {
  const button = createElement("button") as HTMLButtonElement;
  button.type = "button";
  button.innerHTML = `
    <span class="persona-inline-flex persona-items-center persona-justify-center persona-rounded-full persona-bg-persona-primary persona-text-white" data-role="launcher-icon">💬</span>
    <img data-role="launcher-image" class="persona-rounded-full persona-object-cover" alt="" style="display:none" />
    <span class="persona-flex persona-min-w-0 persona-flex-1 persona-flex-col persona-items-start persona-text-left">
      <span class="persona-block persona-w-full persona-truncate persona-text-sm persona-font-semibold persona-text-persona-launcher" data-role="launcher-title"></span>
      <span class="persona-block persona-w-full persona-truncate persona-text-xs persona-text-persona-launcher-muted" data-role="launcher-subtitle"></span>
    </span>
    <span class="persona-ml-2 persona-grid persona-place-items-center persona-rounded-full persona-bg-persona-primary persona-text-persona-call-to-action" data-role="launcher-call-to-action-icon">↗</span>
  `;
  button.addEventListener("click", onToggle);

  const update = (newConfig: AgentWidgetConfig) => {
    const launcher = newConfig.launcher ?? {};
    const dockedMode = isDockedMountMode(newConfig);

    const titleEl = button.querySelector("[data-role='launcher-title']");
    if (titleEl) {
      const t = launcher.title ?? "Chat Assistant";
      titleEl.textContent = t;
      titleEl.setAttribute("title", t);
    }

    const subtitleEl = button.querySelector("[data-role='launcher-subtitle']");
    if (subtitleEl) {
      const s = launcher.subtitle ?? "Here to help you get answers fast";
      subtitleEl.textContent = s;
      subtitleEl.setAttribute("title", s);
    }

    // Hide/show text container
    const textContainer = button.querySelector(".persona-flex-col");
    if (textContainer) {
      if (launcher.textHidden || dockedMode) {
        (textContainer as HTMLElement).style.display = "none";
      } else {
        (textContainer as HTMLElement).style.display = "";
      }
    }

    const icon = button.querySelector<HTMLSpanElement>("[data-role='launcher-icon']");
    if (icon) {
      if (launcher.agentIconHidden) {
        icon.style.display = "none";
      } else {
        const iconSize = launcher.agentIconSize ?? "40px";
        icon.style.height = iconSize;
        icon.style.width = iconSize;

        // Optional custom background color for the agent icon circle. When set,
        // override the default primary-color background; otherwise restore it.
        if (launcher.agentIconBackgroundColor) {
          icon.style.backgroundColor = launcher.agentIconBackgroundColor;
          icon.classList.remove("persona-bg-persona-primary");
        } else {
          icon.style.backgroundColor = "";
          icon.classList.add("persona-bg-persona-primary");
        }

        // Clear existing content
        icon.innerHTML = "";
        
        // Render icon based on priority: Lucide icon > iconUrl > agentIconText
        if (launcher.agentIconName) {
          // Use Lucide icon
          const iconSizeNum = parseFloat(iconSize) || 24;
          const iconSvg = renderLucideIcon(launcher.agentIconName, iconSizeNum * 0.6, "var(--persona-text-inverse, #ffffff)", 2);
          if (iconSvg) {
            icon.appendChild(iconSvg);
            icon.style.display = "";
          } else {
            // Fallback to agentIconText if Lucide icon fails
            icon.textContent = launcher.agentIconText ?? "💬";
            icon.style.display = "";
          }
        } else if (launcher.iconUrl) {
          // Use image URL - hide icon span and show img
          icon.style.display = "none";
        } else {
          // Use text/emoji
          icon.textContent = launcher.agentIconText ?? "💬";
          icon.style.display = "";
        }
      }
    }

    const img = button.querySelector<HTMLImageElement>("[data-role='launcher-image']");
    if (img) {
      const iconSize = launcher.agentIconSize ?? "40px";
      img.style.height = iconSize;
      img.style.width = iconSize;
      if (launcher.iconUrl && !launcher.agentIconName && !launcher.agentIconHidden) {
        // Only show image if not using Lucide icon and not hidden
        img.src = launcher.iconUrl;
        img.style.display = "block";
      } else {
        img.style.display = "none";
      }
    }

    const callToActionIconEl = button.querySelector<HTMLSpanElement>("[data-role='launcher-call-to-action-icon']");
    if (callToActionIconEl) {
      const callToActionIconSize = launcher.callToActionIconSize ?? "32px";
      callToActionIconEl.style.height = callToActionIconSize;
      callToActionIconEl.style.width = callToActionIconSize;
      
      // Apply background color if configured
      if (launcher.callToActionIconBackgroundColor) {
        callToActionIconEl.style.backgroundColor = launcher.callToActionIconBackgroundColor;
        callToActionIconEl.classList.remove("persona-bg-persona-primary");
      } else {
        callToActionIconEl.style.backgroundColor = "";
        callToActionIconEl.classList.add("persona-bg-persona-primary");
      }

      // Apply foreground/icon color if configured
      if (launcher.callToActionIconColor) {
        callToActionIconEl.style.color = launcher.callToActionIconColor;
        callToActionIconEl.classList.remove("persona-text-persona-call-to-action");
      } else {
        callToActionIconEl.style.color = "";
        callToActionIconEl.classList.add("persona-text-persona-call-to-action");
      }
      
      // Calculate padding to adjust icon size
      let paddingTotal = 0;
      if (launcher.callToActionIconPadding) {
        callToActionIconEl.style.boxSizing = "border-box";
        callToActionIconEl.style.padding = launcher.callToActionIconPadding;
        // Parse padding value to calculate total padding (padding applies to both sides)
        const paddingValue = parseFloat(launcher.callToActionIconPadding) || 0;
        paddingTotal = paddingValue * 2; // padding on both sides
      } else {
        callToActionIconEl.style.boxSizing = "";
        callToActionIconEl.style.padding = "";
      }
      
      if (launcher.callToActionIconHidden) {
        callToActionIconEl.style.display = "none";
      } else {
        callToActionIconEl.style.display = dockedMode ? "none" : "";
        
        // Clear existing content
        callToActionIconEl.innerHTML = "";
        
        // Use Lucide icon if provided, otherwise fall back to text
        if (launcher.callToActionIconName) {
          // Calculate actual icon size by subtracting padding
          const containerSize = parseFloat(callToActionIconSize) || 24;
          const iconSize = Math.max(containerSize - paddingTotal, 8); // Ensure minimum size of 8px
          const iconSvg = renderLucideIcon(launcher.callToActionIconName, iconSize, "currentColor", 2);
          if (iconSvg) {
            callToActionIconEl.appendChild(iconSvg);
          } else {
            // Fallback to text if icon fails to render
            callToActionIconEl.textContent = launcher.callToActionIconText ?? "↗";
          }
        } else {
          callToActionIconEl.textContent = launcher.callToActionIconText ?? "↗";
        }
      }
    }

    const positionClass =
      launcher.position && positionMap[launcher.position]
        ? positionMap[launcher.position]
        : positionMap["bottom-right"];

    const floatingBase =
      "persona-fixed persona-flex persona-items-center persona-gap-3 persona-rounded-launcher persona-bg-persona-launcher persona-py-2.5 persona-pl-3 persona-pr-3 persona-transition hover:persona-translate-y-[-2px] persona-cursor-pointer";
    const dockedBase =
      "persona-relative persona-mt-4 persona-mb-4 persona-mx-auto persona-flex persona-items-center persona-justify-center persona-rounded-launcher persona-bg-persona-launcher persona-transition hover:persona-translate-y-[-2px] persona-cursor-pointer";

    button.className = dockedMode ? dockedBase : `${floatingBase} ${positionClass}`;

    if (!dockedMode) {
      button.style.zIndex = String(launcher.zIndex ?? DEFAULT_OVERLAY_Z_INDEX);
    }

    // Apply launcher border and shadow from config (with defaults matching previous Tailwind classes)
    const defaultBorder = "1px solid var(--persona-launcher-border, var(--persona-border, #e5e7eb))";
    const defaultShadow = "var(--persona-launcher-shadow, 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1))";

    button.style.border = launcher.border ?? defaultBorder;
    button.style.boxShadow =
      launcher.shadow !== undefined
        ? (launcher.shadow.trim() === "" ? "none" : launcher.shadow)
        : defaultShadow;

    if (dockedMode) {
      // Docked mode uses a 0px column when closed and hides this button; keep no hit target.
      button.style.width = "0";
      button.style.minWidth = "0";
      button.style.maxWidth = "0";
      button.style.padding = "0";
      button.style.overflow = "hidden";
      button.style.border = "none";
      button.style.boxShadow = "none";
    } else {
      button.style.width = "";
      button.style.minWidth = "";
      button.style.maxWidth = launcher.collapsedMaxWidth ?? "";
      button.style.justifyContent = "";
      button.style.padding = "";
      button.style.overflow = "";
    }
  };

  const destroy = () => {
    button.removeEventListener("click", onToggle);
    button.remove();
  };

  // Initial update
  if (config) {
    update(config);
  }

  return {
    element: button,
    update,
    destroy
  };
};

/** Teaser bubble handle. `dismiss(true)` also writes the persisted flag. */
export interface LauncherTeaser {
  element: HTMLElement;
  show: () => void;
  dismiss: (persist: boolean) => void;
}

/** "auto" covers restored/hook-driven opens: they never persist the teaser flag. */
export type LauncherOpenOrigin = "user" | "auto";

export interface LauncherSurface {
  /** Positioned wrapper. Sibling teaser + launcher live inside it. */
  element: HTMLElement;
  launcher: LauncherButton;
  /** Null when no teaser is configured for the current config. */
  teaser: LauncherTeaser | null;
  /** Opening the panel consumes the teaser; closing never resurrects it. */
  setPanelOpen: (open: boolean, origin?: LauncherOpenOrigin) => void;
  update: (config: AgentWidgetConfig) => void;
  destroy: () => void;
}

const TEASER_KEY_SUFFIX = "teaser-dismissed";

/** Consumed teaser keys for this page load; also the blocked-storage fallback. */
const teaserMemoryDismissed = new Set<string>();

const teaserStorageKey = (config?: AgentWidgetConfig): string => {
  const persist = config?.persistState;
  const prefix =
    (typeof persist === "object" ? persist?.keyPrefix : undefined) ?? "persona-";
  return `${prefix}${TEASER_KEY_SUFFIX}`;
};

// localStorage access throws (not just fails) in Safari private mode and
// partitioned iframes, so every access falls back to the in-memory set.
const readTeaserDismissed = (key: string, useStorage: boolean): boolean => {
  if (teaserMemoryDismissed.has(key)) return true;
  if (!useStorage) return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

const writeTeaserDismissed = (key: string, useStorage: boolean): void => {
  teaserMemoryDismissed.add(key);
  if (!useStorage) return;
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    /* blocked storage: the in-memory flag above is the fallback */
  }
};

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const resolveTeaserConfig = (
  config: AgentWidgetConfig | undefined
): AgentWidgetLauncherTeaserConfig | null => {
  const teaser = config?.launcher?.teaser;
  if (!teaser || !teaser.text) return null;
  if (config?.launcher?.enabled === false) return null;
  if (isDockedMountMode(config ?? {})) return null;
  return teaser;
};

/**
 * Launcher wrapper owning the collapsed button and its optional teaser bubble.
 * Both the critical `launcher.global.js` bundle and the full widget build the
 * launcher through this, so teaser behavior and cleanup are identical on the
 * eager and deferred paths.
 */
export const createLauncherSurface = (
  config: AgentWidgetConfig | undefined,
  onToggle: () => void
): LauncherSurface => {
  const wrapper = createElement("div", "persona-launcher-surface");
  wrapper.setAttribute("data-persona-launcher-surface", "true");

  let currentConfig: AgentWidgetConfig = config ?? {};
  let teaserConfig: AgentWidgetLauncherTeaserConfig | null = null;
  let teaserElement: HTMLElement | null = null;
  let dismissButton: HTMLButtonElement | null = null;
  let teaserTextButton: HTMLButtonElement | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let visible = false;
  let shown = false;
  let consumed = false;
  let panelOpen = false;

  const usesStorage = (): boolean =>
    (teaserConfig?.frequency ?? "once") === "once" &&
    currentConfig.persistState !== false;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const hideBubble = () => {
    if (!teaserElement || !visible) return;
    visible = false;
    teaserElement.hidden = true;
  };

  const dismiss = (persist: boolean) => {
    clearTimer();
    consumed = true;
    hideBubble();
    writeTeaserDismissed(teaserStorageKey(currentConfig), persist && usesStorage());
  };

  /**
   * Click-through and launcher clicks consume; only a seen teaser persists.
   * An automatic open is never user intent, so it consumes in memory only.
   */
  const consumeForOpen = (origin: LauncherOpenOrigin) => {
    if (!teaserConfig || consumed) return;
    dismiss(origin === "user" && visible);
  };

  const show = () => {
    timer = null;
    if (!teaserElement || consumed || panelOpen) return;
    shown = true;
    visible = true;
    teaserElement.hidden = false;
    if (prefersReducedMotion() || typeof teaserElement.animate !== "function") return;
    teaserElement.animate(
      [
        { opacity: "0", transform: "translateY(6px)" },
        { opacity: "1", transform: "none" },
      ],
      { duration: 220, easing: "ease-out", fill: "backwards" }
    );
  };

  const schedule = () => {
    if (!teaserConfig || !teaserElement) return;
    if (consumed || shown || panelOpen) return;
    if (readTeaserDismissed(teaserStorageKey(currentConfig), usesStorage())) return;
    clearTimer();
    timer = setTimeout(show, Math.max(0, teaserConfig.delayMs ?? 0));
  };

  const handleTeaserClick = () => {
    dismiss(usesStorage());
    onToggle();
  };

  const handleDismissClick = (event: MouseEvent) => {
    event.stopPropagation();
    dismiss(usesStorage());
  };

  const handleLauncherToggle = () => {
    consumeForOpen("user");
    onToggle();
  };

  const launcher = createLauncherButton(config, handleLauncherToggle);

  const removeTeaserElement = () => {
    clearTimer();
    teaserTextButton?.removeEventListener("click", handleTeaserClick);
    dismissButton?.removeEventListener("click", handleDismissClick);
    teaserElement?.remove();
    teaserElement = null;
    teaserTextButton = null;
    dismissButton = null;
    visible = false;
  };

  const buildTeaserElement = () => {
    teaserTextButton = createNode("button", {
      className: "persona-launcher-teaser-text",
      attrs: { type: "button" },
    });
    teaserTextButton.addEventListener("click", handleTeaserClick);

    dismissButton = createNode("button", {
      className: "persona-launcher-teaser-dismiss",
      attrs: { type: "button" },
      text: "\u00d7",
    });
    dismissButton.addEventListener("click", handleDismissClick);

    teaserElement = createNode(
      "div",
      {
        className: "persona-launcher-teaser",
        attrs: {
          "data-persona-launcher-teaser": "true",
          role: "status",
          "aria-live": "polite",
          hidden: "",
        },
      },
      teaserTextButton,
      dismissButton
    );
    wrapper.insertBefore(teaserElement, launcher.element);
  };

  /**
   * The wrapper is `display: contents` until a teaser exists, so the launcher
   * keeps its own fixed placement; with a teaser the wrapper takes over the
   * corner and the button becomes static inside it.
   */
  const applyPlacement = () => {
    const position = currentConfig.launcher?.position ?? "bottom-right";
    const positionClass = positionMap[position] ?? positionMap["bottom-right"];

    if (!teaserElement) {
      wrapper.className = "persona-launcher-surface";
      wrapper.removeAttribute("data-teaser");
      wrapper.style.zIndex = "";
      launcher.element.style.position = "";
      return;
    }

    wrapper.className = cx("persona-launcher-surface", positionClass);
    wrapper.setAttribute("data-teaser", position);
    wrapper.style.zIndex = String(
      currentConfig.launcher?.zIndex ?? DEFAULT_OVERLAY_Z_INDEX
    );
    launcher.element.style.position = "static";
  };

  const syncTeaser = (nextConfig: AgentWidgetConfig) => {
    const next = resolveTeaserConfig(nextConfig);
    teaserConfig = next;

    if (!next) {
      removeTeaserElement();
      return;
    }

    // `shown` is deliberately not reset here: at most one appearance per load.
    if (!teaserElement) buildTeaserElement();

    teaserTextButton!.textContent = next.text;
    dismissButton!.hidden = next.dismissible === false;
    dismissButton!.setAttribute(
      "aria-label",
      next.dismissLabel ?? "Dismiss message"
    );
    schedule();
  };

  const update = (nextConfig: AgentWidgetConfig) => {
    currentConfig = nextConfig;
    launcher.update(nextConfig);
    syncTeaser(nextConfig);
    applyPlacement();
  };

  const setPanelOpen = (open: boolean, origin: LauncherOpenOrigin = "user") => {
    panelOpen = open;
    if (!open) return;
    consumeForOpen(origin);
  };

  const destroy = () => {
    removeTeaserElement();
    launcher.destroy();
    wrapper.remove();
  };

  wrapper.appendChild(launcher.element);
  if (config) {
    syncTeaser(config);
    applyPlacement();
  }

  return {
    element: wrapper,
    launcher,
    get teaser(): LauncherTeaser | null {
      if (!teaserElement) return null;
      return { element: teaserElement, show, dismiss };
    },
    setPanelOpen,
    update,
    destroy,
  };
};
