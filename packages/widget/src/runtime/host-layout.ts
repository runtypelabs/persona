import type {
  AgentWidgetConfig,
  AgentWidgetDockConfig,
  AgentWidgetStateSnapshot,
} from "../types";
import { isDockedMountMode, resolveDockConfig } from "../utils/dock";
import { DEFAULT_OVERLAY_Z_INDEX } from "../utils/constants";
import { createThemeObserver, getActiveTheme } from "../utils/theme";
import {
  DEFAULT_PANEL_CANVAS_BACKGROUND,
  DEFAULT_PANEL_INSET,
  resolveTokenValue,
} from "../utils/tokens";

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

/**
 * Viewport-overflow guard. The docked shell sizes itself with `height: 100%`,
 * which only resolves when an ancestor provides a definite height; without one
 * the dock column would grow with the conversation and scroll off the page.
 * Clamping the slot keeps the panel viewport-sized (messages scroll
 * internally) even when the page's height chain is missing. `100vh` is set
 * first as a fallback for engines without `dvh` support: an invalid value
 * leaves the previous one in place.
 */
const applyDockSlotMaxHeight = (
  dockSlot: HTMLElement,
  maxHeight: string | false
): void => {
  if (maxHeight === false) {
    dockSlot.style.maxHeight = "";
    return;
  }
  dockSlot.style.maxHeight = "100vh";
  dockSlot.style.maxHeight = maxHeight;
};

/**
 * Sticky keeps the resize/emerge dock column pinned to the top of the viewport
 * when the surrounding page is taller than the screen (e.g. a missing height
 * chain or a deliberately scrolling page). With a properly sized shell it
 * behaves exactly like the previous `position: relative`. Not used for push:
 * push gets the max-height cap only, like overlay, since the dock slot is an
 * in-flow `position: relative` column there rather than a viewport-pinned one.
 * (The push track itself is offset with `margin-left`, not a transform, so it
 * no longer establishes a containing block for fixed/sticky descendants.)
 */
const applyInFlowDockSlotPosition = (
  dockSlot: HTMLElement,
  maxHeight: string | false
): void => {
  if (maxHeight === false) {
    dockSlot.style.position = "relative";
    dockSlot.style.top = "";
  } else {
    dockSlot.style.position = "sticky";
    dockSlot.style.top = "0";
  }
};

/**
 * Warns once per docked mount when no ancestor of the dock target provides a
 * definite height, which is the common misconfiguration behind a dock panel
 * that grows past the viewport. Probes with a throwaway `height: 100%` child
 * of the shell's parent; a fixed-height reference probe first checks the
 * environment can measure at all (display: none subtrees and jsdom measure
 * everything as 0, and must not produce a false warning).
 */
const warnIfDockHeightChainUnresolved = (
  shell: HTMLElement,
  dock: Required<AgentWidgetDockConfig>
): void => {
  const parent = shell.parentElement;
  if (!parent) return;
  const probe = shell.ownerDocument.createElement("div");
  probe.style.cssText =
    "width:0;height:1px;margin:0;padding:0;border:0;visibility:hidden;";
  parent.appendChild(probe);
  const measurable = probe.offsetHeight > 0;
  probe.style.height = "100%";
  const resolved = probe.offsetHeight > 0;
  probe.remove();
  if (!measurable || resolved) return;
  console.warn(
    "[AgentWidget] Docked mode: no ancestor of the dock target provides a definite height, " +
      "so the dock panel cannot size to your layout." +
      (dock.maxHeight === false
        ? " The viewport guard is disabled (dock.maxHeight: false), so the panel will grow with the conversation and overflow the viewport."
        : ` Falling back to clamping the panel to ${dock.maxHeight} (configurable via launcher.dock.maxHeight).`) +
      " To size the panel from your layout instead, give the height chain a definite height " +
      "(e.g. `html, body { height: 100% }`) down to the dock target's parent."
  );
};

const setDirectHostStyles = (host: HTMLElement, config?: AgentWidgetConfig): void => {
  const launcherEnabled = config?.launcher?.enabled ?? true;
  host.className = "persona-host";
  host.style.height = launcherEnabled ? "" : "100%";
  host.style.display = launcherEnabled ? "" : "flex";
  host.style.flexDirection = launcherEnabled ? "" : "column";
  host.style.flex = launcherEnabled ? "" : "1 1 auto";
  host.style.minHeight = launcherEnabled ? "" : "0";
  // Flex items floor at min-width:auto (content width); without this the host
  // grows past a shrinkable mount when a wide artifact split opens inside it.
  host.style.minWidth = launcherEnabled ? "" : "0";
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
  dockSlot.style.maxHeight = "";
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
  pushTrack.style.marginLeft = "";
};

