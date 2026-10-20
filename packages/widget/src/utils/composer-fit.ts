/** Width fit is independent of the draft's wrap latch and recovers on resize. */
export const COMPOSER_MIN_EDITOR_WIDTH = 120;
const FIT_SLACK = 16;

export function composerRowFits(
  available: number,
  actions: number,
  gap: number,
  previouslyFit: boolean
): boolean {
  // Hidden surfaces and DOM implementations without layout are measured again
  // when shown. Do not force an initially hidden composer into expanded state.
  if (available <= 0) return previouslyFit;
  const required = actions + gap * 2 + COMPOSER_MIN_EDITOR_WIDTH;
  return available >= required + (previouslyFit ? 0 : FIT_SLACK);
}

export interface ComposerFitSurface {
  form: HTMLElement;
  input: HTMLElement;
  start: HTMLElement;
  end: HTMLElement;
  /** Stacked editors retain their existing auto-height lifecycle. */
  resizeInput?: boolean;
}

const number = (value: string): number => Number.parseFloat(value) || 0;

/** Sum children instead of a cluster's width: stacked flex rails can stretch
 * or scroll. Children retain their control widths in both arrangements. */
function clusterWidth(
  element: HTMLElement,
  view: Window & typeof globalThis
): number {
  const style = view.getComputedStyle(element);
  if (style.display === "none") return 0;
  const children = Array.from(element.children).filter(
    (child): child is HTMLElement => {
      if (!(child instanceof view.HTMLElement)) return false;
      const childStyle = view.getComputedStyle(child);
      return childStyle.display !== "none" &&
        !["absolute", "fixed"].includes(childStyle.position);
    }
  );
  const width = children.reduce((total, child) => {
    const childStyle = view.getComputedStyle(child);
    const childWidth = childStyle.display === "contents"
      ? clusterWidth(child, view)
      : Math.max(child.getBoundingClientRect().width, child.scrollWidth);
    return total + childWidth +
      number(childStyle.marginLeft) + number(childStyle.marginRight);
  }, 0);
  return width + Math.max(0, children.length - 1) * number(style.columnGap) +
    number(style.paddingLeft) + number(style.paddingRight);
}

/** Observers belong to one surface and schedule writes outside the resize
 * callback. Rebinding destroys old observers, including queued frame work. */
export function createComposerFitObserver(options: {
  getSurface: () => ComposerFitSurface | null;
  onMeasure: () => void;
}): { measure: () => boolean; toolbarCrowded: () => boolean; refresh: () => void; destroy: () => void } {
  let surface: ComposerFitSurface | null = null;
  let resize: ResizeObserver | null = null;
  let mutations: MutationObserver | null = null;
  let frame: number | null = null;
  let inputWidth = 0;
  let fits = true;
  let crowded = false;
  let destroyed = false;
  const disconnect = () => {
    if (frame !== null) {
      surface?.form.ownerDocument.defaultView?.cancelAnimationFrame(frame);
    }
    frame = null;
    resize?.disconnect();
    mutations?.disconnect();
    resize = null;
    mutations = null;
    surface?.form.ownerDocument.defaultView?.removeEventListener("resize", refresh);
  };
  const refresh = () => {
    if (destroyed || frame !== null) return;
    const view = surface?.form.ownerDocument.defaultView;
    if (!view) return;
    frame = view.requestAnimationFrame(() => {
      frame = null;
      if (!destroyed) options.onMeasure();
    });
  };
  const measure = () => {
    if (destroyed) return fits;
    const next = options.getSurface();
    if (
      next?.form !== surface?.form || next?.input !== surface?.input ||
      next?.start !== surface?.start || next?.end !== surface?.end
    ) {
      disconnect();
      surface = next;
      fits = true;
      crowded = false;
      inputWidth = 0;
      const view = surface?.form.ownerDocument.defaultView;
      if (surface && view) {
        view.addEventListener("resize", refresh);
        if (typeof view.ResizeObserver !== "undefined") {
          resize = new view.ResizeObserver(refresh);
          const elements = [surface.form, surface.start, surface.end, surface.input];
          for (const element of elements) {
            resize.observe(element);
          }
        }
        if (typeof view.MutationObserver !== "undefined") {
          mutations = new view.MutationObserver((records) => {
            // Input height is measured transiently by the wrap detector. Only
            // controls and slots can change action width through style writes.
            if (records.some((record) =>
              record.target !== surface?.input || record.type !== "attributes"
            )) refresh();
          });
          mutations.observe(surface.form, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["class", "style", "hidden"],
          });
        }
      }
    }
    if (surface && next) surface.resizeInput = next.resizeInput;
    const view = surface?.form.ownerDocument.defaultView;
    if (!surface || !view) return true;
    if (!surface.form.clientWidth) return fits;
    const style = view.getComputedStyle(surface.form);
    const available = Math.max(
      1, surface.form.clientWidth - number(style.paddingLeft) - number(style.paddingRight)
    );
    const actions = clusterWidth(surface.start, view) + clusterWidth(surface.end, view);
    const gap = number(style.columnGap);
    crowded = actions + gap + (crowded ? FIT_SLACK : 0) > available;
    fits = composerRowFits(available, actions, gap, fits);
    const width = surface.input.getBoundingClientRect().width;
    if (surface.resizeInput !== false && width > 0 && width !== inputWidth && surface.input.tagName === "TEXTAREA") {
      // Host and row changes need the same natural-height refresh as typing,
      // without dispatching synthetic user-input events or disturbing selection.
      inputWidth = width;
      surface.input.style.height = "auto";
      const maxHeight = number(view.getComputedStyle(surface.input).maxHeight) || Infinity;
      const height = Math.min(surface.input.scrollHeight, maxHeight);
      surface.input.style.height = `${height}px`;
    }
    return fits;
  };
  return {
    measure,
    toolbarCrowded: () => crowded,
    refresh,
    destroy: () => {
      destroyed = true;
      disconnect();
      surface = null;
    },
  };
}
