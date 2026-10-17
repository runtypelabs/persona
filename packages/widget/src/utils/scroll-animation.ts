import type { AgentWidgetConfig } from "../types";
import { getScrollBottomOffset } from "./auto-follow";

/** Bounded cubic easing with a target that can move during streaming. */
export function createScrollAnimation() {
  let raf: number | null = null;
  const cancel = () => {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
  };
  return {
    get active() { return raf !== null; },
    cancel,
    start(
      element: HTMLElement,
      target: () => number,
      duration: number,
      onFrame: () => void,
      onEnd: () => void,
      shouldContinue: () => boolean = () => true
    ) {
      cancel();
      const start = element.scrollTop;
      const startTime = performance.now();
      if (Math.abs(target() - start) < 1) {
        element.scrollTop = target();
        onFrame();
        onEnd();
        return;
      }
      const frame = (now: number) => {
        if (!shouldContinue()) { cancel(); onEnd(); return; }
        const progress = Math.min(Math.max(0, (now - startTime) / duration), 1);
        element.scrollTop = start + (target() - start) * (1 - Math.pow(1 - progress, 3));
        onFrame();
        if (progress < 1) raf = requestAnimationFrame(frame);
        else { raf = null; onEnd(); }
      };
      raf = requestAnimationFrame(frame);
    },
  };
}

/** Explicit jump only: automatic following keeps its separate policy and animation. */
export function createScrollToLatest(
  element: HTMLElement,
  keyboardScope: HTMLElement,
  onFrame: () => void,
  onComplete: () => void,
  onCancel: () => void
) {
  const animation = createScrollAnimation();
  let destroyed = false;
  let interruptedEvent: Event | undefined;
  let interrupted = false;
  const cancel = (event?: Event) => {
    // Keep scroll events from the cancelling gesture from re-enabling follow.
    // A subsequent input gesture restores the ordinary follow policy.
    if (event) interrupted = false;
    if (!animation.active) return;
    animation.cancel();
    interruptedEvent = event;
    interrupted = !!event;
    onCancel();
  };
  const keydown = (event: KeyboardEvent) => {
    if (["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", " "].includes(event.key)) cancel(event);
  };
  const wheel = (event: WheelEvent) => { if (event.deltaY !== 0) cancel(event); };
  element.addEventListener("wheel", wheel, { passive: true });
  element.addEventListener("touchstart", cancel, { passive: true });
  element.addEventListener("pointerdown", cancel, { passive: true });
  keyboardScope.addEventListener("keydown", keydown);
  return {
    get active() { return animation.active; },
    cancel,
    get interrupted() { return interrupted; },
    interruptedBy: (event: Event) => interruptedEvent === event,
    start(config: AgentWidgetConfig) {
      if (destroyed) return;
      animation.cancel();
      interrupted = false;
      interruptedEvent = undefined;
      const smooth = (config.features?.scrollToBottom?.scrollBehavior ?? (config.future?.v5Defaults ? "smooth" : "instant")) === "smooth";
      const requestedDuration = config.features?.scrollToBottom?.scrollDurationMs ?? 220;
      const duration = Number.isFinite(requestedDuration) && requestedDuration >= 0 ? requestedDuration : 220;
      const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!smooth || reduced || duration === 0) {
        element.scrollTop = getScrollBottomOffset(element);
        onFrame();
        onComplete();
      } else animation.start(element, () => getScrollBottomOffset(element), duration, onFrame, onComplete);
    },
    destroy() {
      destroyed = true;
      animation.cancel();
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("touchstart", cancel);
      element.removeEventListener("pointerdown", cancel);
      keyboardScope.removeEventListener("keydown", keydown);
    },
  };
}