const resetContentSlotFlexSizing = (contentSlot: HTMLElement): void => {
  contentSlot.style.width = "";
  contentSlot.style.maxWidth = "";
  contentSlot.style.minWidth = "";
  contentSlot.style.flex = "1 1 auto";
};

const clearEmergeDockStyles = (host: HTMLElement, dockSlot: HTMLElement): void => {
  host.style.width = "";
  // Restore the docked shrinkable baseline, not "": non-emerge dock modes must
  // stay shrinkable. Emerge re-pins minWidth to its fixed width after this.
  host.style.minWidth = "0";
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

/**
 * Detached inset + canvas literals for the dockSlot. The panel CSS vars are set
 * inline on the widget root inside the slot, so they cannot cascade up to the
 * slot; resolve the token values here and apply literals.
 */
const resolveDetachedSlotStyles = (
  config: AgentWidgetConfig | undefined
): { inset: string; canvasBackground: string } => {
  const theme = getActiveTheme(config);
  const panel = theme.components?.panel;
  const resolve = (raw: string | undefined, fallback: string): string => {
    if (raw == null || raw === "") return fallback;
    return resolveTokenValue(theme, raw) ?? raw;
  };
  return {
    inset: resolve(panel?.inset, DEFAULT_PANEL_INSET),
    canvasBackground: resolve(panel?.canvasBackground, DEFAULT_PANEL_CANVAS_BACKGROUND),
  };
};

type DetachedSlotStyles = { inset: string; canvasBackground: string };

/**
 * Detached docked mode pads the slot so the canvas shows around the panel card.
 * Padding, never margin, keeps parseDockWidthToPx push math truthful; box-sizing
 * border-box keeps the slot outer width (and max-height) inclusive of the
 * padding so the panel shrinks inside rather than overflowing.
 */
const applyDetachedDockSlotChrome = (
  dockSlot: HTMLElement,
  detached: boolean,
  inset: string,
  canvasBackground: string
): void => {
  if (!detached) {
    dockSlot.style.padding = "";
    dockSlot.style.background = "";
    dockSlot.style.boxSizing = "";
    return;
  }
  dockSlot.style.boxSizing = "border-box";
  dockSlot.style.padding = inset;
  dockSlot.style.background = canvasBackground;
};

const applyDockStyles = (
  shell: HTMLElement,
  pushTrack: HTMLElement,
  contentSlot: HTMLElement,
  dockSlot: HTMLElement,
  host: HTMLElement,
  config: AgentWidgetConfig | undefined,
  expanded: boolean,
  // Cached slot styles; null when not detached. Resolved once per config/scheme
  // change so getActiveTheme never runs on the resize/ResizeObserver path.
  detachedSlotStyles: DetachedSlotStyles | null
): void => {
  const dock = resolveDockConfig(config);
  const usePush = dock.reveal === "push";
  const detached = detachedSlotStyles != null;
  const detachedInset = detachedSlotStyles?.inset ?? "";
  const detachedCanvas = detachedSlotStyles?.canvasBackground ?? "";

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
  // Shrinkable baseline so a wide artifact split shrinks within the dock host
  // instead of enlarging it. Emerge overwrites this with its fixed width below.
  host.style.minWidth = "0";
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
    // Mobile fullscreen is flush regardless of detachedPanel.
    applyDetachedDockSlotChrome(dockSlot, false, "", "");

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
    dockSlot.style.zIndex = String(config?.launcher?.zIndex ?? DEFAULT_OVERLAY_Z_INDEX);
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
      // Reset the desktop push offset: this fullscreen path applies styles
      // inline without going through clearPushTrackStyles, so a stale negative
      // marginLeft from a prior expanded desktop render would shift the now
      // width:100% track off-screen on mobile.
      pushTrack.style.marginLeft = "0";
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
  applyDockSlotMaxHeight(dockSlot, dock.maxHeight);
  // Chrome only when open: a collapsed detached slot with padding + border-box
  // floors at 2*inset, painting a permanent canvas strip past the 0px width.
  applyDetachedDockSlotChrome(dockSlot, detached && expanded, detachedInset, detachedCanvas);

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
    const dockTransition = dock.animate ? "margin-left 180ms ease" : "none";
    // Slide the wide track with a negative left margin rather than a CSS
    // transform. A `transform` (even `translateX(0)`) turns the push track into
    // the containing block for any `position: fixed` descendant, so host pages
    // that render viewport-fixed chrome inside the pushed content (e.g. the
    // dashboard editor's `fixed top-0 right-0` toolbar) resolve `right: 0`
    // against the track's right edge: `panelPx` past the viewport, off-screen.
    // `margin-left` produces the identical visual offset (the track is clipped
    // by the overflow:hidden shell) without establishing a containing block for
    // fixed OR absolutely-positioned descendants.
    const marginOffsetPx =
      dock.side === "right"
        ? expanded
          ? -panelPx
          : 0
        : expanded
          ? 0
          : -panelPx;

    pushTrack.style.display = "flex";
    pushTrack.style.flexDirection = "row";
    pushTrack.style.flex = "0 0 auto";
    pushTrack.style.minHeight = "0";
    pushTrack.style.minWidth = "0";
    pushTrack.style.alignItems = "stretch";
    pushTrack.style.height = "100%";
    pushTrack.style.width = `${contentPx + panelPx}px`;
    pushTrack.style.transition = dockTransition;
    pushTrack.style.marginLeft = `${marginOffsetPx}px`;
    // Defensively clear any transform a previous reveal mode may have set:    // leaving one would re-establish the fixed-position containing block.
    pushTrack.style.transform = "";

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
    dockSlot.style.top = "";
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
    // Detached collapse snaps padding off as width animates to 0; animate padding
    // alongside so the canvas gutter shrinks with the column.
    const dockTransition = dock.animate
      ? `width 180ms ease, min-width 180ms ease, max-width 180ms ease, flex-basis 180ms ease${detached ? ", padding 180ms ease" : ""}`
      : "none";
    const collapsedClosed = !expanded;

    dockSlot.style.display = "flex";
    dockSlot.style.flexDirection = "column";
    dockSlot.style.flex = `0 0 ${width}`;
    dockSlot.style.width = width;
    dockSlot.style.maxWidth = width;
    dockSlot.style.minWidth = width;
    dockSlot.style.minHeight = "0";
    applyInFlowDockSlotPosition(dockSlot, dock.maxHeight);
    dockSlot.style.overflow =
      isEmerge ? "hidden" : collapsedClosed ? "hidden" : "visible";
    dockSlot.style.transition = dockTransition;

    if (isEmerge) {
      dockSlot.style.alignItems = dock.side === "right" ? "flex-start" : "flex-end";
      // Emerge pins the host to a fixed width and reveals it as the slot grows.
      // When detached, shrink that fixed width by the padding so the host fits
      // the padded slot content-box instead of overflowing one side. Resolve a
      // percentage dock.width to px first: a raw % re-resolves against the
      // padding-reduced content box and un-pins as the slot animates open.
      const emergeHostWidth = detached
        ? `calc(${parseDockWidthToPx(dock.width, shell.clientWidth)}px - (2 * ${detachedInset}))`
        : dock.width;
      host.style.width = emergeHostWidth;
      host.style.minWidth = emergeHostWidth;
      host.style.maxWidth = emergeHostWidth;
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

  // Resolved once per config/scheme change; the resize paths reuse this so
  // getActiveTheme never runs per frame.
  let detachedSlotStyles: DetachedSlotStyles | null = null;
  const refreshDetachedSlotStyles = (): void => {
    detachedSlotStyles =
      config?.launcher?.detachedPanel === true ? resolveDetachedSlotStyles(config) : null;
  };
  refreshDetachedSlotStyles();

  const reapplyDockStyles = (): void => {
    applyDockStyles(shell, pushTrack, contentSlot, dockSlot, host, config, expanded, detachedSlotStyles);
  };

  // Scheme-dependent canvas tokens are baked to literals at layout time, so an
  // OS dark-mode flip leaves a stale canvas until we recompute and re-apply.
  let cleanupSchemeObserver: (() => void) | null = null;
  const syncSchemeObserver = (): void => {
    cleanupSchemeObserver?.();
    cleanupSchemeObserver = null;
    if (config?.launcher?.detachedPanel !== true || config?.colorScheme !== "auto") return;
    cleanupSchemeObserver = createThemeObserver(() => {
      refreshDetachedSlotStyles();
      reapplyDockStyles();
    });
  };

  const syncPushResizeObserver = (): void => {
    disconnectResizeObserver();
    if (resolveDockConfig(config).reveal !== "push") return;
    if (typeof ResizeObserver === "undefined") return;
    resizeObserver = new ResizeObserver(() => {
      reapplyDockStyles();
    });
    resizeObserver.observe(shell);
  };

  let heightChainChecked = false;

  const layout = (): void => {
    reapplyDockStyles();
    syncPushResizeObserver();
    // Check the height chain once, the first time the panel is actually shown
    // in a layout that depends on it (mobile fullscreen is fixed-position and
    // doesn't: keep checking until a dependent layout comes around).
    if (
      expanded &&
      !heightChainChecked &&
      shell.dataset.personaDockMobileFullscreen !== "true"
    ) {
      heightChainChecked = true;
      warnIfDockHeightChainUnresolved(shell, resolveDockConfig(config));
    }
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
  syncSchemeObserver();

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
      refreshDetachedSlotStyles();
      layout();
      syncSchemeObserver();
    },
    destroy() {
      ownerWindow?.removeEventListener("resize", onViewportResize);
      cleanupSchemeObserver?.();
      cleanupSchemeObserver = null;
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
