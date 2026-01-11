import { createElement } from "../utils/dom";
import { AgentWidgetMessage } from "../types";
import { describeReasonStatus } from "../utils/formatting";
import { renderLucideIcon } from "../utils/icons";

// Expansion state per widget instance
export const reasoningExpansionState = new Set<string>();

// Helper function to update reasoning bubble UI after expansion state changes
export const updateReasoningBubbleUI = (messageId: string, bubble: HTMLElement): void => {
  const expanded = reasoningExpansionState.has(messageId);
  const header = bubble.querySelector('button[data-expand-header="true"]') as HTMLElement;
  const content = bubble.querySelector('.tvw-border-t') as HTMLElement;
  
  if (!header || !content) return;
  
  header.setAttribute("aria-expanded", expanded ? "true" : "false");
  
  // Find toggle icon container - it's the direct child div of headerMeta (which has tvw-ml-auto)
  const headerMeta = header.querySelector('.tvw-ml-auto') as HTMLElement;
  const toggleIcon = headerMeta?.querySelector(':scope > .tvw-flex.tvw-items-center') as HTMLElement;
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
};

export const createReasoningBubble = (message: AgentWidgetMessage): HTMLElement => {
  const reasoning = message.reasoning;
  const bubble = createElement(
    "div",
    [
      "vanilla-message-bubble",
      "vanilla-reasoning-bubble",
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

  if (!reasoning) {
    return bubble;
  }

  let expanded = reasoningExpansionState.has(message.id);
  const header = createElement(
    "button",
    "tvw-flex tvw-w-full tvw-items-center tvw-justify-between tvw-gap-3 tvw-bg-transparent tvw-px-4 tvw-py-3 tvw-text-left tvw-cursor-pointer tvw-border-none"
  ) as HTMLButtonElement;
  header.type = "button";
  header.setAttribute("aria-expanded", expanded ? "true" : "false");
  header.setAttribute("data-expand-header", "true");
  header.setAttribute("data-bubble-type", "reasoning");

  const headerContent = createElement("div", "tvw-flex tvw-flex-col tvw-text-left");
  const title = createElement("span", "tvw-text-xs tvw-text-cw-primary");
  title.textContent = "Thinking...";
  headerContent.appendChild(title);

  const status = createElement("span", "tvw-text-xs tvw-text-cw-primary");
  status.textContent = describeReasonStatus(reasoning);
  headerContent.appendChild(status);

  if (reasoning.status === "complete") {
    title.style.display = "none";
  } else {
    title.style.display = "";
  }

  const toggleIcon = createElement("div", "tvw-flex tvw-items-center");
  const iconColor = "currentColor";
  const chevronIcon = renderLucideIcon(expanded ? "chevron-up" : "chevron-down", 16, iconColor, 2);
  if (chevronIcon) {
    toggleIcon.appendChild(chevronIcon);
  } else {
    // Fallback to text if icon fails
    toggleIcon.textContent = expanded ? "Hide" : "Show";
  }

  const headerMeta = createElement("div", "tvw-flex tvw-items-center tvw-ml-auto");
  headerMeta.append(toggleIcon);

  header.append(headerContent, headerMeta);

  const content = createElement(
    "div",
    "tvw-border-t tvw-border-gray-200 tvw-bg-gray-50 tvw-px-4 tvw-py-3"
  );
  content.style.display = expanded ? "" : "none";

  const text = reasoning.chunks.join("");
  const body = createElement(
    "div",
    "tvw-whitespace-pre-wrap tvw-text-xs tvw-leading-snug tvw-text-cw-muted"
  );
  body.textContent =
    text ||
    (reasoning.status === "complete"
      ? "No additional context was shared."
      : "Waiting for details…");
  content.appendChild(body);

  const applyExpansionState = () => {
    header.setAttribute("aria-expanded", expanded ? "true" : "false");
    // Update chevron icon
    toggleIcon.innerHTML = "";
    const iconColor = "currentColor";
    const chevronIcon = renderLucideIcon(expanded ? "chevron-up" : "chevron-down", 16, iconColor, 2);
    if (chevronIcon) {
      toggleIcon.appendChild(chevronIcon);
    } else {
      // Fallback to text if icon fails
      toggleIcon.textContent = expanded ? "Hide" : "Show";
    }
    content.style.display = expanded ? "" : "none";
  };

  applyExpansionState();

  bubble.append(header, content);
  return bubble;
};



