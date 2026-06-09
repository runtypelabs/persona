// Plugin Kit — small, dependency-free utilities for authoring Persona plugins.
//
// Plugin render hooks (`renderApproval`, `renderAskUserQuestion`, `renderMessage`,
// …) return a detached `HTMLElement` that the widget morphs into the transcript.
// Two needs come up again and again when that element is more than static markup:
//
//   1. Injecting the plugin's own CSS so it survives the widget's Shadow-DOM mode
//      (a plain `document.head` <style> does NOT pierce a shadow root).
//   2. Floating UI — dropdowns, menus, tooltips — that must overlay the rest of
//      the widget and not be clipped by the transcript's scroll container.
//
// Both are easy to get subtly wrong, so they live here as a supported, optional
// subpath: `@runtypelabs/persona/plugin-kit`. Importing it costs nothing unless
// you use it, and nothing here touches the widget's core bundle.
//
// ```ts
// import { injectStyles, createPopover, isEditableEventTarget } from
//   "@runtypelabs/persona/plugin-kit";
// ```

/* ============================================================
   Shadow-safe style injection
   ============================================================ */

/**
 * Resolve the root a node's styles should live in.
 *
 * Returns the node's `ShadowRoot` when it (or an ancestor) is shadowed, the
 * owning `Document` otherwise. A `<style>` placed in this root reaches the node
 * regardless of whether the widget runs in light or shadow DOM. For a detached
 * node (one not yet mounted) this falls back to the owning document.
 */
export function getStyleRoot(node: Node): Document | ShadowRoot {
  const root = node.getRootNode?.();
  if (root instanceof ShadowRoot) return root;
  if (root instanceof Document) return root;
  return node.ownerDocument ?? document;
}

