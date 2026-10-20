import { resolveToolStyles, applyToolPadding } from "./activity-deps";
import { appendToolDetails } from "./tool-details";
import { applyActivityRow, activityDisplay, activityLayout } from "./activity-row";
import { createElement, createNode } from "../utils/dom";
import { AgentWidgetMessage, AgentWidgetConfig } from "../types";
import { DEFAULT_TOOL_CALL_DISPLAY } from "../utils/activity-display-defaults";
import { describeToolTitle, resolveToolHeaderText, computeToolElapsed } from "../utils/activity-formatting";
import { applyLoadingLabel } from "../utils/loading-label-deps";
import { formatUnknownValue } from "../utils/format-value";
import { currentToolLabel, needsAttention, resolveActionTitle } from "../utils/turn-activity-display";
import { toolActivityLabel } from "../utils/tool-activity-summary";
import {
  activityPreview,
  appendHeaderToggle,
  appendActivitySummary,
  renderActivityTitle,
  applyExpansionDisplay,
  createCollapsedPreviewSection,
  createExpandableBubbleShell,
  createExpandableHeader,
  updateExpandableBubbleUI,
} from "./expandable-bubble";

// Rows inherit their muted label color; cards retain the legacy primary fallback.
// Explicit toggle and header colors win in both variants.
const toolChevronColor = (
  toolCallConfig: NonNullable<AgentWidgetConfig["toolCall"]>,
  activityRow = false
): string =>
  toolCallConfig.toggleTextColor ||
  toolCallConfig.headerTextColor ||
  (activityRow ? "currentColor" : "var(--persona-primary, #171717)");

const getToolPreviewText = (tool: NonNullable<AgentWidgetMessage["toolCall"]>, maxLines: number): string => {

  const chunkText = (tool.chunks ?? []).join("").trim();
  if (chunkText) return activityPreview(chunkText, -maxLines);

  return activityPreview(formatUnknownValue(tool.args), 0, maxLines);
};

const getToolSummaryText = (
  message: AgentWidgetMessage,
  tool: NonNullable<AgentWidgetMessage["toolCall"]>,
  config?: AgentWidgetConfig
): { summary: string; previewText: string; isActive: boolean } => {
  const toolDisplayConfig = config?.features?.toolCallDisplay;
  const row = activityLayout(config, "tool") === "row";
  const collapsedMode = toolDisplayConfig?.collapsedMode ?? DEFAULT_TOOL_CALL_DISPLAY.collapsedMode;
  const previewText = tool.success === false
    ? tool.error || "Tool failed"
    : getToolPreviewText(
        tool,
        toolDisplayConfig?.previewMaxLines ?? DEFAULT_TOOL_CALL_DISPLAY.previewMaxLines
      );
  const defaultSummary = row && collapsedMode === "tool-call" ? toolActivityLabel({ ...tool, approvalStatus: message.approval?.status ?? tool.approvalStatus })
    : tool.interrupted ? `${tool.name?.trim() || "Tool"} · Interrupted`
    : (config?.future?.v5Defaults || row ? `${tool.status === "complete" ? "Used" : "Using"} ${tool.name?.trim() || "tool"}` : describeToolTitle(tool));

  const isActive = tool.status !== "complete";
  const toolCallConfig = config?.toolCall ?? {};
  let summary = isActive && row && collapsedMode === "tool-call" && !needsAttention(message)
    ? currentToolLabel(message, config) : defaultSummary;
  if (collapsedMode === "tool-name") {
    summary = tool.name?.trim() || defaultSummary;
  } else if (collapsedMode === "tool-preview" && previewText) {
    summary = previewText;
  }

  // Apply text templates if configured
  if (isActive && toolCallConfig.activeTextTemplate) {
    summary = resolveToolHeaderText(tool, toolCallConfig.activeTextTemplate, summary);
  } else if (!isActive && !tool.interrupted && toolCallConfig.completeTextTemplate) {
    summary = resolveToolHeaderText(tool, toolCallConfig.completeTextTemplate, summary);
  }

  if (tool.interrupted) {
    if (!summary.includes(" · Interrupted")) summary += " · Interrupted";
  } else if (tool.success === false) summary += " · Failed";
  else if (tool.superseded) summary += " · Approved, ran again below";
  const approval = message.approval?.status ?? tool.approvalStatus;
  if (approval === "pending") summary += " · Waiting for approval";
  else if (approval === "denied") summary += " · Approval denied";
  else if (approval === "timeout") summary += " · Approval expired";
  return { summary, previewText, isActive };
};

