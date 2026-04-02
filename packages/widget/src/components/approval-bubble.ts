import { createElement } from "../utils/dom";
import { AgentWidgetMessage, AgentWidgetConfig } from "../types";
import { formatUnknownValue } from "../utils/formatting";
import { renderLucideIcon } from "../utils/icons";

/**
 * Update an existing approval bubble's UI after status changes.
 */
export const updateApprovalBubbleUI = (
  _messageId: string,
  bubble: HTMLElement,
  config?: AgentWidgetConfig,
  approval?: AgentWidgetMessage["approval"]
): void => {
  if (!approval) return;

  const approvalConfig = config?.approval !== false ? config?.approval : undefined;

  // Update status badge
  const statusBadge = bubble.querySelector('[data-approval-status]') as HTMLElement;
  if (statusBadge) {
    statusBadge.textContent = approval.status === "approved" ? "Approved"
      : approval.status === "denied" ? "Denied"
      : approval.status === "timeout" ? "Timeout"
      : "Pending";

    // Update badge color
    if (approval.status === "approved") {
      statusBadge.className = "persona-inline-flex persona-items-center persona-px-2 persona-py-0.5 persona-rounded-full persona-text-xs persona-font-medium";
      statusBadge.style.backgroundColor = "var(--persona-palette-colors-success-100, #dcfce7)";
      statusBadge.style.color = "var(--persona-palette-colors-success-700, #15803d)";
    } else if (approval.status === "denied") {
      statusBadge.className = "persona-inline-flex persona-items-center persona-px-2 persona-py-0.5 persona-rounded-full persona-text-xs persona-font-medium";
      statusBadge.style.backgroundColor = "var(--persona-palette-colors-error-100, #fee2e2)";
      statusBadge.style.color = "var(--persona-palette-colors-error-700, #b91c1c)";
    } else if (approval.status === "timeout") {
      statusBadge.className = "persona-inline-flex persona-items-center persona-px-2 persona-py-0.5 persona-rounded-full persona-text-xs persona-font-medium";
      statusBadge.style.backgroundColor = "var(--persona-palette-colors-warning-100, #fef3c7)";
      statusBadge.style.color = "var(--persona-palette-colors-warning-700, #b45309)";
    }
    statusBadge.setAttribute("data-approval-status", approval.status);
  }

  // Update icon
  const iconContainer = bubble.querySelector('[data-approval-icon]') as HTMLElement;
  if (iconContainer) {
    iconContainer.innerHTML = "";
    const iconName = approval.status === "denied" ? "shield-x"
      : approval.status === "timeout" ? "shield-alert"
      : "shield-check";
    const iconColor = approval.status === "approved" ? "var(--persona-feedback-success, #16a34a)"
      : approval.status === "denied" ? "var(--persona-feedback-error, #dc2626)"
      : approval.status === "timeout" ? "var(--persona-feedback-warning, #ca8a04)"
      : (approvalConfig?.titleColor ?? "currentColor");
    const icon = renderLucideIcon(iconName, 20, iconColor, 2);
    if (icon) {
      iconContainer.appendChild(icon);
    }
  }

  // Show/hide buttons based on status
  const buttonsContainer = bubble.querySelector('[data-approval-buttons]') as HTMLElement;
  if (buttonsContainer) {
    buttonsContainer.style.display = approval.status === "pending" ? "" : "none";
  }
};

/**
 * Create an approval bubble element for inline display in the chat.
 */
