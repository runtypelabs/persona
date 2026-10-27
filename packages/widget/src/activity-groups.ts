import type { SessionRunActivity } from "./session";
import { classify, presentation, groupToolSummary } from "./utils/turn-activity-display";
import { turnUi, getActivityStyles } from "./components/activity-deps";
import type { AgentWidgetConfig, AgentWidgetMessage, AgentWidgetReasoning } from "./types";
import { appendRenderedValue } from "./components/expandable-bubble";
import { createElement } from "./utils/dom";
import { applyLoadingLabel } from "./utils/loading-label-deps";
import { summarizeToolActivity, groupActivityIcon } from "./utils/tool-activity-summary";
import { activityLayout, createActivityGroup, type createActivityLifecycle } from "./components/activity-row";
import { isStandaloneTool } from "./utils/standalone-tool";

/** Group visible tool rows only after the activity renderer has loaded. */
export type ActivityGroupOptions = {
  root: HTMLElement;
  runActivity?: SessionRunActivity;
  config: AgentWidgetConfig;
  messages: AgentWidgetMessage[];
  tempContainer: HTMLElement;
  streaming: boolean;
  showToolCalls: boolean;
  showReasoning: boolean;
  dropCompletedToolCalls: boolean;
  dropReasoningRow: (reasoning: AgentWidgetReasoning) => boolean;
  createMessageRow: (id: string, role: AgentWidgetMessage["role"]) => HTMLElement;
  activityIds: Set<string>;
  activityLifecycle: ReturnType<typeof createActivityLifecycle>;
  toolExpansionState: Set<string>;
};

