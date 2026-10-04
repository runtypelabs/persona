/**
 * Subpath/chunk module for the lazy activity UI
 * (`@runtypelabs/persona/activity-ui` → `dist/activity-ui.{js,cjs}`): the tool
 * and reasoning bubbles, the activity-row variant and collapsible tool groups,
 * and the tool-detail copy action.
 *
 * Nothing here is needed until a tool or reasoning message renders, so core
 * loads it on demand via `activity-ui-loader.ts` — the IIFE from a sibling URL,
 * ESM/CJS via this external subpath. ui.ts warms it on first panel render and
 * whenever a render meets a tool/reasoning message, and calls `initActivityUi`
 * on adoption so the chunk renders icons through core's registry.
 */
import { setActivityIconRenderer, type ActivityIconRenderer } from "./components/activity-icon";

export { createToolBubble, updateToolBubbleUI } from "./components/tool-bubble";
export { createReasoningBubble, updateReasoningBubbleUI } from "./components/reasoning-bubble";
export { createActivityGroup } from "./components/activity-row-render";
export { copyToolDetail } from "./components/tool-details";

/** Core dependencies injected when ui.ts adopts the chunk. */
export interface ActivityUiDeps {
  renderIcon: ActivityIconRenderer;
}

export const initActivityUi = (deps: ActivityUiDeps): void => {
  setActivityIconRenderer(deps.renderIcon);
};
