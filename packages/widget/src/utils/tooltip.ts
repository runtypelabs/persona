import { PORTALED_OVERLAY_Z_INDEX } from "./constants";
import {
  DEFAULT_TOOLTIP_DELAY_MS,
  DEFAULT_TOOLTIP_SKIP_DELAY_MS,
} from "./tooltip-timing";

export { DEFAULT_TOOLTIP_DELAY_MS, DEFAULT_TOOLTIP_SKIP_DELAY_MS };

const DEFAULT_GAP = 8;
const DEFAULT_VIEWPORT_PADDING = 8;
const MIN_ARROW_INSET = 10;

let configuredDelayMs = DEFAULT_TOOLTIP_DELAY_MS;
let configuredSkipDelayMs = DEFAULT_TOOLTIP_SKIP_DELAY_MS;
let skipDelayUntil = 0;

const clampMs = (value: number): number => Math.max(0, value);

/**
 * Set the widget-wide hover timing. Per-attach `delayMs` / `skipDelayMs`
 * still win. Keyboard focus is always immediate.
 */
export function configureTooltipTiming(timing: {
  delayMs?: number;
  skipDelayMs?: number;
}): void {
  if (timing.delayMs !== undefined) configuredDelayMs = clampMs(timing.delayMs);
  if (timing.skipDelayMs !== undefined)
    configuredSkipDelayMs = clampMs(timing.skipDelayMs);
}

/** Restore product defaults and clear the skip-delay window. */
export function resetTooltipTiming(timing?: {
  delayMs?: number;
  skipDelayMs?: number;
}): void {
  configuredDelayMs = clampMs(timing?.delayMs ?? DEFAULT_TOOLTIP_DELAY_MS);
  configuredSkipDelayMs = clampMs(
    timing?.skipDelayMs ?? DEFAULT_TOOLTIP_SKIP_DELAY_MS
  );
  skipDelayUntil = 0;
}

const isSkipDelayWarm = (): boolean => Date.now() < skipDelayUntil;

const markSkipDelay = (skipMs: number): void => {
  skipDelayUntil = skipMs > 0 ? Date.now() + skipMs : 0;
};

export interface TooltipOptions {
  /** The control the tooltip describes and positions against. */
  anchor: HTMLElement;
  /** Hover target. Defaults to `anchor`; wrappers make small icon buttons easier to hit. */
  trigger?: HTMLElement;
  /** Tooltip copy. A callback keeps live aria-label updates in sync. */
  text: string | (() => string);
  /**
   * Muted chip after the label, e.g. a keyboard shortcut. Empty renders
   * nothing. A callback is re-read on every reposition, like `text`.
   */
  hint?: string | (() => string);
  /** Whether the visual tooltip may open. The anchor's accessible name is unaffected. */
  enabled?: boolean;
  /** Gap between the control and tooltip, in pixels. */
  gap?: number;
  /** Minimum distance from viewport edges, in pixels. */
  viewportPadding?: number;
  /**
   * Hover wait before the first tooltip. Falls back to the widget
   * `tooltip.delayMs` (default 200). Keyboard focus ignores this.
   */
  delayMs?: number;
  /**
   * After a tooltip closes, later hovers in this window skip `delayMs`.
   * Falls back to the widget `tooltip.skipDelayMs` (default 300).
   */
  skipDelayMs?: number;
}

export interface TooltipHandle {
  readonly isOpen: boolean;
  show(): void;
  hide(): void;
  reposition(): void;
  destroy(): void;
}

const handles = new WeakMap<HTMLElement, TooltipHandle>();

/**
 * Marks a subtree where control tooltips must never open. The composer overflow
 * menu sets it on each row: a menu item already shows its name as visible text,
 * so a floating tooltip over it would be redundant and wrong.
 */
export const TOOLTIP_SUPPRESSED_ATTR = "data-persona-tooltip-suppressed";

const isSuppressed = (anchor: HTMLElement): boolean =>
  typeof anchor.closest === "function" &&
  anchor.closest(`[${TOOLTIP_SUPPRESSED_ATTR}]`) !== null;

/** Close the tooltip currently attached to `anchor`, if any. */
export function hideTooltipFor(anchor: HTMLElement): void {
  handles.get(anchor)?.hide();
}

const isShadowRoot = (root: Node): root is ShadowRoot =>
  root.nodeType === Node.DOCUMENT_FRAGMENT_NODE && "host" in root;

