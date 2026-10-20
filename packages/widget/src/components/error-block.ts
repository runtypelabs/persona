import type { AgentWidgetMessage } from "../types";
import type { MessageTransform } from "./message-bubble";
import { createNode } from "../utils/dom";

/** Secondary transcript chrome, shipped with the lazy approval UI. */
export function createErrorBlock(
  message: AgentWidgetMessage,
  transform: MessageTransform,
  canRetry: boolean
): HTMLElement {
  const detail = createNode("div", { className: "persona-error-detail persona-message-bubble" });
  detail.innerHTML = transform({ text: message.content, message, streaming: false });
  const summary = createNode("summary", { className: "persona-error-summary" },
    detail,
    createNode("span", { className: "persona-error-more", text: "Show more" }),
    createNode("span", { className: "persona-error-less", text: "Show less" })
  );
  return createNode("div", {
    className: "persona-error-block",
    attrs: { role: "alert", "data-message-id": message.id, "data-actions-for": message.id },
  },
  createNode("strong", { className: "persona-error-title", text: "Something went wrong" }),
  createNode("details", { className: "persona-error-details" }, summary),
  canRetry ? createNode("button", {
    className: "persona-message-action-btn persona-error-retry",
    text: "Retry",
    attrs: { type: "button", "data-action": "regenerate", "aria-label": "Retry response" },
  }) : null);
}