export function groupToolRows(options: ActivityGroupOptions) {
  const { config, messages, tempContainer, streaming, runActivity, showToolCalls, showReasoning, dropCompletedToolCalls, dropReasoningRow, createMessageRow, activityIds, activityLifecycle, toolExpansionState } = options;

  const renderTurn = turnUi.render;
  if (config.turnActivity?.enabled && renderTurn) return renderTurn(options,
    { group: createActivityGroup, tools: groupToolRows, isStandaloneTool, classify, presentation, hasExplicitThemeStyle: getActivityStyles().hasExplicitThemeStyle });
  const display = config.features?.toolCallDisplay;
  if (display?.grouped) {
    const toolGroups: AgentWidgetMessage[][] = [];
    let currentGroup: AgentWidgetMessage[] = [];
    const iterationBoundary = display.groupBoundary === "iteration";
    const summaryOnly =
      display.groupedMode === "summary";

    const flush = () => {
      // Keep singleton boundaries for latest-group state, even without a wrapper.
      if (currentGroup.length) toolGroups.push(currentGroup);
      currentGroup = [];
    };

    messages.forEach((message) => {
      if (message.variant === "tool" && message.toolCall && showToolCalls && !isStandaloneTool(message, config)) {
        // A tool call hidden by `completedVisibility: "removed"` does not
        // create a visible break in the transcript, so it should not split
        // an otherwise contiguous group.
        if (dropCompletedToolCalls && message.toolCall.status === "complete" && !message.toolCall.interrupted) {
          return;
        }
        const previous = currentGroup[currentGroup.length - 1]?.agentMetadata;
        const next = message.agentMetadata;
        if (iterationBoundary && previous && next && (
          (previous.executionId && next.executionId && previous.executionId !== next.executionId) ||
          (previous.iteration !== undefined && next.iteration !== undefined && previous.iteration !== next.iteration)
        )) flush();
        currentGroup.push(message);
        return;
      }
      // A hidden reasoning row does not create a visible break in the
      // transcript, so it should not split an otherwise contiguous tool
      // sequence into separate groups.
      if (
        message.variant === "reasoning" &&
        (!showReasoning ||
          (message.reasoning?.status === "complete" &&
            dropReasoningRow(message.reasoning)))
      ) {
        return;
      }
      flush();
    });
    flush();

    const rows = new Map<string | undefined, HTMLElement>();
    for (const child of tempContainer.children) if (child instanceof HTMLElement) rows.set(child.dataset.wrapperId, child);
    toolGroups.forEach((group, groupIndex) => {
      const wrappers = group.map(message => rows.get(message.id))
        .filter((wrapper): wrapper is HTMLElement => Boolean(wrapper));

      if (wrappers.length < (summaryOnly ? 1 : 2)) {
        return;
      }

      const id = `tool-group-${group[0].id}`;
      const groupWrapper = createMessageRow(id, "assistant");
      groupWrapper.dataset.personaToolGroupRow = "true";
      if (display.groupAppearance || config.future?.v5Defaults) groupWrapper.dataset.groupAppearance = display.groupAppearance ?? "inset";

      const tools = group.map(item => item.toolCall!);
      const interrupted = tools.some(tool => tool.interrupted);
      const isLatestGroup = groupIndex === toolGroups.length - 1;
      const isCurrentRunGroup = group.some(item => runActivity?.messageIds.has(item.id));
      const context = { messages: group, toolCalls: tools, config,
        streaming, isLatestGroup, isCurrentRunGroup };

      const approvals = group.map(item => item.approval?.status ?? item.toolCall?.approvalStatus);
      const approvalStatus = (["pending", "denied", "timeout"] as const).find(status => approvals.includes(status));
      const success = !tools.some(tool => tool.success === false || tool.error);
      const attention = interrupted || !success || approvalStatus;
      const running = tools.some(tool => tool.status !== "complete");
      const active = running ||
        (!iterationBoundary && streaming && isLatestGroup && isCurrentRunGroup && !attention);
      const toolCount = `${group.length} tool${group.length === 1 ? "" : "s"}`;
      const aggregate = display.groupedMode === "collapsible" || activityLayout(config, "tool") === "row"
        ? summarizeToolActivity(tools.map((tool, index) => ({ ...tool, approvalStatus: approvals[index] })), display.groupSummaryMaxItems)
        : interrupted ? `${toolCount} · Interrupted` : `Called ${toolCount}`;

      const defaultSummary = groupToolSummary(group, config, aggregate);
      const renderedSummary = config.toolCall?.renderGroupedSummary?.({ ...context, defaultSummary }) ?? defaultSummary;
      wrappers[0].before(groupWrapper);

      if (display.groupedMode === "collapsible") {
        const synthetic: AgentWidgetMessage = { ...group[0], id, approval: undefined, toolCall: {
          id, status: active ? "running" : "complete",
          chunks: tools.flatMap(tool => tool.chunks ?? []),
          success, interrupted, approvalStatus,
        } };
        // Only measured timestamps establish a wall-clock interval. Never add
        // individual durations: tools can overlap or have gaps between batches.
        if (tools.every(tool => measured(tool.startedAt) &&
          (tool.status !== "complete" || (measured(tool.completedAt) && tool.completedAt! >= tool.startedAt!)))) {
          const start = Math.min(...tools.map(tool => tool.startedAt!));
          const end = Math.max(...tools.map(tool => tool.completedAt ?? tool.startedAt!));
          if (running) synthetic.toolCall!.startedAt = start;
          else synthetic.toolCall!.durationMs = end - start;
        }
        activityIds.add(id);
        activityLifecycle.observe(synthetic, "tool", toolExpansionState, display, group.find(item => toolExpansionState.has(item.id))?.id ?? "");
        const row = createActivityGroup(synthetic, config, toolExpansionState.has(id), renderedSummary, undefined, !active && !attention ? groupActivityIcon(tools, config) : undefined);
        row.bubble.classList.add("persona-tool-group");
        row.body.dataset.personaToolGroupStack = "true";
        groupWrapper.appendChild(row.bubble);
        wrappers.forEach((wrapper, index) => {
          fillRow(wrapper);
          wrapper.style.setProperty("--persona-activity-stagger", `${index * 40}ms`);
          wrapper.classList.add("persona-activity-group-child");
          row.body.appendChild(wrapper);
        });
        return;
      }

      const groupContainer = createElement("div", "persona-tool-group persona-flex persona-w-full persona-flex-col persona-gap-2");
      groupContainer.dataset.personaToolGroup = "true";

      const summary = createElement("div", "persona-tool-group-summary persona-text-xs persona-text-persona-muted");
      summary.id = `tool-group-summary-${group[0].id}`;

      appendRenderedValue(summary, renderedSummary);
      if (!(renderedSummary instanceof HTMLElement) && active && !attention) applyLoadingLabel(summary, config, "tool-group");

      groupContainer.appendChild(summary);
      groupWrapper.appendChild(groupContainer);
      if (summaryOnly) {
        for (const wrapper of wrappers) wrapper.remove();
        return;
      }
      const stack = createElement("div", "persona-tool-group-stack persona-flex persona-flex-col");
      stack.id = `tool-group-stack-${group[0].id}`;
      stack.dataset.personaToolGroupStack = "true";
      groupContainer.appendChild(stack);

      wrappers.forEach((wrapper, wrapperIndex) => {
        // The outer group row owns role sizing. Inner message rows fill that
        // resolved track instead of applying the role max-width a second
        // time (which would turn an 85% cap into 72.25%).
        fillRow(wrapper);
        const item = createElement("div", "persona-tool-group-item persona-relative");
        item.dataset.personaToolGroupItem = "true";
        if (wrapperIndex < wrappers.length - 1) {
          item.dataset.personaToolGroupConnector = "true";
        }
        item.appendChild(wrapper);
        stack.appendChild(item);
      });
    });
  }

  return false;
}

const measured = (value: number | undefined) => value! > 0 && value! <= Date.now();

const fillRow = (wrapper: HTMLElement) => wrapper.style.setProperty("--persona-message-row-max-width", "100%");