export const createApprovalBubble = (
  message: AgentWidgetMessage,
  config?: AgentWidgetConfig
): HTMLElement => {
  const approval = message.approval;
  const approvalConfig = config?.approval !== false ? config?.approval : undefined;
  const isPending = approval?.status === "pending";

  const bubble = createElement(
    "div",
    [
      "persona-approval-bubble",
      "persona-w-full",
      "persona-max-w-[85%]",
      "persona-rounded-2xl",
      "persona-border",
      "persona-shadow-sm",
      "persona-overflow-hidden",
    ].join(" ")
  );

  // Set id for idiomorph matching
  bubble.id = `bubble-${message.id}`;
  bubble.setAttribute("data-message-id", message.id);

  // Apply styling — use semantic tokens with config overrides
  bubble.style.backgroundColor = approvalConfig?.backgroundColor ?? "var(--persona-approval-bg, #fefce8)";
  bubble.style.borderColor = approvalConfig?.borderColor ?? "var(--persona-approval-border, #fef08a)";

  if (!approval) {
    return bubble;
  }

  // Header section with icon, title, and status badge
  const header = createElement(
    "div",
    "persona-flex persona-items-start persona-gap-3 persona-px-4 persona-py-3"
  );

  // Icon container
  const iconContainer = createElement("div", "persona-flex-shrink-0 persona-mt-0.5");
  iconContainer.setAttribute("data-approval-icon", "true");
  const iconName = approval.status === "denied" ? "shield-x"
    : approval.status === "timeout" ? "shield-alert"
    : "shield-check";
  const iconColor = approval.status === "approved" ? "var(--persona-feedback-success, #16a34a)"
    : approval.status === "denied" ? "var(--persona-feedback-error, #dc2626)"
    : approval.status === "timeout" ? "var(--persona-feedback-warning, #ca8a04)"
    : (approvalConfig?.titleColor ?? "currentColor");
  const icon = renderLucideIcon(iconName, 20, iconColor, 2);
  if (icon) {
    iconContainer.appendChild(icon);
  }

  // Content area
  const content = createElement("div", "persona-flex-1 persona-min-w-0");

  // Title row with status badge
  const titleRow = createElement("div", "persona-flex persona-items-center persona-gap-2");
  const title = createElement("span", "persona-text-sm persona-font-medium persona-text-persona-primary");
  if (approvalConfig?.titleColor) {
    title.style.color = approvalConfig.titleColor;
  }
  title.textContent = approvalConfig?.title ?? "Approval Required";
  titleRow.appendChild(title);

  // Status badge (shown when resolved)
  if (!isPending) {
    const badge = createElement("span", "persona-inline-flex persona-items-center persona-px-2 persona-py-0.5 persona-rounded-full persona-text-xs persona-font-medium");
    badge.setAttribute("data-approval-status", approval.status);
    if (approval.status === "approved") {
      badge.style.backgroundColor = "var(--persona-palette-colors-success-100, #dcfce7)";
      badge.style.color = "var(--persona-palette-colors-success-700, #15803d)";
      badge.textContent = "Approved";
    } else if (approval.status === "denied") {
      badge.style.backgroundColor = "var(--persona-palette-colors-error-100, #fee2e2)";
      badge.style.color = "var(--persona-palette-colors-error-700, #b91c1c)";
      badge.textContent = "Denied";
    } else if (approval.status === "timeout") {
      badge.style.backgroundColor = "var(--persona-palette-colors-warning-100, #fef3c7)";
      badge.style.color = "var(--persona-palette-colors-warning-700, #b45309)";
      badge.textContent = "Timeout";
    }
    titleRow.appendChild(badge);
  }

  content.appendChild(titleRow);

  // Description
  const description = createElement("p", "persona-text-sm persona-mt-0.5 persona-text-persona-muted");
  if (approvalConfig?.descriptionColor) {
    description.style.color = approvalConfig.descriptionColor;
  }
  description.textContent = approval.description;
  content.appendChild(description);

  // Parameters block
  if (approval.parameters) {
    const paramsPre = createElement(
      "pre",
      "persona-mt-2 persona-text-xs persona-p-2 persona-rounded persona-overflow-x-auto persona-max-h-32 persona-bg-persona-container persona-text-persona-primary"
    );
    if (approvalConfig?.parameterBackgroundColor) {
      paramsPre.style.backgroundColor = approvalConfig.parameterBackgroundColor;
    }
    if (approvalConfig?.parameterTextColor) {
      paramsPre.style.color = approvalConfig.parameterTextColor;
    }
    paramsPre.style.fontSize = "0.75rem";
    paramsPre.style.lineHeight = "1rem";
    paramsPre.textContent = formatUnknownValue(approval.parameters);
    content.appendChild(paramsPre);
  }

  // Action buttons (only shown when pending)
  if (isPending) {
    const buttonsContainer = createElement("div", "persona-flex persona-gap-2 persona-mt-2");
    buttonsContainer.setAttribute("data-approval-buttons", "true");

    // Approve button
    const approveBtn = createElement("button", "persona-inline-flex persona-items-center persona-px-3 persona-py-1.5 persona-rounded-md persona-text-xs persona-font-medium persona-border-none persona-cursor-pointer") as HTMLButtonElement;
    approveBtn.type = "button";
    approveBtn.style.backgroundColor = approvalConfig?.approveButtonColor ?? "var(--persona-approval-approve-bg, #22c55e)";
    approveBtn.style.color = approvalConfig?.approveButtonTextColor ?? "#ffffff";
    approveBtn.setAttribute("data-approval-action", "approve");
    const approveIcon = renderLucideIcon("shield-check", 14, approvalConfig?.approveButtonTextColor ?? "#ffffff", 2);
    if (approveIcon) {
      approveIcon.style.marginRight = "4px";
      approveBtn.appendChild(approveIcon);
    }
    const approveLabel = document.createTextNode(approvalConfig?.approveLabel ?? "Approve");
    approveBtn.appendChild(approveLabel);

    // Deny button
    const denyBtn = createElement("button", "persona-inline-flex persona-items-center persona-px-3 persona-py-1.5 persona-rounded-md persona-text-xs persona-font-medium persona-cursor-pointer") as HTMLButtonElement;
    denyBtn.type = "button";
    denyBtn.style.backgroundColor = approvalConfig?.denyButtonColor ?? "transparent";
    denyBtn.style.color = approvalConfig?.denyButtonTextColor ?? "var(--persona-feedback-error, #dc2626)";
    denyBtn.style.border = `1px solid ${approvalConfig?.denyButtonTextColor ? approvalConfig.denyButtonTextColor : "var(--persona-palette-colors-error-200, #fca5a5)"}`;
    denyBtn.setAttribute("data-approval-action", "deny");
    const denyIcon = renderLucideIcon("shield-x", 14, approvalConfig?.denyButtonTextColor ?? "var(--persona-feedback-error, #dc2626)", 2);
    if (denyIcon) {
      denyIcon.style.marginRight = "4px";
      denyBtn.appendChild(denyIcon);
    }
    const denyLabel = document.createTextNode(approvalConfig?.denyLabel ?? "Deny");
    denyBtn.appendChild(denyLabel);

    buttonsContainer.append(approveBtn, denyBtn);
    content.appendChild(buttonsContainer);
  }

  header.append(iconContainer, content);
  bubble.appendChild(header);

  return bubble;
};
