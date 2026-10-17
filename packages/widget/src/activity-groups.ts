import type { AgentWidgetConfig, AgentWidgetMessage, AgentWidgetReasoning } from "./types";
import { appendRenderedValue } from "./components/expandable-bubble";
import { createElement } from "./utils/dom";
import { applyLoadingLabel } from "./utils/loading-label-deps";
import { createActivityGroup, type createActivityLifecycle } from "./components/activity-row";

/** Group visible tool rows only after the activity renderer has loaded. */
export function groupToolRows(options: {
  config: AgentWidgetConfig;
  messages: AgentWidgetMessage[];
  tempContainer: HTMLElement;
  streaming: boolean;
  currentRunToolIds?: ReadonlySet<string>;
  showToolCalls: boolean;
  showReasoning: boolean;
  dropCompletedToolCalls: boolean;
  dropReasoningRow: (reasoning: AgentWidgetReasoning) => boolean;
  createMessageRow: (id: string, role: AgentWidgetMessage["role"]) => HTMLElement;
  activityIds: Set<string>;
  activityLifecycle: ReturnType<typeof createActivityLifecycle>;
  toolExpansionState: Set<string>;
}) {
  const { config, messages, tempContainer, streaming, currentRunToolIds, showToolCalls, showReasoning, dropCompletedToolCalls, dropReasoningRow, createMessageRow, activityIds, activityLifecycle, toolExpansionState } = options;

  const display = config.features?.toolCallDisplay;
  if (display?.grouped) {
    const toolGroups: AgentWidgetMessage[][] = [];
    let currentGroup: AgentWidgetMessage[] = [];
    const iterationBoundary = display.groupBoundary === "iteration";
    const summaryOnly =
      display.groupedMode === "summary";

    const flush = () => {
      if (currentGroup.length > 1 || ((summaryOnly || iterationBoundary) && currentGroup.length > 0)) toolGroups.push(currentGroup);
      currentGroup = [];
    };

    messages.forEach((message) => {
      if (message.variant === "tool" && message.toolCall && showToolCalls) {
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

      if (wrappers.length < (summaryOnly || iterationBoundary ? 1 : 2)) {
        return;
      }

      const groupWrapper = createMessageRow(
        `tool-group-${group[0].id}`,
        "assistant"
      );
      groupWrapper.setAttribute("data-persona-tool-group-row", "true");

      const toolCount = `${group.length} ${group.length === 1 ? "tool" : "tools"}`;
      const interrupted = group.some(item => item.toolCall?.interrupted);
      const isLatestGroup = groupIndex === toolGroups.length - 1;
      const isCurrentRunGroup = group.some(item => currentRunToolIds?.has(item.id));
      const context = { messages: group, toolCalls: group.map(item => item.toolCall!), config,
        streaming, isLatestGroup, isCurrentRunGroup };

      const approvals = group.map(item => item.approval?.status ?? item.toolCall?.approvalStatus);
      const approvalStatus = approvals.includes("denied") ? "denied" : approvals.includes("pending") ? "pending" : undefined;
      const success = !group.some(item => item.toolCall?.success === false);
      const attention = interrupted || !success || approvalStatus;
      const active = group.some(item => item.toolCall?.status !== "complete") ||
        (!iterationBoundary && streaming && isLatestGroup && isCurrentRunGroup && !attention);

      if (display.groupedMode === "collapsible") {
        const id = `tool-group-${group[0].id}`;
        const synthetic: AgentWidgetMessage = { ...group[0], id, approval: undefined, toolCall: {
          id, name: toolCount, status: active ? "running" : "complete",
          chunks: group.flatMap(item => item.toolCall?.chunks ?? []),
          success, interrupted, approvalStatus,
        } };
        activityIds.add(id);
        activityLifecycle.observe(synthetic, "tool", toolExpansionState, display);
        const label = synthetic.toolCall?.interrupted ? `${toolCount} · Interrupted`
          : `${active ? "Using" : "Used"} ${toolCount}`;
        const custom = config.toolCall?.renderGroupedSummary?.({ ...context, defaultSummary: label });
        const row = createActivityGroup(synthetic, config, toolExpansionState.has(id), custom ?? label);
        row.bubble.classList.add("persona-tool-group");
        row.body.dataset.personaToolGroupStack = "true";
        wrappers[0].before(groupWrapper);
        groupWrapper.appendChild(row.bubble);
        wrappers.forEach((wrapper, index) => {
          wrapper.style.setProperty("--persona-message-row-max-width", "100%");
          wrapper.style.setProperty("--persona-activity-stagger", `${index * 40}ms`);
          wrapper.classList.add("persona-activity-group-child");
          row.body.appendChild(wrapper);
        });
        return;
      }

      const groupContainer = createElement("div", "persona-tool-group persona-flex persona-w-full persona-flex-col persona-gap-2");
      groupContainer.setAttribute("data-persona-tool-group", "true");

      const summary = createElement("div", "persona-tool-group-summary persona-text-xs persona-text-persona-muted");
      summary.id = `tool-group-summary-${group[0].id}`;

      const defaultSummary = interrupted
        ? `${toolCount} · Interrupted` : `Called ${toolCount}`;
      const renderedSummary = config.toolCall?.renderGroupedSummary?.({
        ...context,
        defaultSummary,
      });
      appendRenderedValue(summary, renderedSummary ?? defaultSummary);
      if (!(renderedSummary instanceof HTMLElement) && active && !attention) applyLoadingLabel(summary, config, "tool-group");

      const stack = createElement("div", "persona-tool-group-stack persona-flex persona-flex-col");
      stack.id = `tool-group-stack-${group[0].id}`;
      stack.setAttribute("data-persona-tool-group-stack", "true");

      groupContainer.appendChild(summary);
      if (!summaryOnly) {
        groupContainer.appendChild(stack);
      }
      groupWrapper.appendChild(groupContainer);
      wrappers[0].before(groupWrapper);

      wrappers.forEach((wrapper, wrapperIndex) => {
        if (summaryOnly) {
          wrapper.remove();
          return;
        }
        // The outer group row owns role sizing. Inner message rows fill that
        // resolved track instead of applying the role max-width a second
        // time (which would turn an 85% cap into 72.25%).
        wrapper.style.setProperty("--persona-message-row-max-width", "100%");
        const item = createElement("div", "persona-tool-group-item persona-relative");
        item.setAttribute("data-persona-tool-group-item", "true");
        if (wrapperIndex < wrappers.length - 1) {
          item.setAttribute("data-persona-tool-group-connector", "true");
        }
        item.appendChild(wrapper);
        stack.appendChild(item);
      });
    });
  }

}
