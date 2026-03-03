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
  const content = bubble.querySelector('.persona-border-t') as HTMLElement;
  
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
};

export const createReasoningBubble = (message: AgentWidgetMessage): HTMLElement => {
  const reasoning = message.reasoning;
  const bubble = createElement(
    "div",
    [
      "vanilla-message-bubble",
      "vanilla-reasoning-bubble",
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

  let expanded = reasoningExpansionState.has(message.id);
  const header = createElement(
    "button",
    "persona-flex persona-w-full persona-items-center persona-justify-between persona-gap-3 persona-bg-transparent persona-px-4 persona-py-3 persona-text-left persona-cursor-pointer persona-border-none"
  ) as HTMLButtonElement;
  header.type = "button";
  header.setAttribute("aria-expanded", expanded ? "true" : "false");
  header.setAttribute("data-expand-header", "true");
  header.setAttribute("data-bubble-type", "reasoning");

  const headerContent = createElement("div", "persona-flex persona-flex-col persona-text-left");
  const title = createElement("span", "persona-text-xs persona-text-persona-primary");
  title.textContent = "Thinking...";
  headerContent.appendChild(title);

  const status = createElement("span", "persona-text-xs persona-text-persona-primary");
  status.textContent = describeReasonStatus(reasoning);
  headerContent.appendChild(status);

  if (reasoning.status === "complete") {
    title.style.display = "none";
  } else {
    title.style.display = "";
  }

  const toggleIcon = createElement("div", "persona-flex persona-items-center");
  const iconColor = "currentColor";
  const chevronIcon = renderLucideIcon(expanded ? "chevron-up" : "chevron-down", 16, iconColor, 2);
  if (chevronIcon) {
    toggleIcon.appendChild(chevronIcon);
  } else {
    // Fallback to text if icon fails
    toggleIcon.textContent = expanded ? "Hide" : "Show";
  }

  const headerMeta = createElement("div", "persona-flex persona-items-center persona-ml-auto");
  headerMeta.append(toggleIcon);

  header.append(headerContent, headerMeta);

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



