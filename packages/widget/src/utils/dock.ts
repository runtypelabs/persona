import type { AgentWidgetConfig, AgentWidgetDockConfig } from "../types";

const DEFAULT_DOCK_CONFIG: Required<AgentWidgetDockConfig> = {
  side: "right",
  width: "420px",
  animate: true,
  reveal: "resize",
};

export const isDockedMountMode = (config?: AgentWidgetConfig): boolean =>
  (config?.launcher?.mountMode ?? "floating") === "docked";

/**
 * Resolved dock layout. For `reveal: "resize"`, when the panel is closed the dock column is `0px`.
 * For `reveal: "overlay"`, the panel overlays with `transform`. For `reveal: "push"`, a sliding track
 * moves content and panel together without width animation on the main column. For `emerge`,
 * the dock column still animates like `resize` but the widget stays `dock.width` wide inside the slot.
 * Unknown keys on `launcher.dock` (e.g. legacy `collapsedWidth`) are ignored.
 */
export const resolveDockConfig = (
  config?: AgentWidgetConfig
): Required<AgentWidgetDockConfig> => {
  const dock = config?.launcher?.dock;
  return {
    side: dock?.side ?? DEFAULT_DOCK_CONFIG.side,
    width: dock?.width ?? DEFAULT_DOCK_CONFIG.width,
    animate: dock?.animate ?? DEFAULT_DOCK_CONFIG.animate,
    reveal: dock?.reveal ?? DEFAULT_DOCK_CONFIG.reveal,
  };
};
