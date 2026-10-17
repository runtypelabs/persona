import type { AgentWidgetConfig, AgentWidgetMessage, AgentWidgetReasoning } from "./types";
import { createActivityGroup, type createActivityLifecycle } from "./components/activity-row";

/** Group visible tool rows only after the activity renderer has loaded. */
export function groupToolRows(options: {
  config: AgentWidgetConfig;
  messages: AgentWidgetMessage[];
  tempContainer: HTMLElement;
  showToolCalls: boolean;
  showReasoning: boolean;
  dropCompletedToolCalls: boolean;
  dropReasoningRow: (reasoning: AgentWidgetReasoning) => boolean;
  createMessageRow: (id: string, role: AgentWidgetMessage["role"]) => HTMLElement;
  activityIds: Set<string>;
  activityLifecycle: ReturnType<typeof createActivityLifecycle>;
  toolExpansionState: Set<string>;
}) {
  const { config, messages, tempContainer, showToolCalls, showReasoning, dropCompletedToolCalls, dropReasoningRow, createMessageRow, activityIds, activityLifecycle, toolExpansionState } = options;
  const appendRenderedValue = (
    containerEl: HTMLElement,
    value: HTMLElement | string | null | undefined
  ): boolean => {
    if (value == null) return false;
    if (typeof value === "string") {
      containerEl.textContent = value;
      return true;
    }
    containerEl.appendChild(value);
    return true;
  };

  if (config.features?.toolCallDisplay?.grouped) {
    const toolGroups: AgentWidgetMessage[][] = [];
    let currentGroup: AgentWidgetMessage[] = [];
    const summaryOnly =
      config.features.toolCallDisplay.groupedMode === "summary";

    messages.forEach((message) => {
      if (message.variant === "tool" && message.toolCall && showToolCalls) {
        // A tool call hidden by `completedVisibility: "removed"` does not
        // create a visible break in the transcript, so it should not split
        // an otherwise contiguous group.
        if (dropCompletedToolCalls && message.toolCall.status === "complete" && !message.toolCall.interrupted) {
          return;
        }
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
      // Summary mode owns the visible row from the first tool onward. Waiting
      // for a second tool would replace the standalone tool bubble with a new
      // group row, restarting custom activity animations and transiently
      // dropping interactive DOM state during the handoff.
      if (currentGroup.length > 1 || (summaryOnly && currentGroup.length > 0)) {
        toolGroups.push(currentGroup);
      }
      currentGroup = [];
    });
    if (currentGroup.length > 1 || (summaryOnly && currentGroup.length > 0)) {
      toolGroups.push(currentGroup);
    }

    toolGroups.forEach((group) => {
      const wrappers = group
        .map((groupMessage) =>
          Array.from(tempContainer.children).find(
            (child) =>
              child instanceof HTMLElement &&
              child.getAttribute("data-wrapper-id") === groupMessage.id
          ) as HTMLElement | undefined
        )
        .filter((wrapper): wrapper is HTMLElement => Boolean(wrapper));

      if (wrappers.length < (summaryOnly ? 1 : 2)) {
        return;
      }

      const groupWrapper = createMessageRow(
        `tool-group-${group[0].id}`,
        "assistant"
      );
      groupWrapper.setAttribute("data-persona-tool-group-row", "true");

      if (config.features?.toolCallDisplay?.groupedMode === "collapsible") {
        const id = `tool-group-${group[0].id}`;
        const active = group.some(item => item.toolCall?.status !== "complete");
        const synthetic: AgentWidgetMessage = { ...group[0], id, toolCall: {
          id, name: `${group.length} tools`, status: active ? "running" : "complete",
          chunks: group.flatMap(item => item.toolCall?.chunks ?? []),
          success: !group.some(item => item.toolCall?.success === false),
          interrupted: !active && group.some(item => item.toolCall?.interrupted),
        } };
        activityIds.add(id);
        activityLifecycle.observe(synthetic, "tool", toolExpansionState, config.features.toolCallDisplay);
        const label = synthetic.toolCall?.interrupted ? `${group.length} tools · Interrupted`
          : `${active ? "Using" : "Used"} ${group.length} tools`;
        const custom = config.toolCall?.renderGroupedSummary?.({ messages: group, toolCalls: group.map(item => item.toolCall!), defaultSummary: label, config });
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

      const groupContainer = document.createElement("div");
      groupContainer.className =
        "persona-tool-group persona-flex persona-w-full persona-flex-col persona-gap-2";
      groupContainer.setAttribute("data-persona-tool-group", "true");

      const summary = document.createElement("div");
      summary.className =
        "persona-tool-group-summary persona-text-xs persona-text-persona-muted";
      summary.id = `tool-group-summary-${group[0].id}`;

      const toolCount = `${group.length} ${group.length === 1 ? "tool" : "tools"}`;
      const defaultSummary = group.some(item => item.toolCall?.interrupted)
        ? `${toolCount} · Interrupted` : `Called ${toolCount}`;
      const renderedSummary = config.toolCall?.renderGroupedSummary?.({
        messages: group,
        toolCalls: group
          .map((groupMessage) => groupMessage.toolCall)
          .filter((toolCall): toolCall is NonNullable<typeof group[number]["toolCall"]> => Boolean(toolCall)),
        defaultSummary,
        config,
      });
      if (!appendRenderedValue(summary, renderedSummary)) {
        summary.textContent = defaultSummary;
      }

      const stack = document.createElement("div");
      stack.className = "persona-tool-group-stack persona-flex persona-flex-col";
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
        const item = document.createElement("div");
        item.className = "persona-tool-group-item persona-relative";
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
