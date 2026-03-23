import type {
  AgentWidgetConfig,
  AgentWidgetStateSnapshot,
} from "../types";
import { isDockedMountMode, resolveDockConfig } from "../utils/dock";

export type WidgetHostLayoutMode = "direct" | "docked";

export type WidgetHostLayout = {
  mode: WidgetHostLayoutMode;
  host: HTMLElement;
  shell: HTMLElement | null;
  syncWidgetState: (state: Pick<AgentWidgetStateSnapshot, "open" | "launcherEnabled">) => void;
  updateConfig: (config?: AgentWidgetConfig) => void;
  destroy: () => void;
};

/** Parse `dock.width` for push layout math (px or % of shell). Fallback: 420. */
const parseDockWidthToPx = (width: string, shellClientWidth: number): number => {
  const w = width.trim();
  const px = /^(\d+(?:\.\d+)?)px$/i.exec(w);
  if (px) return Math.max(0, parseFloat(px[1]));
  const pct = /^(\d+(?:\.\d+)?)%$/i.exec(w);
  if (pct) return Math.max(0, (shellClientWidth * parseFloat(pct[1])) / 100);
  return 420;
};

const setDirectHostStyles = (host: HTMLElement, config?: AgentWidgetConfig): void => {
  const launcherEnabled = config?.launcher?.enabled ?? true;
  host.className = "persona-host";
  host.style.height = launcherEnabled ? "" : "100%";
  host.style.display = launcherEnabled ? "" : "flex";
  host.style.flexDirection = launcherEnabled ? "" : "column";
  host.style.flex = launcherEnabled ? "" : "1 1 auto";
  host.style.minHeight = launcherEnabled ? "" : "0";
};

const clearOverlayDockSlotStyles = (dockSlot: HTMLElement): void => {
  dockSlot.style.position = "";
  dockSlot.style.top = "";
  dockSlot.style.bottom = "";
  dockSlot.style.left = "";
  dockSlot.style.right = "";
  dockSlot.style.zIndex = "";
  dockSlot.style.transform = "";
  dockSlot.style.pointerEvents = "";
};

/** Clears viewport-escape fullscreen styles so reveal modes can re-apply dock layout. */
const clearMobileFullscreenDockSlotStyles = (dockSlot: HTMLElement): void => {
  dockSlot.style.inset = "";
  dockSlot.style.width = "";
  dockSlot.style.height = "";
  dockSlot.style.maxWidth = "";
  dockSlot.style.minWidth = "";
  clearOverlayDockSlotStyles(dockSlot);
};

const clearResizeDockSlotTransition = (dockSlot: HTMLElement): void => {
  dockSlot.style.transition = "";
};

const clearPushTrackStyles = (pushTrack: HTMLElement): void => {
  pushTrack.style.display = "";
  pushTrack.style.flexDirection = "";
  pushTrack.style.flex = "";
  pushTrack.style.minHeight = "";
  pushTrack.style.minWidth = "";
  pushTrack.style.width = "";
  pushTrack.style.height = "";
  pushTrack.style.alignItems = "";
  pushTrack.style.transition = "";
  pushTrack.style.transform = "";
};

const resetContentSlotFlexSizing = (contentSlot: HTMLElement): void => {
  contentSlot.style.width = "";
  contentSlot.style.maxWidth = "";
  contentSlot.style.minWidth = "";
  contentSlot.style.flex = "1 1 auto";
};

const clearEmergeDockStyles = (host: HTMLElement, dockSlot: HTMLElement): void => {
  host.style.width = "";
  host.style.minWidth = "";
  host.style.maxWidth = "";
  host.style.boxSizing = "";
  dockSlot.style.alignItems = "";
};

const migrateDockChildren = (
  shell: HTMLElement,
  pushTrack: HTMLElement,
  contentSlot: HTMLElement,
  dockSlot: HTMLElement,
  usePush: boolean
): void => {
  if (usePush) {
    if (contentSlot.parentElement !== pushTrack) {
      shell.replaceChildren();
      pushTrack.replaceChildren(contentSlot, dockSlot);
      shell.appendChild(pushTrack);
    }
  } else if (contentSlot.parentElement === pushTrack) {
    pushTrack.replaceChildren();
    shell.appendChild(contentSlot);
    shell.appendChild(dockSlot);
  }
};

const orderDockChildren = (
  shell: HTMLElement,
  pushTrack: HTMLElement,
  contentSlot: HTMLElement,
  dockSlot: HTMLElement,
  side: "left" | "right",
  usePush: boolean
): void => {
  const parent = usePush ? pushTrack : shell;
  if (side === "left") {
    if (parent.firstElementChild !== dockSlot) {
      parent.replaceChildren(dockSlot, contentSlot);
    }
  } else if (parent.lastElementChild !== dockSlot) {
    parent.replaceChildren(contentSlot, dockSlot);
  }
};

