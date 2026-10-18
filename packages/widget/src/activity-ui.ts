export { updateActivityElapsed } from "./components/activity-row";
export { createToolBubble, updateToolBubbleUI } from "./components/tool-bubble";
export { createReasoningBubble, updateReasoningBubbleUI } from "./components/reasoning-bubble";
export { initActivityUi } from "./components/activity-deps";
export { groupToolRows } from "./activity-groups";
import { createActivityLifecycle as createLifecycle } from "./components/activity-row";
import { updateToolBubbleUI } from "./components/tool-bubble";
import { updateReasoningBubbleUI } from "./components/reasoning-bubble";
import type { AgentWidgetConfig } from "./types";

/** Keep automatic disclosure updates in the optional activity chunk. */
export function createActivityLifecycle(
  root: HTMLElement,
  getConfig: () => AgentWidgetConfig,
  tools: Set<string>,
  reasoning: Set<string>,
  cache: { delete(id: string): unknown },
  findBubble: (id: string) => HTMLElement | null
) {
  return createLifecycle((id, kind) => {
    cache.delete(id);
    const bubble = findBubble(id);
    if (!bubble) return;
    if (kind === "tool") updateToolBubbleUI(id, bubble, tools, getConfig());
    else updateReasoningBubbleUI(id, bubble, reasoning, getConfig());
  }, root, getConfig);
}
