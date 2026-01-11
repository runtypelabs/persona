import { AgentWidgetSessionStatus } from "../session";

export const statusCopy: Record<AgentWidgetSessionStatus, string> = {
  idle: "Online",
  connecting: "Connecting…",
  connected: "Streaming…",
  error: "Offline"
};