const applyDockStyles = (
  shell: HTMLElement,
  pushTrack: HTMLElement,
  contentSlot: HTMLElement,
  dockSlot: HTMLElement,
  host: HTMLElement,
  config: AgentWidgetConfig | undefined,
  expanded: boolean
): void => {
  const dock = resolveDockConfig(config);
  const usePush = dock.reveal === "push";

  migrateDockChildren(shell, pushTrack, contentSlot, dockSlot, usePush);
  orderDockChildren(shell, pushTrack, contentSlot, dockSlot, dock.side, usePush);

  shell.dataset.personaHostLayout = "docked";
  shell.dataset.personaDockSide = dock.side;
  shell.dataset.personaDockOpen = expanded ? "true" : "false";
  shell.style.width = "100%";
  shell.style.maxWidth = "100%";
  shell.style.minWidth = "0";
  shell.style.height = "100%";
  shell.style.minHeight = "0";
  shell.style.position = "relative";

  contentSlot.style.display = "flex";
  contentSlot.style.flexDirection = "column";
  contentSlot.style.minHeight = "0";
  contentSlot.style.position = "relative";

  host.className = "persona-host";
  host.style.height = "100%";
  host.style.minHeight = "0";
  host.style.display = "flex";
  host.style.flexDirection = "column";
  host.style.flex = "1 1 auto";

  const ownerWindow = shell.ownerDocument.defaultView;
  const mobileFullscreenEnabled = config?.launcher?.mobileFullscreen ?? true;
  const mobileBreakpoint = config?.launcher?.mobileBreakpoint ?? 640;
  const isMobileViewport =
    ownerWindow != null ? ownerWindow.innerWidth <= mobileBreakpoint : false;
  const useMobileFullscreen = mobileFullscreenEnabled && isMobileViewport && expanded;

  if (useMobileFullscreen) {
    shell.dataset.personaDockMobileFullscreen = "true";
    shell.removeAttribute("data-persona-dock-reveal");
    clearPushTrackStyles(pushTrack);
    clearResizeDockSlotTransition(dockSlot);
    clearMobileFullscreenDockSlotStyles(dockSlot);
    resetContentSlotFlexSizing(contentSlot);
    clearEmergeDockStyles(host, dockSlot);

    shell.style.display = "flex";
    shell.style.flexDirection = "column";
    shell.style.alignItems = "stretch";
    shell.style.overflow = "hidden";

    contentSlot.style.flex = "1 1 auto";
    contentSlot.style.width = "100%";
    contentSlot.style.minWidth = "0";

    dockSlot.style.display = "flex";
    dockSlot.style.flexDirection = "column";
    dockSlot.style.position = "fixed";
    dockSlot.style.inset = "0";
    dockSlot.style.width = "100%";
    dockSlot.style.height = "100%";
    dockSlot.style.maxWidth = "100%";
    dockSlot.style.minWidth = "0";
    dockSlot.style.minHeight = "0";
    dockSlot.style.overflow = "hidden";
    dockSlot.style.zIndex = "9999";
    dockSlot.style.transform = "none";
    dockSlot.style.transition = "none";
    dockSlot.style.pointerEvents = "auto";
    dockSlot.style.flex = "none";

    if (usePush) {
      pushTrack.style.display = "flex";
      pushTrack.style.flexDirection = "column";
      pushTrack.style.width = "100%";
      pushTrack.style.height = "100%";
      pushTrack.style.minHeight = "0";
      pushTrack.style.minWidth = "0";
      pushTrack.style.flex = "1 1 auto";
      pushTrack.style.alignItems = "stretch";
      pushTrack.style.transform = "none";
      pushTrack.style.transition = "none";
      contentSlot.style.flex = "1 1 auto";
      contentSlot.style.width = "100%";
      contentSlot.style.maxWidth = "100%";
      contentSlot.style.minWidth = "0";
    }

    return;
  }

  shell.removeAttribute("data-persona-dock-mobile-fullscreen");
  clearMobileFullscreenDockSlotStyles(dockSlot);

  if (dock.reveal === "overlay") {
    shell.style.display = "flex";
    shell.style.flexDirection = "row";
    shell.style.alignItems = "stretch";
    shell.style.overflow = "hidden";
    shell.dataset.personaDockReveal = "overlay";
    clearPushTrackStyles(pushTrack);
    clearResizeDockSlotTransition(dockSlot);
    resetContentSlotFlexSizing(contentSlot);
    clearEmergeDockStyles(host, dockSlot);

    const dockTransition = dock.animate ? "transform 180ms ease" : "none";
    const translateClosed = dock.side === "right" ? "translateX(100%)" : "translateX(-100%)";
    const translate = expanded ? "translateX(0)" : translateClosed;

    dockSlot.style.display = "flex";
    dockSlot.style.flexDirection = "column";
    dockSlot.style.flex = "none";
    dockSlot.style.position = "absolute";
    dockSlot.style.top = "0";
    dockSlot.style.bottom = "0";
    dockSlot.style.width = dock.width;
    dockSlot.style.maxWidth = dock.width;
    dockSlot.style.minWidth = dock.width;
    dockSlot.style.minHeight = "0";
    dockSlot.style.overflow = "hidden";
    dockSlot.style.transition = dockTransition;
    dockSlot.style.transform = translate;
    dockSlot.style.pointerEvents = expanded ? "auto" : "none";
    dockSlot.style.zIndex = "2";
    if (dock.side === "right") {
      dockSlot.style.right = "0";
      dockSlot.style.left = "";
    } else {
      dockSlot.style.left = "0";
      dockSlot.style.right = "";
    }
  } else if (dock.reveal === "push") {
    // Row flex so the wide push track is laid out on the horizontal axis; column was stretching
    // the track to the shell width and fighting explicit width, which could confuse overflow.
    shell.style.display = "flex";
    shell.style.flexDirection = "row";
    shell.style.alignItems = "stretch";
    shell.style.overflow = "hidden";
    shell.dataset.personaDockReveal = "push";
    clearResizeDockSlotTransition(dockSlot);
    clearOverlayDockSlotStyles(dockSlot);
    clearEmergeDockStyles(host, dockSlot);

    const panelPx = parseDockWidthToPx(dock.width, shell.clientWidth);
    const contentPx = Math.max(0, shell.clientWidth);
    const dockTransition = dock.animate ? "transform 180ms ease" : "none";
    const translate =
      dock.side === "right"
        ? expanded
          ? `translateX(-${panelPx}px)`
          : "translateX(0)"
        : expanded
          ? "translateX(0)"
          : `translateX(-${panelPx}px)`;

    pushTrack.style.display = "flex";
    pushTrack.style.flexDirection = "row";
    pushTrack.style.flex = "0 0 auto";
    pushTrack.style.minHeight = "0";
    pushTrack.style.minWidth = "0";
    pushTrack.style.alignItems = "stretch";
    pushTrack.style.height = "100%";
    pushTrack.style.width = `${contentPx + panelPx}px`;
    pushTrack.style.transition = dockTransition;
    pushTrack.style.transform = translate;

    contentSlot.style.flex = "0 0 auto";
    contentSlot.style.flexGrow = "0";
    contentSlot.style.flexShrink = "0";
    contentSlot.style.width = `${contentPx}px`;
    contentSlot.style.maxWidth = `${contentPx}px`;
    contentSlot.style.minWidth = `${contentPx}px`;

    dockSlot.style.display = "flex";
    dockSlot.style.flexDirection = "column";
    dockSlot.style.flex = "0 0 auto";
    dockSlot.style.flexShrink = "0";
    dockSlot.style.width = dock.width;
    dockSlot.style.minWidth = dock.width;
    dockSlot.style.maxWidth = dock.width;
    dockSlot.style.position = "relative";
    dockSlot.style.overflow = "hidden";
    dockSlot.style.transition = "none";
    dockSlot.style.pointerEvents = expanded ? "auto" : "none";
  } else {
    shell.style.display = "flex";
    shell.style.flexDirection = "row";
    shell.style.alignItems = "stretch";
    shell.style.overflow = "";
    clearPushTrackStyles(pushTrack);
    clearOverlayDockSlotStyles(dockSlot);
    resetContentSlotFlexSizing(contentSlot);
    clearEmergeDockStyles(host, dockSlot);

    const isEmerge = dock.reveal === "emerge";
    if (isEmerge) {
      shell.dataset.personaDockReveal = "emerge";
    } else {
      shell.removeAttribute("data-persona-dock-reveal");
    }

    const width = expanded ? dock.width : "0px";
    const dockTransition = dock.animate
      ? "width 180ms ease, min-width 180ms ease, max-width 180ms ease, flex-basis 180ms ease"
      : "none";
    const collapsedClosed = !expanded;

    dockSlot.style.display = "flex";
    dockSlot.style.flexDirection = "column";
    dockSlot.style.flex = `0 0 ${width}`;
    dockSlot.style.width = width;
    dockSlot.style.maxWidth = width;
    dockSlot.style.minWidth = width;
    dockSlot.style.minHeight = "0";
    dockSlot.style.position = "relative";
    dockSlot.style.overflow =
      isEmerge ? "hidden" : collapsedClosed ? "hidden" : "visible";
    dockSlot.style.transition = dockTransition;

    if (isEmerge) {
      dockSlot.style.alignItems = dock.side === "right" ? "flex-start" : "flex-end";
      host.style.width = dock.width;
      host.style.minWidth = dock.width;
      host.style.maxWidth = dock.width;
      host.style.boxSizing = "border-box";
    }
  }
};

