import type { DeckStore } from "./store";
import type { SlideElement } from "./types";
import { SLIDE_H, SLIDE_W, clamp } from "./types";
import { getTheme } from "./themes";
import { renderSlide } from "./render";

// Editor canvas: renders the current slide at a fixed 960x540 logical size,
// scaled to fit the available space with a CSS transform, and layers an
// interaction overlay (selection outlines + resize handles) on top of the
// pure-rendered slide. Drags and resizes mutate the DOM directly for live
// feedback and commit ONCE at pointerup: one gesture, one undo step.

type ResizeDir = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const RESIZE_DIRS: ResizeDir[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const MIN_SIZE = 12;
const TEXT_TYPES = new Set(["text"]);

export type Canvas = {
  rerender: () => void;
};

export const createCanvas = (
  store: DeckStore,
  container: HTMLElement,
): Canvas => {
  container.classList.add("wm-canvas");
  const viewport = document.createElement("div");
  viewport.className = "wm-canvas-viewport";
  const wrap = document.createElement("div");
  wrap.className = "wm-stage-wrap";
  wrap.style.width = `${SLIDE_W}px`;
  wrap.style.height = `${SLIDE_H}px`;
  const overlay = document.createElement("div");
  overlay.className = "wm-overlay";
  viewport.appendChild(wrap);
  container.appendChild(viewport);

  let scale = 1;
  let slideNode: HTMLElement | null = null;
  let editing: { id: string; node: HTMLElement; original: string } | null = null;

  const fit = (): void => {
    const rect = container.getBoundingClientRect();
    const pad = 32;
    scale = Math.max(
      0.05,
      Math.min((rect.width - pad) / SLIDE_W, (rect.height - pad) / SLIDE_H),
    );
    viewport.style.width = `${SLIDE_W * scale}px`;
    viewport.style.height = `${SLIDE_H * scale}px`;
    wrap.style.transform = `scale(${scale})`;
  };
  new ResizeObserver(fit).observe(container);

  const elementNode = (id: string): HTMLElement | null =>
    wrap.querySelector<HTMLElement>(`[data-element-id="${id}"]`);

  // ---- selection overlay -------------------------------------------------

  const renderOverlay = (): void => {
    overlay.innerHTML = "";
    const selected = store.selectedElements();
    for (const el of selected) {
      const box = document.createElement("div");
      box.className = "wm-selection-box";
      box.style.left = `${el.x}px`;
      box.style.top = `${el.y}px`;
      box.style.width = `${el.w}px`;
      box.style.height = `${el.h}px`;
      if (el.rotation) box.style.transform = `rotate(${el.rotation}deg)`;
      // Resize handles only on a single selection: multi-select gets
      // outlines, and group operations belong to align/style tools.
      if (selected.length === 1) {
        for (const dir of RESIZE_DIRS) {
          const handle = document.createElement("div");
          handle.className = `wm-handle wm-handle-${dir}`;
          handle.dataset.dir = dir;
          handle.dataset.elementId = el.id;
          box.appendChild(handle);
        }
      }
      overlay.appendChild(box);
    }
  };

  // ---- rendering ---------------------------------------------------------

  const render = (): void => {
    if (editing) return; // modal text session: re-render on commit/cancel
    const theme = getTheme(store.deck.themeId);
    const fresh = renderSlide(store.currentSlide, theme);
    if (slideNode) slideNode.remove();
    slideNode = fresh;
    wrap.insertBefore(fresh, wrap.firstChild);
    if (!overlay.isConnected) wrap.appendChild(overlay);
    renderOverlay();
  };

  // ---- inline text editing (modal session, single commit on exit) ---------

  const endEdit = (save: boolean): void => {
    if (!editing) return;
    const { id, node, original } = editing;
    const nextText = node.innerText.replace(/\n+$/, "");
    node.contentEditable = "false";
    editing = null;
    if (save && nextText !== original) {
      store.commit((deck) => {
        for (const slide of deck.slides) {
          const el = slide.elements.find((e) => e.id === id);
          if (el) el.text = nextText;
        }
      });
    } else {
      render();
    }
  };

  const beginEdit = (id: string): void => {
    const el = store.currentSlide.elements.find((e) => e.id === id);
    const node = elementNode(id);
    if (!el || !node || !TEXT_TYPES.has(el.type)) return;
    editing = { id, node, original: el.text ?? "" };
    overlay.innerHTML = "";
    try {
      node.contentEditable = "plaintext-only";
    } catch {
      node.contentEditable = "true"; // Firefox: no plaintext-only support
    }
    node.classList.add("wm-editing");
    node.focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    const onBlur = (): void => endEdit(true);
    node.addEventListener("blur", onBlur, { once: true });
    node.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        node.removeEventListener("blur", onBlur);
        endEdit(false);
      }
      event.stopPropagation();
    });
  };

  // ---- drag to move / resize ----------------------------------------------

  type DragState =
    | {
        kind: "move";
        startX: number;
        startY: number;
        items: { id: string; node: HTMLElement; x: number; y: number }[];
        moved: boolean;
      }
    | {
        kind: "resize";
        startX: number;
        startY: number;
        dir: ResizeDir;
        id: string;
        node: HTMLElement;
        start: { x: number; y: number; w: number; h: number };
        moved: boolean;
      };

  let drag: DragState | null = null;

  const applyResize = (
    state: Extract<DragState, { kind: "resize" }>,
    dx: number,
    dy: number,
  ): { x: number; y: number; w: number; h: number } => {
    let { x, y, w, h } = state.start;
    const { dir } = state;
    if (dir.includes("e")) w = Math.max(MIN_SIZE, state.start.w + dx);
    if (dir.includes("s")) h = Math.max(MIN_SIZE, state.start.h + dy);
    if (dir.includes("w")) {
      w = Math.max(MIN_SIZE, state.start.w - dx);
      x = state.start.x + (state.start.w - w);
    }
    if (dir.includes("n")) {
      h = Math.max(MIN_SIZE, state.start.h - dy);
      y = state.start.y + (state.start.h - h);
    }
    return { x, y, w, h };
  };

  wrap.addEventListener("pointerdown", (event) => {
    if (editing || store.mode !== "edit") return;
    const target = event.target as HTMLElement;

    const handle = target.closest<HTMLElement>(".wm-handle");
    if (handle) {
      const id = handle.dataset.elementId ?? "";
      const el = store.currentSlide.elements.find((e) => e.id === id);
      const node = elementNode(id);
      if (!el || !node) return;
      drag = {
        kind: "resize",
        startX: event.clientX,
        startY: event.clientY,
        dir: handle.dataset.dir as ResizeDir,
        id,
        node,
        start: { x: el.x, y: el.y, w: el.w, h: el.h },
        moved: false,
      };
      wrap.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }

    const elNode = target.closest<HTMLElement>("[data-element-id]");
    if (!elNode) {
      store.setSelection([]);
      return;
    }
    const id = elNode.dataset.elementId ?? "";
    if (event.shiftKey) {
      store.toggleSelected(id);
      return;
    }
    if (!store.selection.has(id)) store.setSelection([id]);

    drag = {
      kind: "move",
      startX: event.clientX,
      startY: event.clientY,
      items: store.selectedElements().flatMap((el) => {
        const node = elementNode(el.id);
        return node ? [{ id: el.id, node, x: el.x, y: el.y }] : [];
      }),
      moved: false,
    };
    wrap.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  wrap.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / scale;
    const dy = (event.clientY - drag.startY) / scale;
    if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true;
    overlay.innerHTML = ""; // hide stale selection chrome during the gesture
    if (drag.kind === "move") {
      for (const item of drag.items) {
        item.node.style.left = `${item.x + dx}px`;
        item.node.style.top = `${item.y + dy}px`;
      }
    } else {
      const next = applyResize(drag, dx, dy);
      drag.node.style.left = `${next.x}px`;
      drag.node.style.top = `${next.y}px`;
      drag.node.style.width = `${next.w}px`;
      drag.node.style.height = `${next.h}px`;
    }
  });

  const finishDrag = (event: PointerEvent): void => {
    if (!drag) return;
    const state = drag;
    drag = null;
    if (!state.moved) {
      renderOverlay();
      return;
    }
    const dx = (event.clientX - state.startX) / scale;
    const dy = (event.clientY - state.startY) / scale;
    store.commit((deck) => {
      const slide = deck.slides[store.currentSlideIndex];
      if (state.kind === "move") {
        for (const item of state.items) {
          const el = slide.elements.find((e) => e.id === item.id);
          if (!el) continue;
          el.x = Math.round(clamp(item.x + dx, -el.w + 8, SLIDE_W - 8));
          el.y = Math.round(clamp(item.y + dy, -el.h + 8, SLIDE_H - 8));
        }
      } else {
        const el = slide.elements.find((e) => e.id === state.id);
        if (!el) return;
        const next = applyResize(state, dx, dy);
        el.x = Math.round(next.x);
        el.y = Math.round(next.y);
        el.w = Math.round(next.w);
        el.h = Math.round(next.h);
      }
    });
  };

  wrap.addEventListener("pointerup", finishDrag);
  wrap.addEventListener("pointercancel", finishDrag);

  wrap.addEventListener("dblclick", (event) => {
    if (store.mode !== "edit") return;
    const elNode = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-element-id]",
    );
    if (elNode?.dataset.elementId) beginEdit(elNode.dataset.elementId);
  });

  // ---- keyboard -----------------------------------------------------------

  const isTypingTarget = (target: EventTarget | null): boolean => {
    const el = target as HTMLElement | null;
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName?.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select";
  };

  document.addEventListener("keydown", (event) => {
    if (store.mode !== "edit" || editing || isTypingTarget(event.target)) return;

    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) store.redo();
      else store.undo();
      return;
    }

    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      store.selection.size > 0
    ) {
      event.preventDefault();
      const ids = new Set(store.selection);
      store.commit((deck) => {
        const slide = deck.slides[store.currentSlideIndex];
        slide.elements = slide.elements.filter((el) => !ids.has(el.id));
      });
      return;
    }

    const nudge: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (nudge[event.key] && store.selection.size > 0) {
      event.preventDefault();
      const [dx, dy] = nudge[event.key];
      const step = event.shiftKey ? 10 : 1;
      const ids = new Set(store.selection);
      store.commit((deck) => {
        const slide = deck.slides[store.currentSlideIndex];
        for (const el of slide.elements) {
          if (!ids.has(el.id)) continue;
          el.x += dx * step;
          el.y += dy * step;
        }
      });
    }
  });

  store.subscribe(render);
  fit();
  render();

  return { rerender: render };
};

/** Live geometry for one element, used by get_selection / context provider. */
export const elementBounds = (
  el: SlideElement,
): { x: number; y: number; w: number; h: number } => ({
  x: el.x,
  y: el.y,
  w: el.w,
  h: el.h,
});
