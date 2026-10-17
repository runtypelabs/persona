import type { AgentWidgetApprovalConfig, AgentWidgetConfig } from "../types";

/** Shared defaults kept small for the lazy approval chunk. */
export const DEFAULT_APPROVAL_V5: AgentWidgetApprovalConfig = {
  resolvedDisplay: "row",
  primaryAction: "allow-once",
  keyboardShortcuts: "focused",
};

export const resolveApprovalConfig = (
  config?: AgentWidgetConfig
): AgentWidgetApprovalConfig | undefined => config?.approval === false
  ? undefined
  : { ...(config?.future?.v5Defaults === true ? DEFAULT_APPROVAL_V5 : {}), ...config?.approval };
