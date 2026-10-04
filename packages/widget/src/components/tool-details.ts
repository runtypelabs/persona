import type { AgentWidgetConfig, AgentWidgetMessage } from "../types";
import { createNode } from "../utils/dom";
import { formatUnknownValue } from "../utils/formatting";
import { renderActivityIcon } from "./activity-icon";

const isEmptyRequest = (value: unknown): boolean => {
  if (value == null) return true;
  if (typeof value === "string") {
    if (!value.trim()) return true;
    try { return isEmptyRequest(JSON.parse(value)); } catch { return false; }
  }
  return typeof value === "object" && Object.keys(value).length === 0;
};

const isStructured = (value: unknown): boolean => {
  if (value !== null && typeof value === "object") return true;
  if (typeof value !== "string") return false;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === "object";
  } catch { return false; }
};

/** Plain text only: tool output is untrusted and must never become HTML. */
export function appendToolDetails(content: HTMLElement, message: AgentWidgetMessage, config: AgentWidgetConfig): void {
  const tool = message.toolCall;
  if (!tool) return;
  const styles = config.toolCall ?? {};
  const section = (label: "Request" | "Response", value: unknown) => {
    const block = createNode("section", {
      className: "persona-tool-detail",
      attrs: { "data-persona-tool-detail": label.toLowerCase() },
      style: {
        backgroundColor: styles.codeBlockBackgroundColor,
        borderColor: styles.codeBlockBorderColor,
        borderWidth: styles.codeBlockBorderColor ? "1px" : undefined,
      },
    });
    const title = createNode("div", {
      className: "persona-tool-detail-label",
      text: label,
      style: { color: styles.labelTextColor },
    });
    const text = formatUnknownValue(value);
    const pre = createNode("pre", {
      className: `persona-tool-detail-value${isStructured(value) ? " persona-tool-detail-code" : ""}`,
      text,
      attrs: text.length > 420 || text.split("\n").length > 7
        ? { tabindex: "0", "aria-label": `${label} content` } : {},
      style: { color: styles.codeBlockTextColor ?? styles.contentTextColor },
    });
    const copy = createNode("button", {
      className: "persona-tool-detail-copy",
      attrs: { type: "button", "data-persona-copy-tool-detail": "", "aria-label": `Copy ${label.toLowerCase()}`, title: `Copy ${label.toLowerCase()}` },
    });
    const icon = renderActivityIcon("copy", 14, "currentColor", 1.7);
    if (icon) copy.appendChild(icon);
    block.append(title, pre, copy);
    content.appendChild(block);
  };
  if (!isEmptyRequest(tool.args)) section("Request", tool.args);
  const response = tool.status === "complete" && tool.result !== undefined
    ? tool.result : tool.chunks?.join("");
  if (response !== undefined && (typeof response !== "string" || response.trim())) section("Response", response);
  if (tool.success === false) {
    content.appendChild(createNode("div", {
      className: "persona-text-sm persona-whitespace-pre-wrap",
      text: tool.error || "Tool failed",
      attrs: { "data-persona-tool-error": "", role: "status" },
    }));
  }
}

const copyResets = new WeakMap<HTMLButtonElement, ReturnType<typeof setTimeout>>();

/** Delegated by the transcript so copying works after streaming DOM morphs. */
export async function copyToolDetail(button: HTMLButtonElement): Promise<void> {
  const block = button.closest("[data-persona-tool-detail]");
  const value = block?.querySelector("pre");
  if (!value) return;
  const label = `Copy ${block?.getAttribute("data-persona-tool-detail")}`;
  clearTimeout(copyResets.get(button));
  try {
    await navigator.clipboard.writeText(value.textContent ?? "");
    button.dataset.copied = "true";
    button.setAttribute("aria-label", "Copied");
    button.title = "Copied";
    const icon = renderActivityIcon("check", 14, "currentColor", 2);
    if (icon) button.replaceChildren(icon);
  } catch {
    button.setAttribute("aria-label", "Copy failed — try again");
    button.title = "Copy failed — try again";
  }
  copyResets.set(button, setTimeout(() => {
    delete button.dataset.copied;
    button.setAttribute("aria-label", label);
    button.title = label;
    const icon = renderActivityIcon("copy", 14, "currentColor", 1.7);
    if (icon) button.replaceChildren(icon);
    copyResets.delete(button);
  }, 1800));
}
