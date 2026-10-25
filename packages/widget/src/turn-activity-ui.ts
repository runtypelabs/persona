import type { ActivityGroupOptions } from "./activity-groups";
import type { AgentWidgetConfig, AgentWidgetMessage, AgentWidgetTurnActivity } from "./types";
import type { createActivityGroup } from "./components/activity-row";
import { createElement } from "./utils/dom";
import type { hasExplicitThemeStyle } from "./utils/style-provenance";
import type { classify, presentation } from "./utils/turn-activity-display";

export type TurnActivityDependencies = {
  group: typeof createActivityGroup;
  tools: (options: ActivityGroupOptions) => boolean;
  breaksToolGroup: (message: AgentWidgetMessage) => boolean;
  classify: typeof classify;
  presentation: typeof presentation;
  hasExplicitThemeStyle: typeof hasExplicitThemeStyle;
};
export interface TurnActivityRuntime {
  render(options: ActivityGroupOptions, deps: TurnActivityDependencies): boolean;
}

type Turn = {
  id: string;
  messages: AgentWidgetMessage[];
  metadata: AgentWidgetTurnActivity[];
  outcome?: AgentWidgetTurnActivity["outcome"];
  completedAt?: number;
  active: boolean;
  pendingApproval: boolean;
};
type State = { runId?: string; owned: Set<string>; turns: Map<string, Turn>; options: ActivityGroupOptions };
const states = new WeakMap<HTMLElement, State>();
const identity = (id: string) => `turn-activity-${encodeURIComponent(id)}`;
const measured = (value: number | undefined): value is number => Number.isFinite(value) && value! > 0 && value! <= Date.now();

const formatDuration = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

function summary(turn: Turn) {
  const starts = turn.metadata.map(item => item.startedAt).filter(measured);
  const ends = turn.metadata.map(item => item.completedAt).filter(measured);
  if (measured(turn.completedAt)) ends.push(turn.completedAt);
  const startedAt = starts.length ? Math.min(...starts) : undefined;
  const completedAt = ends.length ? Math.max(...ends) : undefined;
  const elapsedMs = startedAt !== undefined && (turn.active || completedAt !== undefined && completedAt >= startedAt)
    ? Math.max(0, (turn.active ? Date.now() : completedAt!) - startedAt) : undefined;
  const prefix = turn.pendingApproval ? "Waiting for approval" : turn.active ? "Working" : turn.outcome === "cancel" ? "Stopped" : turn.outcome === "error" ? "Failed" : "Worked";
  return { startedAt, elapsedMs, prefix, defaultSummary: prefix + (elapsedMs === undefined || elapsedMs < 1000 ? "" : ` for ${formatDuration(elapsedMs)}`) };
}

function label(turn: Turn, state: State): string | HTMLElement {
  const timing = summary(turn);
  const custom = state.options.config.turnActivity?.renderHeader?.({
    id: turn.id, messages: turn.messages, active: turn.active, outcome: turn.outcome,
    elapsedMs: timing.elapsedMs, defaultSummary: timing.defaultSummary, config: state.options.config,
  });
  if (custom != null) return custom;
  const text = createElement("span", "");
  text.dataset.personaTurnLabel = "true";
  text.append(timing.prefix);
  if (timing.elapsedMs !== undefined) {
    const elapsed = createElement("span", "persona-activity-duration persona-turn-activity-duration");
    elapsed.dataset.prefix = " for ";
    elapsed.textContent = timing.elapsedMs >= 1000 ? ` for ${formatDuration(timing.elapsedMs)}` : "";
    if (turn.active && timing.startedAt !== undefined) elapsed.setAttribute("data-tool-elapsed", String(timing.startedAt));
    text.append(elapsed);
  }
  return text;
}

