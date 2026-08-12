import { PORTALED_OVERLAY_Z_INDEX } from "./constants";

const DEFAULT_GAP = 8;
const DEFAULT_VIEWPORT_PADDING = 8;
const MIN_ARROW_INSET = 10;

export interface TooltipOptions {
  /** The control the tooltip describes and positions against. */
  anchor: HTMLElement;
  /** Hover target. Defaults to `anchor`; wrappers make small icon buttons easier to hit. */
  trigger?: HTMLElement;
  /** Tooltip copy. A callback keeps live aria-label updates in sync. */
  text: string | (() => string);
  /** Whether the visual tooltip may open. The anchor's accessible name is unaffected. */
  enabled?: boolean;
  /** Gap between the control and tooltip, in pixels. */
  gap?: number;
  /** Minimum distance from viewport edges, in pixels. */
  viewportPadding?: number;
}

export interface TooltipHandle {
  readonly isOpen: boolean;
  show(): void;
  hide(): void;
  reposition(): void;
  destroy(): void;
}

const handles = new WeakMap<HTMLElement, TooltipHandle>();

const isShadowRoot = (root: Node): root is ShadowRoot =>
  root.nodeType === Node.DOCUMENT_FRAGMENT_NODE && "host" in root;

const tooltipContainer = (anchor: HTMLElement): HTMLElement | ShadowRoot | null => {
  const root = anchor.getRootNode?.();
  if (isShadowRoot(root)) return root;
  return anchor.ownerDocument.body;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

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
    enabled = true,
    gap = DEFAULT_GAP,
    viewportPadding = DEFAULT_VIEWPORT_PADDING,
  } = options;
  const currentDocument = (): Document => anchor.ownerDocument;
  const currentWindow = (): Window =>
    currentDocument().defaultView ?? window;

  let tooltip: HTMLElement | null = null;
  let label: HTMLElement | null = null;
  let detachOpenListeners: (() => void) | null = null;
  let hovered = false;
  let focused = false;
  let destroyed = false;

  const resolvedText = (): string =>
    (typeof text === "function" ? text() : text).trim();

  const hide = (): void => {
    detachOpenListeners?.();
    detachOpenListeners = null;
    tooltip?.remove();
    tooltip = null;
    label = null;
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

    label = ownerDocument.createElement("span");
    label.className = "persona-control-tooltip__label";
    label.textContent = copy;
    tooltip.appendChild(label);

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

  const syncVisibility = (): void => {
    if (hovered || focused) show();
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
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    hovered = false;
    focused = false;
    hide();
  };

  trigger.addEventListener("mouseenter", onMouseEnter);
  trigger.addEventListener("mouseleave", onMouseLeave);
  anchor.addEventListener("focus", onFocus);
  anchor.addEventListener("blur", onBlur);
  anchor.addEventListener("keydown", onKeyDown);

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
      handles.delete(anchor);
    },
  };

  handles.set(anchor, handle);
  return handle;
}