function injectInto(root: Document | ShadowRoot, id: string, css: string): void {
  const container: Document | ShadowRoot | HTMLHeadElement =
    root instanceof Document ? root.head : root;
  const escaped = id.replace(/["\\]/g, "\\$&");
  if (container.querySelector(`style[data-persona-plugin-style="${escaped}"]`)) {
    return; // Already present in this root — idempotent.
  }
  const doc = root instanceof Document ? root : root.ownerDocument ?? document;
  const style = doc.createElement("style");
  style.setAttribute("data-persona-plugin-style", id);
  style.textContent = css;
  container.appendChild(style);
}

/**
 * Inject a plugin's CSS once into the correct root — the widget's shadow root
 * when shadowed, the document head otherwise. Idempotent: keyed by `id`, so it
 * is safe to call on every render.
 *
 * Pass the element you're about to return from a render hook. While building, an
 * element is detached and its eventual root is unknown, so this injects into the
 * owning document immediately (covering the default light-DOM case with no
 * flash) and then, on the next microtask — after the widget has mounted the
 * element — re-resolves and also injects into its shadow root if it landed in
 * one. You may also pass an explicit `Document` or `ShadowRoot`.
 *
 * @example
 * ```ts
 * renderApproval: ({ message, approve, deny }) => {
 *   const card = buildCard(message.approval, approve, deny);
 *   injectStyles(card, "my-approval-plugin", CSS);
 *   return card;
 * }
 * ```
 */
export function injectStyles(
  target: Node | Document | ShadowRoot,
  id: string,
  css: string
): void {
  if (target instanceof Document || target instanceof ShadowRoot) {
    injectInto(target, id, css);
    return;
  }
  const node = target;
  if (node.isConnected) {
    injectInto(getStyleRoot(node), id, css);
    return;
  }
  // Detached (built but not yet mounted): inject into the owning document now,
  // then re-resolve after mount so shadow-DOM widgets also get the <style>.
  const doc = node.ownerDocument ?? document;
  injectInto(doc, id, css);
  queueMicrotask(() => {
    const root = getStyleRoot(node);
    if (root !== doc) injectInto(root, id, css);
  });
}

/* ============================================================
   Floating popover
   ============================================================ */

export type PopoverPlacement =
  | "bottom-start"
  | "bottom-end"
  | "top-start"
  | "top-end";

export interface PopoverOptions {
  /** Element the popover is positioned against. */
  anchor: HTMLElement;
  /** The floating element (menu, tooltip, panel). Built detached; mounted on `open`. */
  content: HTMLElement;
  /** Where to place `content` relative to `anchor`. Default `"bottom-start"`. */
  placement?: PopoverPlacement;
  /** Gap in px between anchor and content. Default `6`. */
  offset?: number;
  /** Set `content`'s `min-width` to the anchor's width. Default `false`. */
  matchAnchorWidth?: boolean;
  /**
   * Inline `z-index` for `content`. Default `2147483000` so it overlays the rest
   * of the widget. Pass `null` to leave z-index to your own CSS.
   */
  zIndex?: number | null;
  /**
   * Where to mount `content`. Defaults to the anchor's shadow root (when
   * shadowed) or `document.body` — keeping it inside the same style + stacking
   * scope as the anchor while escaping the transcript's scroll clipping.
   */
  container?: HTMLElement | ShadowRoot;
  onOpen?: () => void;
  /** Fired when the popover closes by itself (outside click or the anchor leaving the DOM). */
  onDismiss?: (reason: "outside" | "anchor-removed") => void;
}

export interface PopoverHandle {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  toggle(): void;
  /** Recompute position from the current anchor rect (called automatically on scroll/resize). */
  reposition(): void;
  /** Close and release all listeners; the handle is inert afterward. */
  destroy(): void;
}

function defaultContainer(anchor: HTMLElement): HTMLElement | ShadowRoot {
  const root = anchor.getRootNode?.();
  if (root instanceof ShadowRoot) return root;
  return (anchor.ownerDocument ?? document).body;
}

/**
 * A floating popover anchored to an element: `fixed`-positioned (so it overlays
 * the rest of the widget and isn't clipped by scroll containers), dismissed on
 * outside pointerdown, repositioned on scroll/resize, and auto-closed if the
 * anchor leaves the DOM. Mount your styles with {@link injectStyles}.
 *
 * @example
 * ```ts
 * const popover = createPopover({
 *   anchor: splitButton,
 *   content: menu,
 *   placement: "bottom-start",
 *   matchAnchorWidth: true,
 * });
 * caret.addEventListener("click", () => popover.toggle());
 * // on teardown: popover.destroy();
 * ```
 */
export function createPopover(options: PopoverOptions): PopoverHandle {
  const {
    anchor,
    content,
    placement = "bottom-start",
    offset = 6,
    matchAnchorWidth = false,
    zIndex = 2147483000,
    onOpen,
    onDismiss,
  } = options;

  const container = options.container ?? defaultContainer(anchor);
  let open = false;
  let detach: (() => void) | null = null;

  const reposition = (): void => {
    if (!open) return;
    const rect = anchor.getBoundingClientRect();
    content.style.position = "fixed";
    if (matchAnchorWidth) content.style.minWidth = `${rect.width}px`;

    const top =
      placement === "top-start" || placement === "top-end"
        ? rect.top - offset - content.getBoundingClientRect().height
        : rect.bottom + offset;

    const left =
      placement === "bottom-end" || placement === "top-end"
        ? rect.right - content.getBoundingClientRect().width
        : rect.left;

    content.style.top = `${top}px`;
    content.style.left = `${left}px`;
  };

  const close = (): void => {
    if (!open) return;
    open = false;
    if (detach) {
      detach();
      detach = null;
    }
    content.remove();
  };

  const doOpen = (): void => {
    if (open) return;
    open = true;
    if (zIndex != null) content.style.zIndex = String(zIndex);
    container.appendChild(content);
    reposition();

    const ownerWindow = (anchor.ownerDocument ?? document).defaultView ?? window;
    const ownerDocument = anchor.ownerDocument ?? document;

    const onReposition = (): void => {
      if (!anchor.isConnected) {
        close();
        onDismiss?.("anchor-removed");
        return;
      }
      reposition();
    };
    const onOutside = (event: Event): void => {
      const path =
        typeof event.composedPath === "function" ? event.composedPath() : [];
      if (path.includes(content) || path.includes(anchor)) return;
      close();
      onDismiss?.("outside");
    };

    // Defer arming so the click that opened the popover doesn't dismiss it.
    const armId = ownerWindow.setTimeout(() => {
      ownerDocument.addEventListener("pointerdown", onOutside, true);
    }, 0);
    ownerWindow.addEventListener("scroll", onReposition, true);
    ownerWindow.addEventListener("resize", onReposition);

    detach = () => {
      ownerWindow.clearTimeout(armId);
      ownerDocument.removeEventListener("pointerdown", onOutside, true);
      ownerWindow.removeEventListener("scroll", onReposition, true);
      ownerWindow.removeEventListener("resize", onReposition);
    };

    onOpen?.();
  };

  return {
    get isOpen() {
      return open;
    },
    open: doOpen,
    close,
    toggle: () => (open ? close() : doOpen()),
    reposition,
    destroy: close,
  };
}

/* ============================================================
   Keyboard helpers
   ============================================================ */

/**
 * Whether an event originated from an editable element (`<input>`, `<textarea>`,
 * or `contenteditable`). Use it to avoid hijacking keys like Enter/Escape while
 * the user is typing in the composer.
 *
 * Inspects the composed path, so it works for events that cross the widget's
 * Shadow-DOM boundary (where `event.target` is retargeted to the host).
 */
export function isEditableEventTarget(event: Event): boolean {
  const path =
    typeof event.composedPath === "function" ? event.composedPath() : [];
  return path.some(
    (el) =>
      el instanceof HTMLElement &&
      (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.isContentEditable)
  );
}
