import { appendToolDetails } from "./tool-details";
import { activityDisplay, activityVariant } from "./activity-row";
import { applyActivityRow } from "./activity-row-render";
import { createElement, createNode } from "../utils/dom";
import { AgentWidgetMessage, AgentWidgetConfig } from "../types";
import { DEFAULT_TOOL_CALL_DISPLAY } from "../defaults";
import { formatUnknownValue, describeToolTitle, resolveToolHeaderText, computeToolElapsed, parseFormattedTemplate } from "../utils/formatting";
import { appendCharSpans } from "../utils/tool-loading-animation";
import {
  appendHeaderToggle,
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

const getToolPreviewText = (message: AgentWidgetMessage, maxLines: number): string => {
  const tool = message.toolCall;
  if (!tool) return "";

  const chunkText = (tool.chunks ?? []).join("").trim();
  if (chunkText) {
    const lines = chunkText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-maxLines);
    return lines.join("\n");
  }

  const argsText = formatUnknownValue(tool.args).trim();
  if (!argsText) return "";

  return argsText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .join("\n");
};

/**
 * Apply the colors for a tool-bubble code block (Arguments / Activity / Result).
 *
 * Defaults are theme-aware tokens so the blocks stay readable in dark themes.
 */
const applyToolCodeBlockColors = (
  pre: HTMLElement,
  toolCallConfig: NonNullable<AgentWidgetConfig["toolCall"]>
): void => {
  pre.style.backgroundColor =
    toolCallConfig.codeBlockBackgroundColor ?? "var(--persona-container, #f3f4f6)";
  pre.style.borderColor =
    toolCallConfig.codeBlockBorderColor ?? "var(--persona-border, #e5e7eb)";
  pre.style.color = toolCallConfig.codeBlockTextColor ?? "var(--persona-text, #171717)";
};

const getToolSummaryText = (
  message: AgentWidgetMessage,
  config?: AgentWidgetConfig
): { summary: string; previewText: string; isActive: boolean } => {
  const tool = message.toolCall;
  const toolDisplayConfig = config?.features?.toolCallDisplay;
  const collapsedMode = toolDisplayConfig?.collapsedMode ?? DEFAULT_TOOL_CALL_DISPLAY.collapsedMode;
  const previewText = tool?.success === false
    ? tool.error || "Tool failed"
    : getToolPreviewText(
        message,
        toolDisplayConfig?.previewMaxLines ?? DEFAULT_TOOL_CALL_DISPLAY.previewMaxLines
      );
  const defaultSummary = tool ? (activityVariant(config, "tool") === "row" ? `${tool.status === "complete" ? "Used" : "Using"} ${tool.name?.trim() || "tool"}` : describeToolTitle(tool)) : "";

  if (!tool) {
    return { summary: defaultSummary, previewText, isActive: false };
  }

  const isActive = tool.status !== "complete";
  const toolCallConfig = config?.toolCall ?? {};
  let summary = defaultSummary;
  if (collapsedMode === "tool-name") {
    summary = tool.name?.trim() || defaultSummary;
  } else if (collapsedMode === "tool-preview" && previewText) {
    summary = previewText;
  }

  // Apply text templates if configured
  if (isActive && toolCallConfig.activeTextTemplate) {
    summary = resolveToolHeaderText(tool, toolCallConfig.activeTextTemplate, summary);
  } else if (!isActive && toolCallConfig.completeTextTemplate) {
    summary = resolveToolHeaderText(tool, toolCallConfig.completeTextTemplate, summary);
  }

  if (tool.success === false) summary += " · Failed";
  else if (tool.superseded) summary += " · Approved, ran again below";
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
    previewKind: "tool",
    iconColor: toolChevronColor(config?.toolCall ?? {}, bubble.classList.contains("persona-activity-row")),
  });
};

