import type { AgentWidgetConfig, AgentWidgetDockConfig } from "../types";

const DEFAULT_DOCK_CONFIG: Required<AgentWidgetDockConfig> = {
  side: "right",
  width: "420px",
  collapsedWidth: "72px",
};

export const isDockedMountMode = (config?: AgentWidgetConfig): boolean =>
  (config?.launcher?.mountMode ?? "floating") === "docked";

export const resolveDockConfig = (
  config?: AgentWidgetConfig
): Required<AgentWidgetDockConfig> => ({
  ...DEFAULT_DOCK_CONFIG,
  ...(config?.launcher?.dock ?? {}),
});
