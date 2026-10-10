import type { AgentWidgetConfig, SlotRenderContext, SlotRenderer, SlotRenderResult, WidgetLayoutSlot } from "../types";

type SlotEntry = {
  renderer: SlotRenderer;
  abort: AbortController;
  result: SlotRenderResult;
};

/** Instance-owned render lifetimes. DOM placement stays with the UI controller. */
export function createLayoutSlots(options: {
  config: () => AgentWidgetConfig;
  defaultContent: (slot: WidgetLayoutSlot) => HTMLElement | null;
  mount: (slot: WidgetLayoutSlot, element: HTMLElement) => void;
  remove: (slot: WidgetLayoutSlot, element: HTMLElement | null) => void;
}) {
  const entries = new Map<WidgetLayoutSlot, SlotEntry>();
  const context = (slot: WidgetLayoutSlot, entry: SlotEntry): SlotRenderContext => ({
    slot,
    signal: entry.abort.signal,
    config: options.config(),
    defaultContent: () => options.defaultContent(slot),
  });
  const dispose = (slot: WidgetLayoutSlot, entry: SlotEntry) => {
    entries.delete(slot);
    entry.abort.abort();
    try { entry.result.destroy?.(); }
    catch (error) { console.error(`[AgentWidget] Error destroying slot "${slot}":`, error); }
    options.remove(slot, entry.result.element);
  };
  return {
    update() {
      const slots = options.config().layout?.slots ?? {};
      for (const [slot, entry] of entries) {
        if (slots[slot] !== entry.renderer) dispose(slot, entry);
      }
      for (const [slot, renderer] of Object.entries(slots) as [WidgetLayoutSlot, SlotRenderer | undefined][]) {
        if (!renderer) continue;
        let entry = entries.get(slot);
        try {
          if (!entry) {
            entry = { renderer, abort: new AbortController(), result: { element: null } };
            entries.set(slot, entry);
            const rendered = renderer(context(slot, entry));
            entry.result = rendered === null || "nodeType" in rendered
              ? { element: rendered } : rendered;
          } else if (entry.result.update) {
            const next = entry.result.update(context(slot, entry));
            if (next !== undefined && next !== entry.result.element) {
              options.remove(slot, entry.result.element);
              entry.result.element = next;
            }
          }
          if (entry.result.element) options.mount(slot, entry.result.element);
        } catch (error) {
          if (entry) dispose(slot, entry);
          console.error(`[AgentWidget] Error rendering slot "${slot}":`, error);
        }
      }
    },
    remount() {
      for (const [slot, entry] of entries) {
        if (entry.result.element) options.mount(slot, entry.result.element);
      }
    },
    /** Detach only the DOM when a composer surface is replaced. Lifetimes survive. */
    detach(slots: readonly WidgetLayoutSlot[]) {
      for (const slot of slots) {
        const entry = entries.get(slot);
        if (entry) options.remove(slot, entry.result.element);
      }
    },
    destroy() {
      for (const [slot, entry] of entries) dispose(slot, entry);
    },
  };
}
