import { createElement } from "../utils/dom";
import { AgentWidgetConfig, AgentWidgetMessage } from "../types";
import { describeReasonStatus } from "../utils/formatting";
import { renderLucideIcon } from "../utils/icons";

// Expansion state per widget instance
export const reasoningExpansionState = new Set<string>();

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

const getReasoningPreviewText = (message: AgentWidgetMessage, maxLines: number): string => {
  const text = message.reasoning?.chunks.join("").trim() ?? "";
  if (!text) return "";
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .join("\n");
};

// Helper function to update reasoning bubble UI after expansion state changes
export const updateReasoningBubbleUI = (messageId: string, bubble: HTMLElement): void => {
  const expanded = reasoningExpansionState.has(messageId);
  const header = bubble.querySelector('button[data-expand-header="true"]') as HTMLElement;
  const content = bubble.querySelector('.persona-border-t') as HTMLElement;
  const preview = bubble.querySelector('[data-persona-collapsed-preview="reasoning"]') as HTMLElement | null;
  
  if (!header || !content) return;
  
  header.setAttribute("aria-expanded", expanded ? "true" : "false");
  
  // Find toggle icon container - it's the direct child div of headerMeta (which has persona-ml-auto)
  const headerMeta = header.querySelector('.persona-ml-auto') as HTMLElement;
  const toggleIcon = headerMeta?.querySelector(':scope > .persona-flex.persona-items-center') as HTMLElement;
  if (toggleIcon) {
    toggleIcon.innerHTML = "";
    const iconColor = "currentColor";
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

export const createReasoningBubble = (message: AgentWidgetMessage, config?: AgentWidgetConfig): HTMLElement => {
  const reasoning = message.reasoning;
  const bubble = createElement(
    "div",
    [
      "persona-message-bubble",
      "persona-reasoning-bubble",
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

  if (!reasoning) {
    return bubble;
  }

  const reasoningDisplayConfig = config?.features?.reasoningDisplay ?? {};
  const expandable = reasoningDisplayConfig.expandable !== false;
  let expanded = expandable && reasoningExpansionState.has(message.id);
  const isActive = reasoning.status !== "complete";
  const previewText = getReasoningPreviewText(message, reasoningDisplayConfig.previewMaxLines ?? 3);
  const header = createElement(
    "button",
    expandable
      ? "persona-flex persona-w-full persona-items-center persona-justify-between persona-gap-3 persona-bg-transparent persona-px-4 persona-py-3 persona-text-left persona-cursor-pointer persona-border-none"
      : "persona-flex persona-w-full persona-items-center persona-justify-between persona-gap-3 persona-bg-transparent persona-px-4 persona-py-3 persona-text-left persona-cursor-default persona-border-none"
  ) as HTMLButtonElement;
  header.type = "button";
  if (expandable) {
    header.setAttribute("aria-expanded", expanded ? "true" : "false");
    header.setAttribute("data-expand-header", "true");
  }
  header.setAttribute("data-bubble-type", "reasoning");

  const headerContent = createElement("div", "persona-flex persona-flex-col persona-text-left");
  const title = createElement("span", "persona-text-xs persona-text-persona-primary");
  const defaultSummary = "Thinking...";
  const customSummary = config?.reasoning?.renderCollapsedSummary?.({
    message,
    reasoning,
    defaultSummary,
    previewText,
    isActive,
    config: config ?? {},
  });
  if (typeof customSummary === "string" && customSummary.trim()) {
    title.textContent = customSummary;
    headerContent.appendChild(title);
  } else if (customSummary instanceof HTMLElement) {
    headerContent.appendChild(customSummary);
  } else {
    title.textContent = defaultSummary;
    headerContent.appendChild(title);
  }

  const status = createElement("span", "persona-text-xs persona-text-persona-primary");
  status.textContent = describeReasonStatus(reasoning);
  headerContent.appendChild(status);

  if (reasoning.status === "complete") {
    title.style.display = "none";
  } else {
    title.style.display = "";
  }

  let toggleIcon: HTMLElement | null = null;
  if (expandable) {
    toggleIcon = createElement("div", "persona-flex persona-items-center");
    const iconColor = "currentColor";
    const chevronIcon = renderLucideIcon(expanded ? "chevron-up" : "chevron-down", 16, iconColor, 2);
    if (chevronIcon) {
      toggleIcon.appendChild(chevronIcon);
    } else {
      toggleIcon.textContent = expanded ? "Hide" : "Show";
    }

    const headerMeta = createElement("div", "persona-flex persona-items-center persona-ml-auto");
    headerMeta.append(toggleIcon);
    header.append(headerContent, headerMeta);
  } else {
    header.append(headerContent);
  }

  const collapsedPreview = createElement(
    "div",
    "persona-px-4 persona-py-3 persona-text-xs persona-leading-snug persona-text-persona-muted"
  );
  collapsedPreview.setAttribute("data-persona-collapsed-preview", "reasoning");
  collapsedPreview.style.display = "none";
  collapsedPreview.style.whiteSpace = "pre-wrap";

  if (!expanded && isActive && reasoningDisplayConfig.activePreview && previewText) {
    const renderedPreview = config?.reasoning?.renderCollapsedPreview?.({
      message,
      reasoning,
      defaultPreview: previewText,
      isActive,
      config: config ?? {},
    });
    if (!appendRenderedValue(collapsedPreview, renderedPreview)) {
      collapsedPreview.textContent = previewText;
    }
    collapsedPreview.style.display = "";
  }

  if (!expanded && isActive && reasoningDisplayConfig.activeMinHeight) {
    bubble.style.minHeight = reasoningDisplayConfig.activeMinHeight;
  }

  if (!expandable) {
    bubble.append(header, collapsedPreview);
    return bubble;
  }

  const content = createElement(
    "div",
    "persona-border-t persona-border-gray-200 persona-bg-gray-50 persona-px-4 persona-py-3"
  );
  content.style.display = expanded ? "" : "none";

  const text = reasoning.chunks.join("");
  const body = createElement(
    "div",
    "persona-whitespace-pre-wrap persona-text-xs persona-leading-snug persona-text-persona-muted"
  );
  body.textContent =
    text ||
    (reasoning.status === "complete"
      ? "No additional context was shared."
      : "Waiting for details…");
  content.appendChild(body);

  const applyExpansionState = () => {
    header.setAttribute("aria-expanded", expanded ? "true" : "false");
    if (toggleIcon) {
      toggleIcon.innerHTML = "";
      const iconColor = "currentColor";
      const chevronIcon = renderLucideIcon(expanded ? "chevron-up" : "chevron-down", 16, iconColor, 2);
      if (chevronIcon) {
        toggleIcon.appendChild(chevronIcon);
      } else {
        toggleIcon.textContent = expanded ? "Hide" : "Show";
      }
    }
    content.style.display = expanded ? "" : "none";
    collapsedPreview.style.display = expanded ? "none" : ((collapsedPreview.textContent || collapsedPreview.childNodes.length) ? "" : "none");
  };

  applyExpansionState();

  bubble.append(header, collapsedPreview, content);
  return bubble;
};