// Helper function to update tool bubble UI after expansion state changes
export const updateToolBubbleUI = (
  messageId: string,
  bubble: HTMLElement,
  expansionState: Set<string>,
  config?: AgentWidgetConfig
): void => {
  updateExpandableBubbleUI(messageId, bubble, {
    stateSet: expansionState,
    config,
    iconColor: toolChevronColor(resolveToolStyles(config), bubble.classList.contains("persona-activity-row")),
  });
};

export const createToolBubble = (
  message: AgentWidgetMessage,
  config?: AgentWidgetConfig,
  expansionState = new Set<string>()
): HTMLElement => {
  config = activityDisplay(config, "tool", message);
  const tool = message.toolCall;
  const toolCallConfig = resolveToolStyles(config);

  const bubble = createExpandableBubbleShell("persona-tool-bubble", message.id);

  // Apply bubble-level styles
  if (toolCallConfig.backgroundColor) {
    bubble.style.backgroundColor = toolCallConfig.backgroundColor;
  }
  if (toolCallConfig.borderColor) {
    bubble.style.borderColor = toolCallConfig.borderColor;
  }
  if (toolCallConfig.borderWidth) {
    bubble.style.borderWidth = toolCallConfig.borderWidth;
  }
  if (toolCallConfig.borderRadius) {
    bubble.style.borderRadius = toolCallConfig.borderRadius;
  }
  bubble.style.boxShadow =
    toolCallConfig.shadow !== undefined
      ? (toolCallConfig.shadow.trim() === "" ? "none" : toolCallConfig.shadow)
      : "var(--persona-tool-bubble-shadow)";

  if (!tool) {
    return applyActivityRow(bubble, message, config, "tool");
  }

  const toolDisplayConfig = config.features!.toolCallDisplay!;
  const expandable = toolDisplayConfig.expandable ?? DEFAULT_TOOL_CALL_DISPLAY.expandable;
  const expanded = expandable && expansionState.has(message.id);
  const { summary, previewText, isActive } = getToolSummaryText(message, tool, config);

  const header = createExpandableHeader({ expandable, expanded, bubbleType: "tool" });

  // Apply header styles
  if (toolCallConfig.headerBackgroundColor) {
    header.style.backgroundColor = toolCallConfig.headerBackgroundColor;
  }
  applyToolPadding(header, config, "header");

  const headerContent = createElement("div", "persona-flex persona-flex-col persona-text-left");
  const title = createElement("span", "persona-text-xs persona-text-persona-primary");
  if (toolCallConfig.headerTextColor) {
    title.style.color = toolCallConfig.headerTextColor;
  }

  // Elapsed helpers: defined early so they're available to renderCollapsedSummary
  const startedAt = String(tool.startedAt ?? Date.now());

  // Helper: build a <span data-tool-elapsed> that the global timer in ui.ts updates
  const createElapsedSpan = (): HTMLElement => {
    const span = createElement("span", "");
    if (isActive) span.setAttribute("data-tool-elapsed", startedAt);
    span.textContent = computeToolElapsed(tool);
    return span;
  };

  const customSummary = toolCallConfig.renderCollapsedSummary?.({
    message,
    toolCall: tool,
    defaultSummary: summary,
    actionTitle: resolveActionTitle(message, config),
    previewText,
    collapsedMode: toolDisplayConfig.collapsedMode ?? DEFAULT_TOOL_CALL_DISPLAY.collapsedMode,
    isActive,
    config,
    elapsed: computeToolElapsed(tool),
    createElapsedElement: createElapsedSpan,
  });
  const skipCustomElement = appendActivitySummary(headerContent, title, customSummary, summary);

  // Apply loading animation when tool is active and no custom HTMLElement was provided
  const activeTemplate = toolCallConfig.activeTextTemplate;
  const completeTemplate = tool.interrupted ? undefined : toolCallConfig.completeTextTemplate;
  const currentTemplate = isActive ? activeTemplate : completeTemplate;

  if (!skipCustomElement) {
    if (currentTemplate) renderActivityTitle(title, currentTemplate, tool.name?.trim() || "tool", isActive, computeToolElapsed(tool), createElapsedSpan);
    if (isActive) applyLoadingLabel(title, config, "tool");
  }

  const iconColor = toolChevronColor(toolCallConfig, activityLayout(config, "tool") === "row");
  const toggleIcon = appendHeaderToggle(header, headerContent, {
    config,
    expandable,
    expanded,
    iconColor,
    metaGap: true,
  });

  const collapsedPreview = createCollapsedPreviewSection({
    bubble,
    previewKind: "tool",
    expanded,
    isActive,
    previewText,
    activePreview: toolDisplayConfig.activePreview,
    activeMinHeight: toolDisplayConfig.activeMinHeight,
    renderPreview: () =>
      toolCallConfig.renderCollapsedPreview?.({
        message,
        toolCall: tool,
        defaultPreview: previewText,
        isActive,
        config,
      }),
  });

  if (!expandable) {
    bubble.append(header, collapsedPreview);
    return applyActivityRow(bubble, message, config, "tool");
  }

  const content = createElement(
    "div",
    "persona-border-t persona-border-gray-200 persona-bg-gray-50 persona-space-y-3 persona-px-4 persona-py-3"
  );
  content.style.display = expanded ? "" : "none";

  // Apply content styles
  if (toolCallConfig.contentBackgroundColor) {
    content.style.backgroundColor = toolCallConfig.contentBackgroundColor;
  }
  if (toolCallConfig.contentTextColor) {
    content.style.color = toolCallConfig.contentTextColor;
  }
  applyToolPadding(content, config, "content");

  const v5 = config.future?.v5Defaults === true;
  if (toolDisplayConfig.showToolName && tool.name) content.appendChild(createNode("div", {
    className: `persona-text-xs persona-text-persona-muted${v5 ? "" : " persona-italic"}`,
    attrs: { "data-persona-tool-name": "" }, text: tool.name,
    style: { color: v5 ? undefined : toolCallConfig.contentTextColor || toolCallConfig.headerTextColor },
  }));
  if (v5) appendToolDetails(content, message, config);
  else {
    const section = (label: string, value: unknown) => {
      const block = createElement("div", "persona-space-y-1");
      const title = createNode("div", {
        className: "persona-text-xs persona-text-persona-muted", text: label,
        style: { color: toolCallConfig.labelTextColor },
      });
      const pre = createNode("pre", {
        className: "persona-whitespace-pre-wrap persona-rounded-lg persona-border persona-px-3 persona-py-2 persona-text-xs",
        style: {
          fontSize: "0.75rem", lineHeight: "1rem",
          backgroundColor: toolCallConfig.codeBlockBackgroundColor ?? "var(--persona-container, #f3f4f6)",
          borderColor: toolCallConfig.codeBlockBorderColor ?? "var(--persona-border, #e5e7eb)",
          color: toolCallConfig.codeBlockTextColor ?? "var(--persona-text, #171717)",
        },
      }, createNode("span", { className: "persona-activity-scroll", text: formatUnknownValue(value), attrs: { role: "region", "aria-label": label } }));
      block.append(title, pre);
      content.appendChild(block);
    };
    if (tool.args !== undefined) section("Arguments", tool.args);
    if (tool.chunks?.length) section("Activity", tool.chunks.join(""));

    if (tool.success === false) {
      content.appendChild(createNode("div", {
        className: "persona-text-sm persona-whitespace-pre-wrap",
        text: tool.error || "Tool failed",
        attrs: { "data-persona-tool-error": "" },
      }));
    }

    if (tool.status === "complete" && tool.result !== undefined) section("Result", tool.result);

  }

  applyExpansionDisplay({ expanded, header, toggleIcon, content, collapsedPreview, iconColor, config });

  bubble.append(header, collapsedPreview, content);
  return applyActivityRow(bubble, message, config, "tool");
};
