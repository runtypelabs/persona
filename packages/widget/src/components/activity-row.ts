import { createDisclosureLifecycle } from "./disclosure-animation";
import { applyLoadingLabel } from "../utils/loading-label-deps";
import { resolveToolStyles } from "../utils/tool-styles";
import { Circle, Clock } from "lucide";
import { renderIconNode } from "../utils/icon-node";
import type { AgentWidgetConfig, AgentWidgetMessage } from "../types";
import { DEFAULT_TOOL_CALL_DISPLAY, DEFAULT_REASONING_DISPLAY, DEFAULT_TOOL_CALL_DISPLAY_V5, DEFAULT_REASONING_DISPLAY_V5 } from "../utils/activity-display-defaults";
import { createElement } from "../utils/dom";
import { formatElapsedMs } from "../utils/formatting";
import { renderLucideIcon } from "./activity-deps";
import { appendHeaderToggle, createExpandableBubbleShell, createExpandableHeader } from "./expandable-bubble";

export type ActivityKind = "tool" | "reasoning";

/** Standalone builders and the full UI use the same versioned defaults. */
export function activityDisplay(config: AgentWidgetConfig | undefined, kind: ActivityKind): AgentWidgetConfig {
  const key = kind === "tool" ? "toolCallDisplay" : "reasoningDisplay";
  return { ...config, features: { ...config?.features, [key]: {
    ...(kind === "tool" ? DEFAULT_TOOL_CALL_DISPLAY : DEFAULT_REASONING_DISPLAY),
    ...(config?.future?.v5Defaults === true ? kind === "tool" ? DEFAULT_TOOL_CALL_DISPLAY_V5 : DEFAULT_REASONING_DISPLAY_V5 : {}),
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

/** Automatic tool timing stays quiet below a whole second; authored timers retain their format. */
export function updateActivityElapsed(span: HTMLElement, now: number): void {
  const startedAt = Number(span.getAttribute("data-tool-elapsed"));
  if (!startedAt) return;
  const elapsed = now - startedAt;
  span.textContent = span.classList.contains("persona-activity-duration") ? toolDuration(elapsed)
    : span.closest(".persona-activity-row") ? activityDuration(elapsed) : formatElapsedMs(elapsed);
}

const toolDuration = (ms: number | undefined): string =>
  ms !== undefined && Number.isFinite(ms) && ms >= 1000 ? activityDuration(ms) : "";

/** Reuses card content/render hooks while replacing only its visual chrome. */
export function applyActivityRow(bubble: HTMLElement, message: AgentWidgetMessage, config: AgentWidgetConfig, kind: ActivityKind, groupHeader = false): HTMLElement {
  if (!groupHeader && activityVariant(config, kind) !== "row") return bubble;
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
  const state = message.toolCall?.interrupted ? "interrupted"
    : approval === "denied" ? "denied" : approval === "pending" ? "awaiting-approval"
    : message.toolCall?.success === false ? "error" : !active ? "done"
    : data?.status === "pending" ? "pending" : "running";
  bubble.dataset.activityState = state;
  const icon = createElement("span", "persona-activity-icon");
  icon.dataset.activityIcon = state;
  const names = { pending: "circle", running: "loader-circle", done: "check", error: "x", denied: "x", interrupted: "x", "awaiting-approval": "clock" };
  const customIcon = kind === "reasoning" ? config.features?.reasoningDisplay?.iconName : undefined;
  const glyph = customIcon ? renderLucideIcon(customIcon, 16, "currentColor", 2)
    : state === "pending" ? renderIconNode(Circle, 16, "currentColor", 2)
    : state === "awaiting-approval" ? renderIconNode(Clock, 16, "currentColor", 2)
    : renderLucideIcon(names[state], 16, "currentColor", 2);
  if (glyph) icon.appendChild(glyph);
  header.querySelector(".persona-reasoning-header-icon")?.remove();
  const displayKey = kind === "tool" ? "toolCallDisplay" : "reasoningDisplay";
  const visibility = (groupHeader ? config.features?.toolCallDisplay?.groupIconVisibility : undefined) ?? config.features?.[displayKey]?.iconVisibility ??
    (config.future?.v5Defaults ? "active" : "always");
  if (visibility === "always" || (visibility === "active" && state !== "done")) header.prepend(icon);
  const durationDisplay = config.features?.toolCallDisplay?.durationDisplay;
  if (kind === "tool" && data && (durationDisplay === "all" || durationDisplay === (groupHeader ? "group" : "tools"))) {
    const duration = createElement("span", "persona-activity-duration");
    if (active && data.startedAt !== undefined && data.startedAt > 0 && data.startedAt <= Date.now()) duration.setAttribute("data-tool-elapsed", String(data.startedAt));
    const elapsed = message.toolCall?.duration ?? data.durationMs ?? (data.completedAt !== undefined && data.startedAt !== undefined ? data.completedAt - data.startedAt : undefined);
    duration.textContent = toolDuration(active && data.startedAt !== undefined ? (data.startedAt > 0 ? Date.now() - data.startedAt : undefined) : elapsed);
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
export function createActivityLifecycle(onCollapse: (id: string, kind: ActivityKind) => void, root?: HTMLElement, getConfig: () => AgentWidgetConfig = () => ({})) {
  const disclosure = root ? createDisclosureLifecycle(root, getConfig) : undefined;
  type State = { seen?: boolean; manual?: boolean; finished?: boolean; timer?: ReturnType<typeof setTimeout> };
  const states = new Map<string, State>();
  const stateFor = (id: string) => {
    let state = states.get(id);
    if (!state) { state = {}; states.set(id, state); }
    return state;
  };
  const cancel = (state: State) => { clearTimeout(state.timer); state.timer = undefined; };
  return {
    observe(message: AgentWidgetMessage, kind: ActivityKind, expanded: Set<string>, options: { autoExpand?: boolean; autoCollapseDelay?: number | false } = {}, inheritFrom?: string) {
      const data = kind === "tool" ? message.toolCall : message.reasoning;
      if (!data) return;
      // A newly formed group inherits open child details and manual intent once.
      if (!states.has(message.id) && inheritFrom !== undefined) {
        expanded[inheritFrom ? "add" : "delete"](message.id);
        stateFor(message.id).manual = states.get(inheritFrom)?.manual;
      }
      const state = stateFor(message.id);
      if (state.manual) return;
      if (data.status !== "complete") { cancel(state); state.finished = false; }
      if (!state.seen && data.status !== "complete" && data.chunks?.some(Boolean)) {
        state.seen = true;
        if (options.autoExpand !== false) expanded.add(message.id);
      }
      if (state.seen && data.status === "complete" && !state.finished) {
        state.finished = true;
        if (options.autoCollapseDelay === false) return;
        state.timer = setTimeout(() => {
          state.timer = undefined;
          expanded.delete(message.id);
          onCollapse(message.id, kind);
        }, options.autoCollapseDelay ?? 1000);
      }
    },
    manual(id: string) { const state = stateFor(id); state.manual = true; cancel(state); },
    prune(ids: Set<string>) {
      for (const [id, state] of states) if (!ids.has(id)) { cancel(state); states.delete(id); }
    },
    prepare(next: HTMLElement) { disclosure?.prepare(next); },
    sync() { disclosure?.sync(); },
    clear() { states.forEach(cancel); states.clear(); disclosure?.clear(); },
    destroy() { this.clear(); disclosure?.destroy(); },
  };
}

/** A collapsible group uses the same accessible row and expansion contract. */
export function createActivityGroup(message: AgentWidgetMessage, config: AgentWidgetConfig, expanded: boolean, label: string | HTMLElement): { bubble: HTMLElement; body: HTMLElement } {
  const bubble = createExpandableBubbleShell("persona-tool-bubble", message.id);
  const header = createExpandableHeader({ expandable: true, expanded, bubbleType: "tool" });
  const copy = createElement("div", "");
  if (typeof label === "string") copy.textContent = label; else copy.appendChild(label);
  const toolStyles = resolveToolStyles(config);
  appendHeaderToggle(header, copy, { config, expandable: true, expanded, iconColor: toolStyles.toggleTextColor || toolStyles.headerTextColor || "currentColor", metaGap: true });
  const body = createElement("div", "persona-border-t");
  body.style.display = expanded ? "" : "none";
  body.inert = !expanded;
  bubble.append(header, body);
  applyActivityRow(bubble, message, config, "tool", true);
  bubble.dataset.personaToolGroup = "true";
  if (config.expansion?.animation === "height") bubble.dataset.personaDisclosureMotion = "height";
  if (typeof label === "string" && (bubble.dataset.activityState === "running" || bubble.dataset.activityState === "pending")) {
    applyLoadingLabel(copy, config, "tool-group");
  }
  return { bubble, body };
}
