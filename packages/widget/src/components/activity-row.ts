import { resolveToolStyles } from "../utils/tool-styles";
import { Circle, Clock } from "lucide";
import { renderIconNode } from "../utils/icon-node";
import type { AgentWidgetConfig, AgentWidgetMessage } from "../types";
import { DEFAULT_TOOL_CALL_DISPLAY, DEFAULT_REASONING_DISPLAY, DEFAULTS_V5 } from "../defaults";
import { createElement } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import { appendHeaderToggle } from "./expandable-bubble";

export type ActivityKind = "tool" | "reasoning";

/** Standalone builders and the full UI use the same versioned defaults. */
export function activityDisplay(config: AgentWidgetConfig | undefined, kind: ActivityKind): AgentWidgetConfig {
  const key = kind === "tool" ? "toolCallDisplay" : "reasoningDisplay";
  return { ...config, features: { ...config?.features, [key]: {
    ...(kind === "tool" ? DEFAULT_TOOL_CALL_DISPLAY : DEFAULT_REASONING_DISPLAY),
    ...(config?.future?.v5Defaults === true ? DEFAULTS_V5.features?.[key] : {}),
    ...config?.features?.[key],
  } } };
}

export function activityVariant(config: AgentWidgetConfig | undefined, kind: ActivityKind): "card" | "row" {
  const key = kind === "tool" ? "toolCallDisplay" : "reasoningDisplay";
  return config?.features?.[key]?.variant ?? (config?.future?.v5Defaults ? "row" : "card");
}

export function activityDuration(ms: number | undefined): string {
  const seconds = Math.max(0, Math.floor((ms ?? 0) / 1000));
  if (seconds < 1) return "a moment";
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** Reuses card content/render hooks while replacing only its visual chrome. */
export function applyActivityRow(bubble: HTMLElement, message: AgentWidgetMessage, config: AgentWidgetConfig, kind: ActivityKind): HTMLElement {
  if (activityVariant(config, kind) !== "row") return bubble;
  bubble.className = `persona-message-bubble persona-${kind}-bubble persona-activity-row`;
  bubble.dataset.activityKind = kind;
  if (kind === "tool" && config.toolCall?.shadow === undefined) bubble.style.boxShadow = "var(--persona-tool-bubble-shadow, none)";
  const header = bubble.querySelector<HTMLButtonElement>(":scope > button");
  if (!header) return bubble;
  header.className = header.classList.contains("persona-theme-padding")
    ? "persona-activity-header persona-theme-padding" : "persona-activity-header";
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
  const glyph = customIcon ? renderLucideIcon(customIcon, 16, "currentColor", 2)
    : state === "pending" ? renderIconNode(Circle, 16, "currentColor", 2)
    : state === "awaiting-approval" ? renderIconNode(Clock, 16, "currentColor", 2)
    : renderLucideIcon(names[state], 16, "currentColor", 2);
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

/** Per-widget lifecycle: one open and one delayed close; user intent is sticky. */
export function createActivityLifecycle(onCollapse: (id: string, kind: ActivityKind) => void) {
  const seen = new Set<string>();
  const manual = new Set<string>();
  const finished = new Set<string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const cancel = (id: string) => { clearTimeout(timers.get(id)); timers.delete(id); };
  return {
    observe(message: AgentWidgetMessage, kind: ActivityKind, expanded: Set<string>, options: { autoExpand?: boolean; autoCollapseDelay?: number | false } = {}) {
      const data = kind === "tool" ? message.toolCall : message.reasoning;
      if (!data || manual.has(message.id)) return;
      if (!seen.has(message.id) && data.status !== "complete" && data.chunks?.some(Boolean)) {
        seen.add(message.id);
        if (options.autoExpand !== false) expanded.add(message.id);
      }
      if (seen.has(message.id) && data.status === "complete" && !finished.has(message.id)) {
        finished.add(message.id);
        if (options.autoCollapseDelay === false) return;
        timers.set(message.id, setTimeout(() => {
          timers.delete(message.id);
          expanded.delete(message.id);
          onCollapse(message.id, kind);
        }, options.autoCollapseDelay ?? 1000));
      }
    },
    manual(id: string) { manual.add(id); cancel(id); },
    prune(ids: Set<string>) {
      for (const id of new Set([...seen, ...manual, ...finished])) {
        if (!ids.has(id)) { cancel(id); seen.delete(id); manual.delete(id); finished.delete(id); }
      }
    },
    clear() { for (const id of timers.keys()) cancel(id); seen.clear(); manual.clear(); finished.clear(); },
  };
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
  const toolStyles = resolveToolStyles(config);
  appendHeaderToggle(header, copy, { expandable: true, expanded, iconColor: toolStyles.toggleTextColor || toolStyles.headerTextColor || "currentColor", metaGap: true });
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
