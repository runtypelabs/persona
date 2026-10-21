import type { AgentWidgetConfig } from "../types";

// Internal animation boundary. Builders own initial/restored presentation; this
// module handles only transitions on live standard disclosure containers.
const selector = "[data-persona-disclosure]";
type Settings = { animation: "instant" | "height"; duration: number; easing: string };
type Running = { effect: Animation; expanded: boolean; settings: string; finish: () => void };
const running = new WeakMap<HTMLElement, Running>();

/** Observe this disclosure's height effect without waiting for looping children. */
export function afterDisclosureAnimation(bubble: HTMLElement, finish: () => void): void {
  running.get(bubble)?.effect.finished?.then(finish, finish) ?? finish();
}

export function disclosureSettings(config?: AgentWidgetConfig): Settings {
  const options = config?.expansion;
  return {
    animation: options?.animation ?? (config?.future?.v5Defaults ? "height" : "instant"),
    duration: Number.isFinite(options?.duration) ? Math.max(0, options!.duration!) : 160,
    easing: options?.easing ?? "ease-out",
  };
}

const parts = (bubble: HTMLElement) => {
  // Own direct children only: a group must never adopt a nested tool's preview.
  const children = Array.from(bubble.children) as HTMLElement[];
  return {
    header: children.find(child => child.matches("button[data-expand-header]")) as HTMLButtonElement | undefined,
    content: children.find(child => child.classList.contains("persona-border-t")),
    preview: children.find(child => child.hasAttribute("data-persona-collapsed-preview")),
  };
};
const expandedState = (bubble: HTMLElement) => parts(bubble).header?.getAttribute("aria-expanded") === "true";
const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function focusHeader(bubble: HTMLElement): void {
  const { header, content } = parts(bubble);
  const tree = bubble.getRootNode() as Document | ShadowRoot;
  if (content?.contains(tree.activeElement)) header?.focus({ preventScroll: true });
}

function display(bubble: HTMLElement, expanded: boolean): void {
  const { content, preview } = parts(bubble);
  if (!content) return;
  if (!expanded) focusHeader(bubble);
  content.inert = !expanded;
  content.style.display = expanded ? "" : "none";
  if (preview) preview.style.display = expanded || !(preview.textContent || preview.childNodes.length) ? "none" : "";
}

function settle(bubble: HTMLElement): void {
  running.get(bubble)?.finish();
}

function settleRelatives(bubble: HTMLElement): void {
  // A fixed ancestor height must never clip details a user has just opened.
  for (let parent = bubble.parentElement?.closest<HTMLElement>(selector); parent; parent = parent.parentElement?.closest<HTMLElement>(selector)) settle(parent);
  bubble.querySelectorAll<HTMLElement>(selector).forEach(settle);
}

