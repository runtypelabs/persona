import { applyActivityRow, activityDisplay, activityLayout, activityDuration } from "./activity-row";
import { createElement, createNode } from "../utils/dom";
import { renderLucideIcon } from "./activity-deps";
import { AgentWidgetConfig, AgentWidgetMessage } from "../types";
import { DEFAULT_REASONING_DISPLAY } from "../utils/activity-display-defaults";
import { describeReasonStatus, computeReasoningElapsed } from "../utils/activity-formatting";
import { applyLoadingLabel } from "../utils/loading-label-deps";
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

// Helper function to update reasoning bubble UI after expansion state changes
export const updateReasoningBubbleUI = (
  messageId: string,
  bubble: HTMLElement,
  expansionState: Set<string>,
  config?: AgentWidgetConfig
): void => {
  updateExpandableBubbleUI(messageId, bubble, {
    stateSet: expansionState,
    config,
    iconColor: "currentColor",
  });
};

export const createReasoningBubble = (
  message: AgentWidgetMessage,
  config?: AgentWidgetConfig,
  expansionState = new Set<string>()
): HTMLElement => {
  config = activityDisplay(config, "reasoning", message);
  const reasoning = message.reasoning;
  const bubble = createExpandableBubbleShell("persona-reasoning-bubble", message.id);

  if (!reasoning) {
    return applyActivityRow(bubble, message, config, "reasoning");
  }

  const reasoningDisplayConfig = config.features!.reasoningDisplay!;
  const expandable = reasoningDisplayConfig.expandable ?? DEFAULT_REASONING_DISPLAY.expandable;
  const expanded = expandable && expansionState.has(message.id);
  const isActive = reasoning.status !== "complete";
  const previewText = activityPreview(
    message.reasoning?.chunks.join("") ?? "", 0,
    reasoningDisplayConfig.previewMaxLines ?? DEFAULT_REASONING_DISPLAY.previewMaxLines
  );
  const header = createExpandableHeader({ expandable, expanded, bubbleType: "reasoning" });

  const headerContent = createElement("div", "persona-flex persona-flex-col persona-text-left");
  const title = createElement("span", "persona-text-xs persona-text-persona-primary");
  const row = activityLayout(config, "reasoning") === "row";
  bubble.dataset.appearance = reasoningDisplayConfig.appearance ?? (config.future?.v5Defaults ? "inset" : row ? "plain" : "panel");
  const defaultSummary = row && !isActive ? `Thought for ${activityDuration(reasoning.durationMs ?? (reasoning.completedAt! - reasoning.startedAt! || undefined))}` : "Thinking...";
  const reasoningConfig = config.reasoning ?? {};

  // Elapsed helpers: defined early so they're available to renderCollapsedSummary
  const startedAt = String(reasoning.startedAt ?? Date.now());

  const createElapsedSpan = (): HTMLElement => {
    const span = createElement("span", "");
    span.setAttribute("data-tool-elapsed", startedAt);
    span.textContent = computeReasoningElapsed(reasoning);
    return span;
  };

  const customSummary = reasoningConfig.renderCollapsedSummary?.({
    message,
    reasoning,
    defaultSummary,
    previewText,
    isActive,
    config,
    elapsed: computeReasoningElapsed(reasoning),
    createElapsedElement: createElapsedSpan,
  });
  const skipCustomElement = appendActivitySummary(headerContent, title, customSummary, defaultSummary);

  // Status span: used in the legacy (no-template) path
  const status = createElement("span", "persona-text-xs persona-text-persona-primary");
  status.textContent = describeReasonStatus(reasoning);
  if (!row) headerContent.appendChild(status);

  // Template and animation support
  const activeTemplate = reasoningConfig.activeTextTemplate;
  const completeTemplate = reasoningConfig.completeTextTemplate;
  const currentTemplate = isActive ? activeTemplate : completeTemplate;

  if (!skipCustomElement) {
    if (currentTemplate) {
      status.style.display = "none";
      renderActivityTitle(title, currentTemplate, "", isActive, computeReasoningElapsed(reasoning), createElapsedSpan);
    }
    title.style.display = !currentTemplate && !isActive && !row ? "none" : "";
    if (isActive) applyLoadingLabel(title, config, "reasoning");
  }

  // `reasoningDisplay.iconName`: a leading glyph in the header row. Appended
  // before the header content, which `appendHeaderToggle` adds next.
  if (reasoningDisplayConfig.iconName && !skipCustomElement) {
    const iconHost = createElement("span", "persona-reasoning-header-icon");
    const glyph = renderLucideIcon(
      reasoningDisplayConfig.iconName,
      16,
      "currentColor",
      2
    );
    if (glyph) {
      iconHost.appendChild(glyph);
      header.appendChild(iconHost);
    }
  }

  const iconColor = "currentColor";
  const toggleIcon = appendHeaderToggle(header, headerContent, {
    config,
    expandable,
    expanded,
    iconColor,
    metaGap: false,
  });

  const collapsedPreview = createCollapsedPreviewSection({
    bubble,
    previewKind: "reasoning",
    expanded,
    isActive,
    previewText,
    activePreview: reasoningDisplayConfig.activePreview,
    activeMinHeight: reasoningDisplayConfig.activeMinHeight,
    renderPreview: () =>
      config.reasoning?.renderCollapsedPreview?.({
        message,
        reasoning,
        defaultPreview: previewText,
        isActive,
        config,
      }),
  });

  if (!expandable) {
    bubble.append(header, collapsedPreview);
    return applyActivityRow(bubble, message, config, "reasoning");
  }

  const content = createElement(
    "div",
    "persona-border-t persona-border-gray-200 persona-bg-gray-50 persona-px-4 persona-py-3"
  );
  // Scroll the inner text; the outer body remains the disclosure motion boundary.
  const maxHeight = reasoningDisplayConfig.maxHeight;
  const body = createNode("div", {
    className: "persona-whitespace-pre-wrap",
  }, createNode("div", {
    className: "persona-activity-scroll",
    text: reasoning.chunks.join("") || (isActive ? "Waiting for details…" : "No additional context was shared."),
    style: { maxHeight },
    attrs: { tabindex: "0", role: "region", "aria-label": "Reasoning" },
  }));
  content.appendChild(body);

  applyExpansionDisplay({ expanded, header, toggleIcon, content, collapsedPreview, iconColor, config });

  bubble.append(header, collapsedPreview, content);
  return applyActivityRow(bubble, message, config, "reasoning");
};