/** Compose existing message rows; metadata never changes model content or storage. */
export function render(options: ActivityGroupOptions, deps: TurnActivityDependencies): boolean {
  const { config, root, messages, tempContainer, toolExpansionState, activityLifecycle, activityIds } = options;
  if (!config.turnActivity?.enabled) { if (!options.runActivity) states.delete(root); return false; }
  // The ordinary tool grouper sees one explicit identity at a time, so it can
  // never absorb another turn. All rendering and disclosure behavior is reused.
  const visibleTools = messages.filter(message => message.variant === "tool" && message.toolCall &&
    !(options.dropCompletedToolCalls && message.toolCall?.status === "complete" && !message.toolCall.interrupted));
  const lastTool = visibleTools[visibleTools.length - 1]?.id;
  const lastGroupedTool = visibleTools.filter(message => !deps.breaksToolGroup(message)).pop()?.id;
  const classification = new Map(messages.map(message => [message,
    deps.classify(message, config)]));
  let partition: AgentWidgetMessage[] = [];
  let currentId: string | undefined;
  let currentKind: AgentWidgetTurnActivity["kind"] | undefined;
  const flush = () => {
    if (partition.length) {
      const scoped = deps.presentation(config, partition[0]);
      const renderGroupedSummary = scoped.toolCall?.renderGroupedSummary;
      deps.tools({ ...options,
        config: { ...scoped, toolCall: { ...scoped.toolCall, renderGroupedSummary: renderGroupedSummary
          ? context => renderGroupedSummary({ ...context, config, streaming: options.streaming,
            isLatestGroup: context.isLatestGroup && context.messages.some(message => message.id === lastGroupedTool) }) : undefined },
          turnActivity: { ...config.turnActivity, enabled: false } },
        messages: partition, streaming: options.streaming && partition.some(message => message.id === lastTool) });
    }
    partition = [];
  };
  for (const message of messages) {
    const metadata = classification.get(message);
    const id = metadata?.id;
    if (id !== currentId || metadata?.kind !== currentKind) flush();
    partition.push(message);
    currentId = id;
    currentKind = metadata?.kind;
  }
  flush();
  const old = states.get(root);
  const run = options.runActivity;
  const state: State = { turns: new Map(), options, runId: run?.run.runId,
    owned: old?.runId === run?.run.runId ? old?.owned ?? new Set() : new Set() };
  states.set(root, state);
  const rows = new Map(Array.from(tempContainer.children, child => [(child as HTMLElement).dataset.wrapperId, child as HTMLElement]));
  let activeTurn = false;
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const metadata = classification.get(message);
    if (!metadata?.id) continue;
    let turn = state.turns.get(metadata.id);
    if (!turn) {
      const retained = old?.turns.get(metadata.id);
      const previous = run && old?.runId && retained?.messages.some(message => messages.includes(message)) ? retained : undefined;
      turn = { id: metadata.id, messages: [], metadata: [], active: false, pendingApproval: false,
        outcome: previous?.outcome, completedAt: previous?.completedAt };
      state.turns.set(metadata.id, turn);
    }
    turn.metadata.push(metadata);
    if (metadata.outcome) turn.outcome = metadata.outcome;
    if (measured(metadata.completedAt)) {
      turn.completedAt = metadata.completedAt;
      turn.outcome ??= "success";
    }
    if (run && run.messageIds.has(message.id) && !turn.outcome) state.owned.add(turn.id);
    if (run && state.owned.has(turn.id)) {
      turn.outcome ??= run.run.outcome;
      if (run.run.outcome) turn.completedAt ??= run.run.timestamp;
      turn.active = !turn.outcome;
    }
    if (metadata.kind === "final") continue;
    turn.messages.push(message);
    turn.pendingApproval ||= message.approval?.status === "pending" || message.toolCall?.approvalStatus === "pending";

  }
  // Visible outside messages split disclosures. Never move later progress above
  // an unclassified block or a partial answer; hidden rows do not split a span.
  const segments: { turn: Turn; firstId: string; wrappers: HTMLElement[] }[] = [];
  let segment: typeof segments[number] | undefined;
  for (const message of messages) {
    if (deps.breaksToolGroup(message)) { segment = undefined; continue; }
    const row = rows.get(message.id) ?? rows.get(`tool-group-${message.id}`);
    if (!row) continue;
    const metadata = classification.get(message);
    const turn = metadata?.kind === "progress" ? state.turns.get(metadata.id) : undefined;
    if (!turn) { segment = undefined; continue; }
    if (segment?.turn !== turn) { segment = { turn, firstId: message.id, wrappers: [] }; segments.push(segment); }
    if (!segment.wrappers.includes(row)) segment.wrappers.push(row);
  }
  for (const { turn, firstId, wrappers } of segments) {
    if (turn.outcome) turn.pendingApproval = false;
    turn.active = !turn.outcome && (turn.active || turn.pendingApproval);
    const id = `${identity(turn.id)}-${encodeURIComponent(firstId)}`;
    const synthetic: AgentWidgetMessage = { id, role: "assistant", content: "", createdAt: "", toolCall: {
      id, status: turn.active ? "running" : "complete", chunks: ["activity"],
      interrupted: turn.outcome === "cancel", success: turn.outcome !== "error",
      approvalStatus: turn.pendingApproval ? "pending" : undefined,
    } };
    activityIds.add(id);
    activityLifecycle.observe(synthetic, "tool", toolExpansionState, { autoExpand: true, autoCollapseDelay: 0 });
    const header = label(turn, state);
    const row = deps.group(synthetic, config, toolExpansionState.has(id), header,
      !turn.pendingApproval && (typeof header === "string" || header.dataset.personaTurnLabel === "true"),
      typeof config.toolCall?.iconName === "string" ? config.toolCall.iconName : "square-text");
    row.bubble.removeAttribute("data-persona-tool-group");
    row.bubble.dataset.personaTurnActivity = turn.id;
    row.body.classList.add("persona-turn-activity-body");
    // V5 emits ordinary activity defaults; authored spacing takes precedence.
    // The injected checker shares activity-ui's initialized provenance service.
    for (const [token, value] of [["transcriptGap", "16px"], ["bodyPadding", "16px 0"],
      ["groupIndent", "16px"], ["groupPadding", "2px 0"], ["groupGap", "2px"], ["rowHeight", "28px"]]) {
      if (!deps.hasExplicitThemeStyle(config, `activity.${token}`)) {
        row.bubble.style.setProperty(`--persona-components-activity-${token}`, value);
      }
    }
    // Duration belongs to the whole response and is already part of its label.
    row.bubble.querySelector(":scope > button > .persona-activity-duration")?.remove();
    const wrapper = options.createMessageRow(id, "assistant");
    wrapper.dataset.personaTurnActivityRow = "true";
    wrappers[0].before(wrapper);
    wrapper.append(row.bubble);
    for (const child of wrappers) {
      child.style.setProperty("--persona-message-row-max-width", "100%");
      compactCommentary(child, config, deps.hasExplicitThemeStyle);
      row.body.append(child);
    }
    activeTurn ||= turn.active;
  }
  return activeTurn;
}


/** Decorate only the built-in message renderer, before morphing the live DOM. */
function compactCommentary(row: HTMLElement, config: AgentWidgetConfig, checkStyle: typeof hasExplicitThemeStyle) {
  const standard = row.querySelector<HTMLElement>("[data-persona-default-message]");
  const bubble = standard?.matches(".persona-message-bubble") ? standard : standard?.querySelector<HTMLElement>(".persona-message-bubble");
  if (!bubble) return;
  bubble.querySelector(":scope > .persona-message-actions")?.remove();
  bubble.classList.add("persona-turn-commentary");
  for (const [property, token, fallback] of [
    ["background-color", "background", "transparent"], ["padding", "padding", "0px"],
    ["border-width", "borderWidth", "0px"], ["border-radius", "borderRadius", "0px"],
    ["box-shadow", "shadow", "none"],
  ]) {
    if (!checkStyle(config, `message.assistant.${token}`)) bubble.style.setProperty(property, fallback);
  }
}

