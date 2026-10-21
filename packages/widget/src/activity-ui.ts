export { updateActivityElapsed } from "./components/activity-row";
export { createToolBubble, updateToolBubbleUI } from "./components/tool-bubble";
export { createReasoningBubble, updateReasoningBubbleUI } from "./components/reasoning-bubble";
export { initActivityUi, turnUi } from "./components/activity-deps";
export { groupToolRows } from "./activity-groups";
import { activityDisplay, activityLayout, createActivityLifecycle as createLifecycle } from "./components/activity-row";
import { updateToolBubbleUI } from "./components/tool-bubble";
import { updateReasoningBubbleUI } from "./components/reasoning-bubble";
import type { AgentWidgetConfig, AgentWidgetMessage } from "./types";
import { createActivityOverflow } from "./utils/activity-overflow";
import { afterDisclosureAnimation } from "./components/disclosure-animation";

type DisclosureAnchor = { spacerHeight: number; initialSpacerHeight: number; contentHeightAtAnchor: number; pending: number };

/** Keep scroll reserve throughout manual disclosure animations and reversals. */
export function holdScroll(
  bubble: HTMLElement, body: HTMLElement, anchor: DisclosureAnchor,
  measure: (spacer: number) => number, setSpacer: (height: number) => void,
  slack: number, isCurrent: () => boolean
): () => void {
  // Reserve the whole possible collapse before changing display or starting an
  // animation. ResizeObserver must not drain it during intermediate frames.
  setSpacer(anchor.spacerHeight + bubble.offsetHeight);
  anchor.pending++;
  return () => afterDisclosureAnimation(bubble, () => {
    if (--anchor.pending || !isCurrent()) return;
    // Respect scrolling that the reader did while the animation was running.
    setSpacer(body.scrollTop + body.clientHeight + slack - measure(anchor.spacerHeight));
    anchor.initialSpacerHeight = anchor.spacerHeight;
    // Match the resize drain, including the flex gap before the spacer.
    anchor.contentHeightAtAnchor = body.scrollHeight - anchor.spacerHeight;
  });
}

/** Keep automatic disclosure updates in the optional activity chunk. */
export function createActivityLifecycle(
  root: HTMLElement,
  getConfig: () => AgentWidgetConfig,
  tools: Set<string>,
  reasoning: Set<string>,
  cache: { delete(id: string): unknown },
  findBubble: (id: string) => HTMLElement | null
) {
  const overflow = createActivityOverflow(root);
  const lifecycle = createLifecycle((id, kind) => {
    cache.delete(id);
    const bubble = findBubble(id);
    if (!bubble) return;
    if (kind === "tool") updateToolBubbleUI(id, bubble, tools, getConfig());
    else updateReasoningBubbleUI(id, bubble, reasoning, getConfig());
  }, root, getConfig);
  return {
    ...lifecycle,
    sync() { lifecycle.sync(); overflow.sync(); },
    destroy() { lifecycle.destroy(); overflow.destroy(); },
    observeMessages(messages: AgentWidgetMessage[], ids: Set<string>) {
      const config = getConfig();
      for (const message of messages) {
        const kind = message.variant === "tool" ? "tool" : message.variant === "reasoning" ? "reasoning" : null;
        if (!kind || activityLayout(config, kind, message) !== "row") continue;
        const features = activityDisplay(config, kind, message).features;
        const display = kind === "tool" ? features?.toolCallDisplay : features?.reasoningDisplay;
        if (display?.expandable === false) continue;
        ids.add(message.id);
        lifecycle.observe(message, kind, kind === "tool" ? tools : reasoning, display);
      }
    },
  };
}