export const createToolBubble = (
  message: AgentWidgetMessage,
  config?: AgentWidgetConfig,
  expansionState = new Set<string>()
): HTMLElement => {
  config = activityDisplay(config, "tool");
  const tool = message.toolCall;
  const toolCallConfig = config?.toolCall ?? {};

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

  const toolDisplayConfig = config?.features?.toolCallDisplay ?? {};
  const expandable = toolDisplayConfig.expandable ?? DEFAULT_TOOL_CALL_DISPLAY.expandable;
  const expanded = expandable && expansionState.has(message.id);
  const { summary, previewText, isActive } = getToolSummaryText(message, config);

  const header = createExpandableHeader({ expandable, expanded, bubbleType: "tool" });

  // Apply header styles
  if (toolCallConfig.headerBackgroundColor) {
    header.style.backgroundColor = toolCallConfig.headerBackgroundColor;
  }
  if (toolCallConfig.headerPaddingX) {
    header.style.paddingLeft = toolCallConfig.headerPaddingX;
    header.style.paddingRight = toolCallConfig.headerPaddingX;
  }
  if (toolCallConfig.headerPaddingY) {
    header.style.paddingTop = toolCallConfig.headerPaddingY;
    header.style.paddingBottom = toolCallConfig.headerPaddingY;
  }

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
    span.setAttribute("data-tool-elapsed", startedAt);
    span.textContent = computeToolElapsed(tool);
    return span;
  };

  const customSummary = toolCallConfig.renderCollapsedSummary?.({
    message,
    toolCall: tool,
    defaultSummary: summary,
    previewText,
    collapsedMode: toolDisplayConfig.collapsedMode ?? DEFAULT_TOOL_CALL_DISPLAY.collapsedMode,
    isActive,
    config: config ?? {},
    elapsed: computeToolElapsed(tool),
    createElapsedElement: createElapsedSpan,
  });
  if (typeof customSummary === "string" && customSummary.trim()) {
    title.textContent = customSummary;
    headerContent.appendChild(title);
  } else if (customSummary instanceof HTMLElement) {
    headerContent.appendChild(customSummary);
  } else {
    title.textContent = summary;
    headerContent.appendChild(title);
  }

  // Apply loading animation when tool is active and no custom HTMLElement was provided
  const loadingAnimation = toolDisplayConfig.loadingAnimation ?? DEFAULT_TOOL_CALL_DISPLAY.loadingAnimation;
  const activeTemplate = toolCallConfig.activeTextTemplate;
  const completeTemplate = toolCallConfig.completeTextTemplate;
  const currentTemplate = isActive ? activeTemplate : completeTemplate;
  const skipCustomElement = customSummary instanceof HTMLElement;

  /**
   * Renders a template into the title element, handling:
   * - Inline formatting markers: **bold**, *italic*, ~dim~
   * - {duration} as a live-updating elapsed span (active) or static text (complete)
   * - Character-by-character animation wrapping when `animated` is true
   */
  const renderFormattedTitle = (template: string, animated: boolean) => {
    title.textContent = "";
    const toolName = tool.name?.trim() || "tool";
    const segments = parseFormattedTemplate(template, toolName);
    let charIndex = 0;

    for (const seg of segments) {
      // Determine parent: wrap in a styled span if formatting is present
      const parent = seg.styles.length > 0
        ? (() => {
            const w = createElement("span", seg.styles.map(s => `persona-tool-text-${s}`).join(" "));
            title.appendChild(w);
            return w;
          })()
        : title;

      if (seg.isDuration && isActive) {
        // Live-updating elapsed span for active tools
        parent.appendChild(createElapsedSpan());
      } else {
        // Static text (or resolved duration for completed tools)
        const text = seg.isDuration ? computeToolElapsed(tool) : seg.text;
        if (animated) {
          charIndex = appendCharSpans(parent, text, charIndex);
        } else {
          parent.appendChild(document.createTextNode(text));
        }
      }
    }
  };

  if (!skipCustomElement) {
    if (isActive && loadingAnimation !== "none") {
      const animDuration = toolCallConfig.loadingAnimationDuration ?? 2000;
      title.setAttribute("data-preserve-animation", "true");

      if (loadingAnimation === "pulse") {
        title.classList.add("persona-tool-loading-pulse");
        title.style.setProperty("--persona-tool-anim-duration", `${animDuration}ms`);
        if (currentTemplate) {
          renderFormattedTitle(currentTemplate, false);
        }
      } else {
        // Character-by-character modes: shimmer, shimmer-color, rainbow
        title.classList.add(`persona-tool-loading-${loadingAnimation}`);
        title.style.setProperty("--persona-tool-anim-duration", `${animDuration}ms`);

        if (loadingAnimation === "shimmer-color") {
          if (toolCallConfig.loadingAnimationColor) {
            title.style.setProperty("--persona-tool-anim-color", toolCallConfig.loadingAnimationColor);
          }
          if (toolCallConfig.loadingAnimationSecondaryColor) {
            title.style.setProperty("--persona-tool-anim-secondary-color", toolCallConfig.loadingAnimationSecondaryColor);
          }
        }

        if (currentTemplate) {
          renderFormattedTitle(currentTemplate, true);
        } else {
          const text = title.textContent || summary;
          title.textContent = "";
          appendCharSpans(title, text, 0);
        }
      }
    } else if (currentTemplate) {
      // Template with formatting but no animation (or completed tool)
      renderFormattedTitle(currentTemplate, false);
    }
  }

  const iconColor = toolChevronColor(toolCallConfig, activityVariant(config, "tool") === "row");
  const toggleIcon = appendHeaderToggle(header, headerContent, {
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
        config: config ?? {},
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
  if (toolCallConfig.contentPaddingX) {
    content.style.paddingLeft = toolCallConfig.contentPaddingX;
    content.style.paddingRight = toolCallConfig.contentPaddingX;
  }
  if (toolCallConfig.contentPaddingY) {
    content.style.paddingTop = toolCallConfig.contentPaddingY;
    content.style.paddingBottom = toolCallConfig.contentPaddingY;
  }

  if (config.future?.v5Defaults === true) {
    appendToolDetails(content, message, config);
  } else {
    // Add tool name at the top of content
    if (tool.name) {
      const toolName = createElement("div", "persona-text-xs persona-text-persona-muted persona-italic");
      if (toolCallConfig.contentTextColor) {
        toolName.style.color = toolCallConfig.contentTextColor;
      } else if (toolCallConfig.headerTextColor) {
        toolName.style.color = toolCallConfig.headerTextColor;
      }
      toolName.textContent = tool.name;
      content.appendChild(toolName);
    }

    if (tool.args !== undefined) {
      const argsBlock = createElement("div", "persona-space-y-1");
      const argsLabel = createElement(
        "div",
        "persona-text-xs persona-text-persona-muted"
      );
      if (toolCallConfig.labelTextColor) {
        argsLabel.style.color = toolCallConfig.labelTextColor;
      }
      argsLabel.textContent = "Arguments";
      const argsPre = createElement(
        "pre",
        "persona-max-h-48 persona-overflow-auto persona-whitespace-pre-wrap persona-rounded-lg persona-border persona-px-3 persona-py-2 persona-text-xs"
      );
      // Ensure font size matches header text (0.75rem / 12px)
      argsPre.style.fontSize = "0.75rem";
      argsPre.style.lineHeight = "1rem";
      applyToolCodeBlockColors(argsPre, toolCallConfig);
      argsPre.textContent = formatUnknownValue(tool.args);
      argsBlock.append(argsLabel, argsPre);
      content.appendChild(argsBlock);
    }

    if (tool.chunks && tool.chunks.length) {
      const logsBlock = createElement("div", "persona-space-y-1");
      const logsLabel = createElement(
        "div",
        "persona-text-xs persona-text-persona-muted"
      );
      if (toolCallConfig.labelTextColor) {
        logsLabel.style.color = toolCallConfig.labelTextColor;
      }
      logsLabel.textContent = "Activity";
      const logsPre = createElement(
        "pre",
        "persona-max-h-48 persona-overflow-auto persona-whitespace-pre-wrap persona-rounded-lg persona-border persona-px-3 persona-py-2 persona-text-xs"
      );
      // Ensure font size matches header text (0.75rem / 12px)
      logsPre.style.fontSize = "0.75rem";
      logsPre.style.lineHeight = "1rem";
      applyToolCodeBlockColors(logsPre, toolCallConfig);
      logsPre.textContent = tool.chunks.join("");
      logsBlock.append(logsLabel, logsPre);
      content.appendChild(logsBlock);
    }

    if (tool.success === false) {
      content.appendChild(createNode("div", {
        className: "persona-text-sm persona-whitespace-pre-wrap",
        text: tool.error || "Tool failed",
        attrs: { "data-persona-tool-error": "" },
      }));
    }

    if (tool.status === "complete" && tool.result !== undefined) {
      const resultBlock = createElement("div", "persona-space-y-1");
      const resultLabel = createElement(
        "div",
        "persona-text-xs persona-text-persona-muted"
      );
      if (toolCallConfig.labelTextColor) {
        resultLabel.style.color = toolCallConfig.labelTextColor;
      }
      resultLabel.textContent = "Result";
      const resultPre = createElement(
        "pre",
        "persona-max-h-48 persona-overflow-auto persona-whitespace-pre-wrap persona-rounded-lg persona-border persona-px-3 persona-py-2 persona-text-xs"
      );
      // Ensure font size matches header text (0.75rem / 12px)
      resultPre.style.fontSize = "0.75rem";
      resultPre.style.lineHeight = "1rem";
      applyToolCodeBlockColors(resultPre, toolCallConfig);
      resultPre.textContent = formatUnknownValue(tool.result);
      resultBlock.append(resultLabel, resultPre);
      content.appendChild(resultBlock);
    }

    if (tool.status === "complete" && typeof tool.duration === "number") {
      const duration = createElement(
        "div",
        "persona-text-xs persona-text-persona-muted"
      );
      if (toolCallConfig.contentTextColor) {
        duration.style.color = toolCallConfig.contentTextColor;
      }
      duration.textContent = `Duration: ${tool.duration}ms`;
      content.appendChild(duration);
    }

  }

  applyExpansionDisplay({ expanded, header, toggleIcon, content, collapsedPreview, iconColor });

  bubble.append(header, collapsedPreview, content);
  return applyActivityRow(bubble, message, config, "tool");
};
