import { Circle, Clock } from "lucide";
import { renderIconNode } from "../utils/icon-node";
import type { AgentWidgetConfig, AgentWidgetMessage } from "../types";
import { createElement } from "../utils/dom";
import { renderActivityIcon } from "./activity-icon";
import { appendHeaderToggle } from "./expandable-bubble";
import { activityDuration, activityVariant, type ActivityKind } from "./activity-row";

// DOM builders for the activity-row variant. Part of the lazy activity-ui chunk
// (see `activity-ui.ts`); the pure helpers they share with core stay in
// `activity-row.ts`.

/** Reuses card content/render hooks while replacing only its visual chrome. */
export function applyActivityRow(bubble: HTMLElement, message: AgentWidgetMessage, config: AgentWidgetConfig, kind: ActivityKind): HTMLElement {
  if (activityVariant(config, kind) !== "row") return bubble;
  bubble.className = `persona-message-bubble persona-${kind}-bubble persona-activity-row`;
  bubble.dataset.activityKind = kind;
  if (kind === "tool" && config.toolCall?.shadow === undefined) bubble.style.boxShadow = "var(--persona-tool-bubble-shadow, none)";
  const header = bubble.querySelector<HTMLButtonElement>(":scope > button");
  if (!header) return bubble;
  header.className = "persona-activity-header";
  const data = kind === "tool" ? message.toolCall : message.reasoning;
  const active = data?.status !== "complete";
  const approval = message.approval?.status ?? message.toolCall?.approvalStatus;
  const state = approval === "denied" ? "denied" : approval === "pending" ? "awaiting-approval"
    : message.toolCall?.success === false ? "error" : !active ? "done"
    : data?.status === "pending" ? "pending" : "running";
  bubble.dataset.activityState = state;
  const icon = createElement("span", "persona-activity-icon");
  icon.dataset.activityIcon = state;
  const names = { pending: "circle", running: "loader-circle", done: "check", error: "x", denied: "x", "awaiting-approval": "clock" };
  const customIcon = kind === "reasoning" ? config.features?.reasoningDisplay?.iconName : undefined;
  const glyph = customIcon ? renderActivityIcon(customIcon, 16, "currentColor", 2)
    : state === "pending" ? renderIconNode(Circle, 16, "currentColor", 2)
    : state === "awaiting-approval" ? renderIconNode(Clock, 16, "currentColor", 2)
    : renderActivityIcon(names[state], 16, "currentColor", 2);
  if (glyph) icon.appendChild(glyph);
  header.querySelector(".persona-reasoning-header-icon")?.remove();
  const displayKey = kind === "tool" ? "toolCallDisplay" : "reasoningDisplay";
  const visibility = config.features?.[displayKey]?.iconVisibility ??
    (config.future?.v5Defaults ? "active" : "always");
  if (visibility === "always" || (visibility === "active" && state !== "done")) header.prepend(icon);
  if (kind === "tool" && data) {
    const duration = createElement("span", "persona-activity-duration");
    if (active && data.startedAt) duration.setAttribute("data-tool-elapsed", String(data.startedAt));
    const elapsed = (kind === "tool" ? message.toolCall?.duration : undefined) ?? data.durationMs ?? (data.completedAt !== undefined && data.startedAt !== undefined ? data.completedAt - data.startedAt : undefined);
    duration.textContent = elapsed === undefined ? "" : activityDuration(elapsed);
    header.appendChild(duration);
  }
  const label = header.querySelector<HTMLElement>(":scope > div:not(.persona-ml-auto)");
  label?.classList.add("persona-activity-label");
  const meta = header.querySelector<HTMLElement>(".persona-ml-auto");
  meta?.classList.add("persona-activity-chevron");
  const body = bubble.querySelector<HTMLElement>(":scope > .persona-border-t");
  body?.classList.add("persona-activity-body");
  if (body) { body.id = `activity-details-${message.id}`; header.setAttribute("aria-controls", body.id); }
  return bubble;
}

/** A collapsible group uses the same accessible row and expansion contract. */
export function createActivityGroup(message: AgentWidgetMessage, config: AgentWidgetConfig, expanded: boolean, label: string | HTMLElement): { bubble: HTMLElement; body: HTMLElement } {
  const bubble = createElement("div", "");
  bubble.id = `bubble-${message.id}`;
  bubble.dataset.messageId = message.id;
  const header = createElement("button", "") as HTMLButtonElement;
  header.type = "button";
  header.dataset.expandHeader = "true";
  header.dataset.bubbleType = "tool";
  header.setAttribute("aria-expanded", String(expanded));
  const copy = createElement("div", "");
  if (typeof label === "string") copy.textContent = label; else copy.appendChild(label);
  appendHeaderToggle(header, copy, { expandable: true, expanded, iconColor: config.toolCall?.toggleTextColor || config.toolCall?.headerTextColor || "currentColor", metaGap: true });
  const body = createElement("div", "persona-border-t");
  body.id = `activity-details-${message.id}`;
  body.style.display = expanded ? "" : "none";
  header.setAttribute("aria-controls", body.id);
  bubble.append(header, body);
  applyActivityRow(bubble, message, { ...config, features: { ...config.features, toolCallDisplay: { ...config.features?.toolCallDisplay, variant: "row" } } }, "tool");
  bubble.dataset.personaToolGroup = "true";
  if (config.features?.toolCallDisplay?.loadingAnimation === "shimmer") bubble.dataset.activityGroupShimmer = "true";
  return { bubble, body };
}
