import { createElement } from "../utils/dom";
import { AgentWidgetMessage, AgentWidgetConfig } from "../types";
import { formatUnknownValue, describeToolTitle } from "../utils/formatting";
import { renderLucideIcon } from "../utils/icons";

// Expansion state per widget instance
export const toolExpansionState = new Set<string>();

// Helper function to update tool bubble UI after expansion state changes
export const updateToolBubbleUI = (messageId: string, bubble: HTMLElement, config?: AgentWidgetConfig): void => {
  const expanded = toolExpansionState.has(messageId);
  const toolCallConfig = config?.toolCall ?? {};
  const header = bubble.querySelector('button[data-expand-header="true"]') as HTMLElement;
  const content = bubble.querySelector('.tvw-border-t') as HTMLElement;
  
  if (!header || !content) return;
  
  header.setAttribute("aria-expanded", expanded ? "true" : "false");
  
  // Find toggle icon container - it's the direct child div of headerMeta (which has tvw-ml-auto)
  const headerMeta = header.querySelector('.tvw-ml-auto') as HTMLElement;
  const toggleIcon = headerMeta?.querySelector(':scope > .tvw-flex.tvw-items-center') as HTMLElement;
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
};

export const createToolBubble = (message: AgentWidgetMessage, config?: AgentWidgetConfig): HTMLElement => {
  const tool = message.toolCall;
  const toolCallConfig = config?.toolCall ?? {};
  
  const bubble = createElement(
    "div",
    [
      "vanilla-message-bubble",
      "vanilla-tool-bubble",
      "tvw-w-full",
      "tvw-max-w-[85%]",
      "tvw-rounded-2xl",
      "tvw-bg-cw-surface",
      "tvw-border",
      "tvw-border-cw-message-border",
      "tvw-text-cw-primary",
      "tvw-shadow-sm",
      "tvw-overflow-hidden",
      "tvw-px-0",
      "tvw-py-0"
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
  const header = createElement(
    "button",
    "tvw-flex tvw-w-full tvw-items-center tvw-justify-between tvw-gap-3 tvw-bg-transparent tvw-px-4 tvw-py-3 tvw-text-left tvw-cursor-pointer tvw-border-none"
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

  const headerContent = createElement("div", "tvw-flex tvw-flex-col tvw-text-left");
  const title = createElement("span", "tvw-text-xs tvw-text-cw-primary");
  if (toolCallConfig.headerTextColor) {
    title.style.color = toolCallConfig.headerTextColor;
  }
  title.textContent = describeToolTitle(tool);
  headerContent.appendChild(title);

  const toggleIcon = createElement("div", "tvw-flex tvw-items-center");
  const iconColor = toolCallConfig.toggleTextColor || toolCallConfig.headerTextColor || "currentColor";
  const chevronIcon = renderLucideIcon(expanded ? "chevron-up" : "chevron-down", 16, iconColor, 2);
  if (chevronIcon) {
    toggleIcon.appendChild(chevronIcon);
  } else {
    // Fallback to text if icon fails
    toggleIcon.textContent = expanded ? "Hide" : "Show";
  }

  const headerMeta = createElement("div", "tvw-flex tvw-items-center tvw-gap-2 tvw-ml-auto");
  headerMeta.append(toggleIcon);

  header.append(headerContent, headerMeta);

  const content = createElement(
    "div",
    "tvw-border-t tvw-border-gray-200 tvw-bg-gray-50 tvw-space-y-3 tvw-px-4 tvw-py-3"
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
    const toolName = createElement("div", "tvw-text-xs tvw-text-cw-muted tvw-italic");
    if (toolCallConfig.contentTextColor) {
      toolName.style.color = toolCallConfig.contentTextColor;
    } else if (toolCallConfig.headerTextColor) {
      toolName.style.color = toolCallConfig.headerTextColor;
    }
    toolName.textContent = tool.name;
    content.appendChild(toolName);
  }

  if (tool.args !== undefined) {
    const argsBlock = createElement("div", "tvw-space-y-1");
    const argsLabel = createElement(
      "div",
      "tvw-text-xs tvw-text-cw-muted"
    );
    if (toolCallConfig.labelTextColor) {
      argsLabel.style.color = toolCallConfig.labelTextColor;
    }
    argsLabel.textContent = "Arguments";
    const argsPre = createElement(
      "pre",
      "tvw-max-h-48 tvw-overflow-auto tvw-whitespace-pre-wrap tvw-rounded-lg tvw-border tvw-border-gray-100 tvw-bg-white tvw-px-3 tvw-py-2 tvw-text-xs tvw-text-cw-primary"
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
    const logsBlock = createElement("div", "tvw-space-y-1");
    const logsLabel = createElement(
      "div",
      "tvw-text-xs tvw-text-cw-muted"
    );
    if (toolCallConfig.labelTextColor) {
      logsLabel.style.color = toolCallConfig.labelTextColor;
    }
    logsLabel.textContent = "Activity";
    const logsPre = createElement(
      "pre",
      "tvw-max-h-48 tvw-overflow-auto tvw-whitespace-pre-wrap tvw-rounded-lg tvw-border tvw-border-gray-100 tvw-bg-white tvw-px-3 tvw-py-2 tvw-text-xs tvw-text-cw-primary"
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
    logsPre.textContent = tool.chunks.join("\n");
    logsBlock.append(logsLabel, logsPre);
    content.appendChild(logsBlock);
  }

  if (tool.status === "complete" && tool.result !== undefined) {
    const resultBlock = createElement("div", "tvw-space-y-1");
    const resultLabel = createElement(
      "div",
      "tvw-text-xs tvw-text-cw-muted"
    );
    if (toolCallConfig.labelTextColor) {
      resultLabel.style.color = toolCallConfig.labelTextColor;
    }
    resultLabel.textContent = "Result";
    const resultPre = createElement(
      "pre",
      "tvw-max-h-48 tvw-overflow-auto tvw-whitespace-pre-wrap tvw-rounded-lg tvw-border tvw-border-gray-100 tvw-bg-white tvw-px-3 tvw-py-2 tvw-text-xs tvw-text-cw-primary"
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
      "tvw-text-xs tvw-text-cw-muted"
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
  };

  applyToolExpansion();

  bubble.append(header, content);
  return bubble;
};



