import type { AgentWidgetConfig } from "../types";

/** Shared by config resolution and standalone transcript component builders. */
export const DEFAULT_TOOL_CALL_DISPLAY = {
  collapsedMode: "tool-call",
  activePreview: false,
  grouped: false,
  groupedMode: "stack",
  groupBoundary: "adjacent",
  previewMaxLines: 3,
  expandable: true,
  loadingAnimation: "none",
} satisfies NonNullable<NonNullable<AgentWidgetConfig["features"]>["toolCallDisplay"]>;

export const DEFAULT_REASONING_DISPLAY = {
  activePreview: false,
  previewMaxLines: 3,
  expandable: true,
  loadingAnimation: "none",
} satisfies NonNullable<NonNullable<AgentWidgetConfig["features"]>["reasoningDisplay"]>;

export const DEFAULT_TOOL_CALL_DISPLAY_V5 = {
  variant: "row", iconVisibility: "active", autoExpand: false, grouped: true, groupedMode: "collapsible", loadingAnimation: "shimmer",
} satisfies NonNullable<NonNullable<AgentWidgetConfig["features"]>["toolCallDisplay"]>;

export const DEFAULT_REASONING_DISPLAY_V5 = {
  variant: "row", iconVisibility: "active", autoExpand: false, loadingAnimation: "shimmer",
} satisfies NonNullable<NonNullable<AgentWidgetConfig["features"]>["reasoningDisplay"]>;
