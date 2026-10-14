import type { AgentWidgetMessage } from "../types";

/** Id prefix of the bubble the durable reconnect loop posts when it gives up. */
export const RECONNECT_FAILED_ID_PREFIX = "reconnect-failed-";

/**
 * A widget-generated notice that is shown in this browser only: never sent as
 * conversation history and never written to the storage adapter. The id check
 * covers reconnect-failure bubbles persisted before `localOnly` existed.
 */
export const isLocalOnlyMessage = (message: AgentWidgetMessage): boolean =>
  message.localOnly === true ||
  (message.role === "assistant" &&
    typeof message.id === "string" &&
    message.id.startsWith(RECONNECT_FAILED_ID_PREFIX));
