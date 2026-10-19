export { updateActivityElapsed } from "./components/activity-row";
export { createToolBubble, updateToolBubbleUI } from "./components/tool-bubble";
export { createReasoningBubble, updateReasoningBubbleUI } from "./components/reasoning-bubble";
export { initActivityUi, turnUi } from "./components/activity-deps";
export { groupToolRows } from "./activity-groups";
import { activityDisplay, activityVariant, createActivityLifecycle as createLifecycle } from "./components/activity-row";
import { updateToolBubbleUI } from "./components/tool-bubble";
import { updateReasoningBubbleUI } from "./components/reasoning-bubble";
import type { AgentWidgetConfig, AgentWidgetMessage } from "./types";

/** Keep automatic disclosure updates in the optional activity chunk. */
export function createActivityLifecycle(
  root: HTMLElement,
  getConfig: () => AgentWidgetConfig,
  tools: Set<string>,
  reasoning: Set<string>,
  cache: { delete(id: string): unknown },
  findBubble: (id: string) => HTMLElement | null
) {
  const lifecycle = createLifecycle((id, kind) => {
    cache.delete(id);
    const bubble = findBubble(id);
    if (!bubble) return;
    if (kind === "tool") updateToolBubbleUI(id, bubble, tools, getConfig());
    else updateReasoningBubbleUI(id, bubble, reasoning, getConfig());
  }, root, getConfig);
  return {
    ...lifecycle,
    observeMessages(messages: AgentWidgetMessage[], ids: Set<string>) {
      const config = getConfig();
      for (const message of messages) {
        const kind = message.variant === "tool" ? "tool" : message.variant === "reasoning" ? "reasoning" : null;
        if (!kind || activityVariant(config, kind, message) !== "row") continue;
        const features = activityDisplay(config, kind, message).features;
        const display = kind === "tool" ? features?.toolCallDisplay : features?.reasoningDisplay;
        if (display?.expandable === false) continue;
        ids.add(message.id);
        lifecycle.observe(message, kind, kind === "tool" ? tools : reasoning, display);
      }
    },
  };
}
