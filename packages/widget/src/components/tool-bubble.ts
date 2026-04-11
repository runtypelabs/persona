import { createElement } from "../utils/dom";
import { AgentWidgetMessage, AgentWidgetConfig } from "../types";
import { formatUnknownValue, describeToolTitle } from "../utils/formatting";
import { renderLucideIcon } from "../utils/icons";

// Expansion state per widget instance
export const toolExpansionState = new Set<string>();

const appendRenderedValue = (
  container: HTMLElement,
  value: HTMLElement | string | null | undefined
): boolean => {
  if (value == null) return false;
  if (typeof value === "string") {
    container.textContent = value;
    return true;
  }
  container.appendChild(value);
  return true;
};

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

const getToolSummaryText = (
  message: AgentWidgetMessage,
  config?: AgentWidgetConfig
): { summary: string; previewText: string; isActive: boolean } => {
  const tool = message.toolCall;
  const toolDisplayConfig = config?.features?.toolCallDisplay;
  const collapsedMode = toolDisplayConfig?.collapsedMode ?? "tool-call";
  const previewText = getToolPreviewText(message, toolDisplayConfig?.previewMaxLines ?? 3);
  const defaultSummary = tool ? describeToolTitle(tool) : "";

  if (!tool) {
    return { summary: defaultSummary, previewText, isActive: false };
  }

  const isActive = tool.status !== "complete";
  let summary = defaultSummary;
  if (collapsedMode === "tool-name") {
    summary = tool.name?.trim() || defaultSummary;
  } else if (collapsedMode === "tool-preview" && previewText) {
    summary = previewText;
  }

  return { summary, previewText, isActive };
};

// Helper function to update tool bubble UI after expansion state changes
export const updateToolBubbleUI = (messageId: string, bubble: HTMLElement, config?: AgentWidgetConfig): void => {
  const expanded = toolExpansionState.has(messageId);
  const toolCallConfig = config?.toolCall ?? {};
  const header = bubble.querySelector('button[data-expand-header="true"]') as HTMLElement;
  const content = bubble.querySelector('.persona-border-t') as HTMLElement;
  const preview = bubble.querySelector('[data-persona-collapsed-preview="tool"]') as HTMLElement | null;
  
  if (!header || !content) return;
  
  header.setAttribute("aria-expanded", expanded ? "true" : "false");
  
  // Find toggle icon container - it's the direct child div of headerMeta (which has persona-ml-auto)
  const headerMeta = header.querySelector('.persona-ml-auto') as HTMLElement;
  const toggleIcon = headerMeta?.querySelector(':scope > .persona-flex.persona-items-center') as HTMLElement;
  if (toggleIcon) {
    toggleIcon.innerHTML = "";
    const iconColor = toolCallConfig.toggleTextColor || toolCallConfig.headerTextColor || "currentColor";
    const chevronIcon = renderLucideIcon(expanded ? "chevron-up" : "chevron-down", 16, iconColor, 2);
    if (chevronIcon) {
      toggleIcon.appendChild(chevronIcon);
    } else {
      toggleIcon.textContent = expanded ? "Hide" : "Show";
    }
  }
  
  content.style.display = expanded ? "" : "none";
  if (preview) {
    preview.style.display = expanded
      ? "none"
      : ((preview.textContent || preview.childNodes.length) ? "" : "none");
  }
};