const createDirectLayout = (target: HTMLElement, config?: AgentWidgetConfig): WidgetHostLayout => {
  const host = target.ownerDocument.createElement("div");
  setDirectHostStyles(host, config);
  target.appendChild(host);

  return {
    mode: "direct",
    host,
    shell: null,
    syncWidgetState: () => {},
    updateConfig(nextConfig?: AgentWidgetConfig) {
      setDirectHostStyles(host, nextConfig);
    },
    destroy() {
      host.remove();
    },
  };
};

const createDockedLayout = (target: HTMLElement, config?: AgentWidgetConfig): WidgetHostLayout => {
  const { ownerDocument } = target;
  const originalParent = target.parentElement;

  if (!originalParent) {
    throw new Error("Docked widget target must be attached to the DOM");
  }

  const tagName = target.tagName.toUpperCase();
  if (tagName === "BODY" || tagName === "HTML") {
    throw new Error('Docked widget target must be a concrete container element, not "body" or "html"');
  }

  const originalNextSibling = target.nextSibling;
  const shell = ownerDocument.createElement("div");
  const pushTrack = ownerDocument.createElement("div");
  const contentSlot = ownerDocument.createElement("div");
  const dockSlot = ownerDocument.createElement("aside");
  const host = ownerDocument.createElement("div");
  let expanded = (config?.launcher?.enabled ?? true) ? (config?.launcher?.autoExpand ?? false) : true;

  pushTrack.dataset.personaDockRole = "push-track";
  contentSlot.dataset.personaDockRole = "content";
  dockSlot.dataset.personaDockRole = "panel";
  host.dataset.personaDockRole = "host";

  dockSlot.appendChild(host);
  originalParent.insertBefore(shell, target);
  contentSlot.appendChild(target);

  let resizeObserver: ResizeObserver | null = null;

  const disconnectResizeObserver = (): void => {
    resizeObserver?.disconnect();
    resizeObserver = null;
  };

  const syncPushResizeObserver = (): void => {
    disconnectResizeObserver();
    if (resolveDockConfig(config).reveal !== "push") return;
    if (typeof ResizeObserver === "undefined") return;
    resizeObserver = new ResizeObserver(() => {
      applyDockStyles(shell, pushTrack, contentSlot, dockSlot, host, config, expanded);
    });
    resizeObserver.observe(shell);
  };

  const layout = (): void => {
    applyDockStyles(shell, pushTrack, contentSlot, dockSlot, host, config, expanded);
    syncPushResizeObserver();
  };

  const ownerWindow = shell.ownerDocument.defaultView;
  const onViewportResize = (): void => {
    layout();
  };
  ownerWindow?.addEventListener("resize", onViewportResize);

  if (resolveDockConfig(config).reveal === "push") {
    pushTrack.appendChild(contentSlot);
    pushTrack.appendChild(dockSlot);
    shell.appendChild(pushTrack);
  } else {
    shell.appendChild(contentSlot);
    shell.appendChild(dockSlot);
  }

  layout();

  return {
    mode: "docked",
    host,
    shell,
    syncWidgetState(state) {
      const nextExpanded = state.launcherEnabled ? state.open : true;
      if (expanded === nextExpanded) return;
      expanded = nextExpanded;
      layout();
    },
    updateConfig(nextConfig?: AgentWidgetConfig) {
      config = nextConfig;
      if ((config?.launcher?.enabled ?? true) === false) {
        expanded = true;
      }
      layout();
    },
    destroy() {
      ownerWindow?.removeEventListener("resize", onViewportResize);
      disconnectResizeObserver();
      if (originalParent.isConnected) {
        if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
          originalParent.insertBefore(target, originalNextSibling);
        } else {
          originalParent.appendChild(target);
        }
      }
      shell.remove();
    },
  };
};

export const createWidgetHostLayout = (
  target: HTMLElement,
  config?: AgentWidgetConfig
): WidgetHostLayout => {
  if (isDockedMountMode(config)) {
    return createDockedLayout(target, config);
  }
  return createDirectLayout(target, config);
};
