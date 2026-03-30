import { AgentWidgetSessionStatus } from "../session";

export const statusCopy: Record<AgentWidgetSessionStatus, string> = {
  idle: "Online",
  connecting: "Connecting…",
  connected: "Streaming…",
  error: "Offline"
};

/**
 * Default z-index for widget overlays. Used for the floating panel, launcher
 * button, sidebar, mobile fullscreen, and docked mobile fullscreen modes.
 * Integrators can override via `launcher.zIndex`.
 */
export const DEFAULT_OVERLAY_Z_INDEX = 100000;

/**
 * Z-index for elements portaled to document.body (tooltips, dropdowns).
 * Must be above the widget overlay so portaled UI is not clipped.
 */
export const PORTALED_OVERLAY_Z_INDEX = DEFAULT_OVERLAY_Z_INDEX + 1;








