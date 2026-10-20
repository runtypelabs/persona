import type { AgentWidgetConfig, LoadingLabelAnimationContext, LoadingLabelAnimationHandle } from "../types";

/** Per-widget handles follow committed elements, never speculative render trees. */
export function createLoadingLabelLifecycle(root: HTMLElement, getConfig: () => AgentWidgetConfig) {
  let disposed = false;
  const handles = new Map<HTMLElement, {
    start: NonNullable<NonNullable<AgentWidgetConfig["loadingLabel"]>["animate"]>;
    kind: LoadingLabelAnimationContext["kind"];
    handle: LoadingLabelAnimationHandle | void;
  }>();
  const motion = root.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)");
  const safely = (run: () => void) => {
    try { run(); } catch (error) { console.warn("[persona] Loading label animation failed", error); }
  };
  const dispose = (element: HTMLElement) => {
    const entry = handles.get(element);
    handles.delete(element);
    if (entry?.handle) safely(() => entry.handle?.destroy());
  };
  const key = (element: HTMLElement) => `${element.closest<HTMLElement>("[data-wrapper-id]")?.dataset.wrapperId ?? ""}:${element.dataset.personaLoadingLabel}`;
  const prepare = (next: HTMLElement) => {
    if (disposed) return;
    const start = !motion?.matches ? getConfig().loadingLabel?.animate : undefined;
    if (!start && !handles.size) return;
    const desired = new Set(Array.from(next.querySelectorAll<HTMLElement>("[data-persona-loading-label]"), key));
    // Reuse stubs deliberately omit descendants: their live labels survive the morph.
    const reused = new Set(Array.from(next.querySelectorAll<HTMLElement>("[data-persona-reuse]"), row => row.dataset.wrapperId));
    for (const [element, entry] of handles) {
      const retained = reused.has(element.closest<HTMLElement>("[data-wrapper-id]")?.dataset.wrapperId);
      if (entry.start !== start || (!retained && !desired.has(key(element)))) dispose(element);
    }
  };
  const sync = () => {
    if (disposed) return;
    const config = getConfig();
    const start = !motion?.matches ? config.loadingLabel?.animate : undefined;
    if (!start && !handles.size) return;
    const live = new Set(root.querySelectorAll<HTMLElement>("[data-persona-loading-label]"));
    for (const [element, entry] of handles) {
      if (!start || entry.start !== start || !live.has(element) || element.dataset.personaLoadingLabel !== entry.kind) dispose(element);
    }
    if (!start) return;
    for (const element of live) {
      if (disposed || getConfig().loadingLabel?.animate !== start) break;
      const context: LoadingLabelAnimationContext = {
        element, config, text: element.dataset.personaLoadingText ?? "",
        kind: element.dataset.personaLoadingLabel as LoadingLabelAnimationContext["kind"],
        reducedMotion: false,
      };
      const entry = handles.get(element);
      if (entry) safely(() => entry.handle?.update?.(context));
      else {
        // Register even a void handle: start still runs only once per element.
        const next = { start, kind: context.kind, handle: undefined as LoadingLabelAnimationHandle | void };
        handles.set(element, next);
        safely(() => {
          const handle = start(context);
          if (handles.get(element) === next) next.handle = handle;
          else handle?.destroy();
        });
      }
    }
  };
  motion?.addEventListener?.("change", sync);
  return {
    prepare, sync,
    destroy() { disposed = true; motion?.removeEventListener?.("change", sync); for (const element of handles.keys()) dispose(element); },
  };
}