export const createToolBubble = (message: AgentWidgetMessage, config?: AgentWidgetConfig): HTMLElement => {
  const tool = message.toolCall;
  const toolCallConfig = config?.toolCall ?? {};
  
  const bubble = createElement(
    "div",
    [
      "persona-message-bubble",
      "persona-tool-bubble",
      "persona-w-full",
      "persona-max-w-[85%]",
      "persona-rounded-2xl",
      "persona-bg-persona-surface",
      "persona-border",
      "persona-border-persona-message-border",
      "persona-text-persona-primary",
      "persona-shadow-sm",
      "persona-overflow-hidden",
      "persona-px-0",
      "persona-py-0"
    ].join(" ")
  );
  // Set id for idiomorph matching
  bubble.id = `bubble-${message.id}`;
  bubble.setAttribute("data-message-id", message.id);

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

  if (!tool) {
    return bubble;
  }

  let expanded = toolExpansionState.has(message.id);
  const toolDisplayConfig = config?.features?.toolCallDisplay ?? {};
  const { summary, previewText, isActive } = getToolSummaryText(message, config);
  const header = createElement(
    "button",
    "persona-flex persona-w-full persona-items-center persona-justify-between persona-gap-3 persona-bg-transparent persona-px-4 persona-py-3 persona-text-left persona-cursor-pointer persona-border-none"
  ) as HTMLButtonElement;
  header.type = "button";
  header.setAttribute("aria-expanded", expanded ? "true" : "false");
  header.setAttribute("data-expand-header", "true");
  header.setAttribute("data-bubble-type", "tool");

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
  const customSummary = toolCallConfig.renderCollapsedSummary?.({
    message,
    toolCall: tool,
    defaultSummary: summary,
    previewText,
    collapsedMode: toolDisplayConfig.collapsedMode ?? "tool-call",
    isActive,
    config: config ?? {},
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

  const toggleIcon = createElement("div", "persona-flex persona-items-center");
  const iconColor = toolCallConfig.toggleTextColor || toolCallConfig.headerTextColor || "currentColor";
  const chevronIcon = renderLucideIcon(expanded ? "chevron-up" : "chevron-down", 16, iconColor, 2);
  if (chevronIcon) {
    toggleIcon.appendChild(chevronIcon);
  } else {
    // Fallback to text if icon fails
    toggleIcon.textContent = expanded ? "Hide" : "Show";
  }

  const headerMeta = createElement("div", "persona-flex persona-items-center persona-gap-2 persona-ml-auto");
  headerMeta.append(toggleIcon);

  header.append(headerContent, headerMeta);

  const collapsedPreview = createElement(
    "div",
    "persona-px-4 persona-py-3 persona-text-xs persona-leading-snug persona-text-persona-muted"
  );
  collapsedPreview.setAttribute("data-persona-collapsed-preview", "tool");
  collapsedPreview.style.display = "none";
  collapsedPreview.style.whiteSpace = "pre-wrap";

  if (
    !expanded &&
    isActive &&
    toolDisplayConfig.activePreview &&
    previewText
  ) {
    const renderedPreview = toolCallConfig.renderCollapsedPreview?.({
      message,
      toolCall: tool,
      defaultPreview: previewText,
      isActive,
      config: config ?? {},
    });
    if (!appendRenderedValue(collapsedPreview, renderedPreview)) {
      collapsedPreview.textContent = previewText;
    }
    collapsedPreview.style.display = "";
  }

  if (!expanded && isActive && toolDisplayConfig.activeMinHeight) {
    bubble.style.minHeight = toolDisplayConfig.activeMinHeight;
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
      "persona-max-h-48 persona-overflow-auto persona-whitespace-pre-wrap persona-rounded-lg persona-border persona-border-gray-100 persona-bg-white persona-px-3 persona-py-2 persona-text-xs persona-text-persona-primary"
    );
    // Ensure font size matches header text (0.75rem / 12px)
    argsPre.style.fontSize = "0.75rem";
    argsPre.style.lineHeight = "1rem";
    if (toolCallConfig.codeBlockBackgroundColor) {
      argsPre.style.backgroundColor = toolCallConfig.codeBlockBackgroundColor;
    }
    if (toolCallConfig.codeBlockBorderColor) {
      argsPre.style.borderColor = toolCallConfig.codeBlockBorderColor;
    }
    if (toolCallConfig.codeBlockTextColor) {
      argsPre.style.color = toolCallConfig.codeBlockTextColor;
    }
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
      "persona-max-h-48 persona-overflow-auto persona-whitespace-pre-wrap persona-rounded-lg persona-border persona-border-gray-100 persona-bg-white persona-px-3 persona-py-2 persona-text-xs persona-text-persona-primary"
    );
    // Ensure font size matches header text (0.75rem / 12px)
    logsPre.style.fontSize = "0.75rem";
    logsPre.style.lineHeight = "1rem";
    if (toolCallConfig.codeBlockBackgroundColor) {
      logsPre.style.backgroundColor = toolCallConfig.codeBlockBackgroundColor;
    }
    if (toolCallConfig.codeBlockBorderColor) {
      logsPre.style.borderColor = toolCallConfig.codeBlockBorderColor;
    }
    if (toolCallConfig.codeBlockTextColor) {
      logsPre.style.color = toolCallConfig.codeBlockTextColor;
    }
    logsPre.textContent = tool.chunks.join("");
    logsBlock.append(logsLabel, logsPre);
    content.appendChild(logsBlock);
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
      "persona-max-h-48 persona-overflow-auto persona-whitespace-pre-wrap persona-rounded-lg persona-border persona-border-gray-100 persona-bg-white persona-px-3 persona-py-2 persona-text-xs persona-text-persona-primary"
    );
    // Ensure font size matches header text (0.75rem / 12px)
    resultPre.style.fontSize = "0.75rem";
    resultPre.style.lineHeight = "1rem";
    if (toolCallConfig.codeBlockBackgroundColor) {
      resultPre.style.backgroundColor = toolCallConfig.codeBlockBackgroundColor;
    }
    if (toolCallConfig.codeBlockBorderColor) {
      resultPre.style.borderColor = toolCallConfig.codeBlockBorderColor;
    }
    if (toolCallConfig.codeBlockTextColor) {
      resultPre.style.color = toolCallConfig.codeBlockTextColor;
    }
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

  const applyToolExpansion = () => {
    header.setAttribute("aria-expanded", expanded ? "true" : "false");
    // Update chevron icon
    toggleIcon.innerHTML = "";
    const iconColor = toolCallConfig.toggleTextColor || toolCallConfig.headerTextColor || "currentColor";
    const chevronIcon = renderLucideIcon(expanded ? "chevron-up" : "chevron-down", 16, iconColor, 2);
    if (chevronIcon) {
      toggleIcon.appendChild(chevronIcon);
    } else {
      // Fallback to text if icon fails
      toggleIcon.textContent = expanded ? "Hide" : "Show";
    }
    content.style.display = expanded ? "" : "none";
    collapsedPreview.style.display = expanded
      ? "none"
      : ((collapsedPreview.textContent || collapsedPreview.childNodes.length) ? "" : "none");
  };

  applyToolExpansion();

  bubble.append(header, collapsedPreview, content);
  return bubble;
};