const tooltipContainer = (anchor: HTMLElement): HTMLElement | ShadowRoot | null => {
  const root = anchor.getRootNode?.();
  if (isShadowRoot(root)) return root;
  return anchor.ownerDocument.body;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

// Theme variables live on the widget mount, which a body-portaled tooltip is
// not inside, so the anchor's resolved values are copied onto it at show time.
// A theme change lands on the next open.
const INHERITED_VARS = [
  ...[
    "background",
    "foreground",
    "hint-fg",
    "radius",
    "font-size",
    "padding",
    "max-width",
    "shadow",
    "arrow-display",
  ].map((name) => `--persona-tooltip-${name}`),
  // Inputs to the stylesheet's own var() fallback chains.
  "--persona-font-family",
  "--persona-radius-sm",
];

/**
 * Attach a portaled, viewport-aware tooltip to an icon control.
 *
 * The tooltip is created only while visible and is mounted outside the widget
 * panel's clipping containers. Re-attaching to the same anchor replaces the
 * previous behavior, which makes controller.update() safe and idempotent.
 */
export function attachTooltip(options: TooltipOptions): TooltipHandle {
  handles.get(options.anchor)?.destroy();

  const {
    anchor,
    trigger = anchor,
    text,
    hint,
    enabled = true,
    gap = DEFAULT_GAP,
    viewportPadding = DEFAULT_VIEWPORT_PADDING,
  } = options;
  const currentDocument = (): Document => anchor.ownerDocument;
  const currentWindow = (): Window =>
    currentDocument().defaultView ?? window;

  let tooltip: HTMLElement | null = null;
  let label: HTMLElement | null = null;
  let hintChip: HTMLElement | null = null;
  let detachOpenListeners: (() => void) | null = null;
  let openTimer: ReturnType<Window["setTimeout"]> | undefined;
  let hovered = false;
  let focused = false;
  let destroyed = false;

  const resolvedText = (): string =>
    (typeof text === "function" ? text() : text).trim();
  const resolvedHint = (): string =>
    (typeof hint === "function" ? hint() : (hint ?? "")).trim();
  const resolvedDelayMs = (): number =>
    clampMs(options.delayMs ?? configuredDelayMs);
  const resolvedSkipDelayMs = (): number =>
    clampMs(options.skipDelayMs ?? configuredSkipDelayMs);

  const clearOpenTimer = (): void => {
    if (openTimer === undefined) return;
    currentWindow().clearTimeout(openTimer);
    openTimer = undefined;
  };

  const hide = (): void => {
    clearOpenTimer();
    const wasOpen = tooltip !== null;
    detachOpenListeners?.();
    detachOpenListeners = null;
    tooltip?.remove();
    tooltip = null;
    label = null;
    hintChip = null;
    if (wasOpen) markSkipDelay(resolvedSkipDelayMs());
  };

  const reposition = (): void => {
    if (!tooltip) return;

    const ownerDocument = currentDocument();
    const ownerWindow = currentWindow();
    const anchorRect = anchor.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth =
      ownerDocument.documentElement.clientWidth || ownerWindow.innerWidth;
    const viewportHeight =
      ownerDocument.documentElement.clientHeight || ownerWindow.innerHeight;

    const maxLeft = viewportWidth - viewportPadding - tooltipRect.width;
    const desiredLeft =
      anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
    const left = clamp(desiredLeft, viewportPadding, maxLeft);

    const roomAbove = anchorRect.top - viewportPadding;
    const roomBelow = viewportHeight - viewportPadding - anchorRect.bottom;
    const requiredHeight = tooltipRect.height + gap;
    const placement =
      roomAbove >= requiredHeight || roomAbove >= roomBelow ? "top" : "bottom";
    const desiredTop =
      placement === "top"
        ? anchorRect.top - gap - tooltipRect.height
        : anchorRect.bottom + gap;
    const maxTop = viewportHeight - viewportPadding - tooltipRect.height;
    const top = clamp(desiredTop, viewportPadding, maxTop);

    const anchorCenter = anchorRect.left + anchorRect.width / 2;
    const arrowMax = Math.max(MIN_ARROW_INSET, tooltipRect.width - MIN_ARROW_INSET);
    const arrowX = clamp(
      anchorCenter - left,
      MIN_ARROW_INSET,
      arrowMax
    );

    tooltip.dataset.placement = placement;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.setProperty("--persona-tooltip-arrow-x", `${arrowX}px`);
  };

  const show = (): void => {
    if (destroyed || !enabled || tooltip || !anchor.isConnected) return;
    // Checked at open time, not at attach time: the same control moves in and
    // out of a suppressing subtree as the overflow policy changes.
    if (isSuppressed(anchor)) return;
    const copy = resolvedText();
    const container = tooltipContainer(anchor);
    if (!copy || !container) return;

    const ownerDocument = currentDocument();
    const ownerWindow = currentWindow();
    tooltip = ownerDocument.createElement("div");
    tooltip.className = "persona-control-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.dataset.state = "measuring";
    tooltip.style.zIndex = String(PORTALED_OVERLAY_Z_INDEX);

    const computed = ownerWindow.getComputedStyle?.(anchor);
    if (computed) {
      for (const name of INHERITED_VARS) {
        const value = computed.getPropertyValue(name).trim();
        if (value) tooltip.style.setProperty(name, value);
      }
      // Body portal inherits the host page font, not the widget's; the anchor's
      // resolved family is the font the control actually renders in.
      if (computed.fontFamily) tooltip.style.fontFamily = computed.fontFamily;
    }

    label = ownerDocument.createElement("span");
    label.className = "persona-control-tooltip__label";
    label.textContent = copy;
    tooltip.appendChild(label);

    const hintCopy = resolvedHint();
    if (hintCopy) {
      hintChip = ownerDocument.createElement("span");
      hintChip.className = "persona-control-tooltip__hint";
      hintChip.textContent = hintCopy;
      tooltip.appendChild(hintChip);
    }

    const arrow = ownerDocument.createElement("span");
    arrow.className = "persona-control-tooltip__arrow";
    tooltip.appendChild(arrow);

    container.appendChild(tooltip);
    reposition();
    tooltip.dataset.state = "open";

    const onReposition = (): void => {
      if (!anchor.isConnected) {
        hide();
        return;
      }
      if (label) label.textContent = resolvedText();
      if (hintChip) hintChip.textContent = resolvedHint();
      reposition();
    };
    ownerWindow.addEventListener("scroll", onReposition, true);
    ownerWindow.addEventListener("resize", onReposition);

    const root = anchor.getRootNode();
    const mutationTarget =
      isShadowRoot(root)
        ? root
        : ownerDocument.documentElement;
    const observer =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            if (!anchor.isConnected) hide();
          });
    observer?.observe(mutationTarget, { childList: true, subtree: true });

    detachOpenListeners = () => {
      ownerWindow.removeEventListener("scroll", onReposition, true);
      ownerWindow.removeEventListener("resize", onReposition);
      observer?.disconnect();
    };
  };

  const scheduleShow = (immediate: boolean): void => {
    if (destroyed || tooltip) return;
    clearOpenTimer();
    if (immediate || resolvedDelayMs() <= 0 || isSkipDelayWarm()) {
      show();
      return;
    }
    openTimer = currentWindow().setTimeout(() => {
      openTimer = undefined;
      show();
    }, resolvedDelayMs());
  };

  const syncVisibility = (): void => {
    if (hovered || focused) scheduleShow(focused);
    else hide();
  };
  const onMouseEnter = (): void => {
    const ownerWindow = currentWindow();
    const hasHover =
      !ownerWindow.matchMedia ||
      !ownerWindow.matchMedia("(hover: none)").matches;
    if (!hasHover) return;
    hovered = true;
    syncVisibility();
  };
  const onMouseLeave = (): void => {
    hovered = false;
    syncVisibility();
  };
  const onFocus = (): void => {
    // Only keyboard-visible focus opens the tooltip: a shell moving focus
    // programmatically after a mouse interaction must not pop one.
    try {
      focused = anchor.matches(":focus-visible");
    } catch {
      focused = true;
    }
    syncVisibility();
  };
  const onBlur = (): void => {
    focused = false;
    syncVisibility();
  };
  // Activation dismisses the tooltip. The flags re-arm on the next mouseenter
  // or keyboard-visible focus, which re-reads whatever label the control now has.
  const dismiss = (): void => {
    hovered = false;
    focused = false;
    hide();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") dismiss();
  };

  trigger.addEventListener("mouseenter", onMouseEnter);
  trigger.addEventListener("mouseleave", onMouseLeave);
  anchor.addEventListener("focus", onFocus);
  anchor.addEventListener("blur", onBlur);
  anchor.addEventListener("keydown", onKeyDown);
  anchor.addEventListener("click", dismiss);

  const handle: TooltipHandle = {
    get isOpen() {
      return tooltip !== null;
    },
    show,
    hide,
    reposition,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      hide();
      trigger.removeEventListener("mouseenter", onMouseEnter);
      trigger.removeEventListener("mouseleave", onMouseLeave);
      anchor.removeEventListener("focus", onFocus);
      anchor.removeEventListener("blur", onBlur);
      anchor.removeEventListener("keydown", onKeyDown);
      anchor.removeEventListener("click", dismiss);
      handles.delete(anchor);
    },
  };

  handles.set(anchor, handle);
  return handle;
}