export function animateDisclosure(bubble: HTMLElement, expanded: boolean, config?: AgentWidgetConfig, fromHeight?: number): void {
  const settings = disclosureSettings(config);
  const enabled = settings.animation === "height" && settings.duration > 0 && !reducedMotion() && bubble.isConnected && typeof bubble.animate === "function";
  // Instant is the compatibility path: it must not force a layout measurement.
  const from = enabled ? fromHeight ?? bubble.getBoundingClientRect().height : 0;
  const previousContent = enabled && running.has(bubble) ? parts(bubble).content : undefined;
  // Sample before cancelling so a reversal continues both height and content
  // motion from what is actually on screen.
  const previousStyle = previousContent ? getComputedStyle(previousContent) : undefined;
  const previousFrame = previousStyle ? { transform: previousStyle.transform, opacity: previousStyle.opacity } : undefined;
  settleRelatives(bubble);
  settle(bubble);
  display(bubble, expanded);
  if (!enabled) return;
  const { header, content, preview } = parts(bubble);
  if (!header || !content) return;
  const toHeight = bubble.getBoundingClientRect().height;
  if (from === toHeight) return;
  // Closing clips the existing details, then hands off to the preview. Measure
  // the complete closed presentation above: its height may be nonzero.
  if (!expanded) {
    content.style.display = "";
    if (preview) preview.style.display = "none";
  }
  let effect: Animation | undefined;
  let contentEffect: Animation;
  try {
    effect = bubble.animate([
      { height: `${from}px`, boxSizing: "border-box", overflow: "hidden" },
      { height: `${toHeight}px`, boxSizing: "border-box", overflow: "hidden" },
    ], { duration: settings.duration, easing: settings.easing, fill: "both" });
    const style = getComputedStyle(content);
    const resting = { transform: style.transform || "none", opacity: style.opacity || "1" };
    const withdrawn = { transform: `${resting.transform === "none" ? "" : resting.transform} translateY(-8px)`, opacity: "0" };
    contentEffect = content.animate([
      previousFrame ?? (expanded ? withdrawn : resting),
      expanded ? resting : withdrawn,
    ], { duration: settings.duration, easing: settings.easing, fill: "both" });
  } catch {
    effect?.cancel();
    // Invalid host easing, or an unavailable animation implementation, falls
    // back to the final presentation without leaving transient inline styles.
    display(bubble, expanded);
    return;
  }
  let observer: ResizeObserver | undefined;
  let targetHeight = toHeight;
  const finish = () => {
    if (running.get(bubble)?.effect !== effect) return;
    running.delete(bubble);
    observer?.disconnect();
    effect.onfinish = effect.oncancel = null;
    effect.cancel();
    contentEffect.cancel();
    display(bubble, expanded);
  };
  running.set(bubble, { effect, expanded, settings: JSON.stringify(settings), finish });
  effect.onfinish = effect.oncancel = finish;
  if (expanded && typeof ResizeObserver === "function") {
    observer = new ResizeObserver(() => {
      if (running.get(bubble)?.effect !== effect || !bubble.isConnected) return;
      const frames = effect.effect as KeyframeEffect | null;
      const progress = frames?.getComputedTiming().progress;
      if (progress == null || progress < 0 || progress >= 1) return;
      const current = bubble.getBoundingClientRect().height;
      // An important declaration briefly overrides the animated height for a
      // natural-size measurement. Restore the exact authored value/priority in
      // this same task, before paint; do not cancel/restart the animation.
      const original = bubble.style.getPropertyValue("height");
      const priority = bubble.style.getPropertyPriority("height");
      bubble.style.setProperty("height", "auto", "important");
      const target = bubble.getBoundingClientRect().height;
      if (original) bubble.style.setProperty("height", original, priority);
      else bubble.style.removeProperty("height");
      if (target === targetHeight) return;
      targetHeight = target;
      // Holding at the current eased progress preserves visual continuity and
      // the original deadline, even when several chunks arrive during opening.
      frames!.setKeyframes([
        { height: `${current}px`, offset: progress, boxSizing: "border-box", overflow: "hidden" },
        { height: `${target}px`, offset: 1, boxSizing: "border-box", overflow: "hidden" },
      ]);
    });
    observer.observe(content);
    observer.observe(header);
  }
}

/** Preserve active effects across streaming morphs without freezing their body. */
export function createDisclosureLifecycle(root: HTMLElement, getConfig: () => AgentWidgetConfig) {
  const tracked = new Set<HTMLElement>();
  const pending = new Map<string, number>();
  const media = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : undefined;
  const settleAll = () => tracked.forEach(settle);
  const onMotion = () => { if (media?.matches) settleAll(); };
  media?.addEventListener?.("change", onMotion);
  const enabled = () => {
    const settings = disclosureSettings(getConfig());
    return settings.animation === "height" && settings.duration > 0 && !reducedMotion();
  };
  return {
    prepare(next: HTMLElement) {
      pending.clear();
      if (!enabled()) { settleAll(); tracked.clear(); return; }
      const old = new Map(Array.from(root.querySelectorAll<HTMLElement>(selector), bubble => [bubble.id, bubble]));
      for (const incoming of next.querySelectorAll<HTMLElement>(selector)) {
        const bubble = old.get(incoming.id);
        if (!bubble) continue; // First/restored expanded state is immediate.
        tracked.add(bubble);
        const expanded = expandedState(incoming);
        const state = running.get(bubble);
        if (expanded !== expandedState(bubble)) {
          pending.set(bubble.id, bubble.getBoundingClientRect().height);
          if (!expanded) focusHeader(bubble);
          settle(bubble);
        } else if (state) {
          if (state.settings !== JSON.stringify(disclosureSettings(getConfig())) || reducedMotion()) {
            settle(bubble);
          } else if (!state.expanded) {
            // Keep closing details visible while idiomorph updates their text.
            const { content, preview } = parts(incoming);
            if (content) { content.style.display = ""; content.inert = true; }
            if (preview) preview.style.display = "none";
          }
        }
      }
    },
    sync() {
      if (!enabled()) { settleAll(); tracked.clear(); pending.clear(); return; }
      for (const bubble of tracked) if (!root.contains(bubble)) { settle(bubble); tracked.delete(bubble); }
      for (const bubble of root.querySelectorAll<HTMLElement>(selector)) {
        tracked.add(bubble);
        const from = pending.get(bubble.id);
        if (from !== undefined) animateDisclosure(bubble, expandedState(bubble), getConfig(), from);
        const state = running.get(bubble);
        if (state && (state.settings !== JSON.stringify(disclosureSettings(getConfig())) || reducedMotion())) settle(bubble);
      }
      pending.clear();
    },
    clear() {
      root.querySelectorAll<HTMLElement>(selector).forEach(settle);
      settleAll(); tracked.clear(); pending.clear();
    },
    destroy() { this.clear(); media?.removeEventListener?.("change", onMotion); },
  };
}
