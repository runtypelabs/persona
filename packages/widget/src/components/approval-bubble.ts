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
      statusBadge.className = "tvw-inline-flex tvw-items-center tvw-px-2 tvw-py-0.5 tvw-rounded-full tvw-text-xs tvw-font-medium tvw-approval-badge-approved";
    } else if (approval.status === "denied") {
      statusBadge.className = "tvw-inline-flex tvw-items-center tvw-px-2 tvw-py-0.5 tvw-rounded-full tvw-text-xs tvw-font-medium tvw-approval-badge-denied";
    } else if (approval.status === "timeout") {
      statusBadge.className = "tvw-inline-flex tvw-items-center tvw-px-2 tvw-py-0.5 tvw-rounded-full tvw-text-xs tvw-font-medium tvw-approval-badge-timeout";
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
    const iconColor = approval.status === "approved" ? "#16a34a"
      : approval.status === "denied" ? "#dc2626"
      : approval.status === "timeout" ? "#ca8a04"
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
      "vanilla-message-bubble",
      "vanilla-approval-bubble",
      "tvw-w-full",
      "tvw-max-w-[85%]",
      "tvw-rounded-2xl",
      "tvw-border",
      "tvw-shadow-sm",
      "tvw-overflow-hidden",
    ].join(" ")
  );

  // Set id for idiomorph matching
  bubble.id = `bubble-${message.id}`;
  bubble.setAttribute("data-message-id", message.id);

  // Apply styling — only set inline styles when config overrides exist (CSS defaults handle the rest)
  if (approvalConfig?.backgroundColor) {
    bubble.style.backgroundColor = approvalConfig.backgroundColor;
  }
  if (approvalConfig?.borderColor) {
    bubble.style.borderColor = approvalConfig.borderColor;
  }

  if (!approval) {
    return bubble;
  }

  // Header section with icon, title, and status badge
  const header = createElement(
    "div",
    "tvw-flex tvw-items-start tvw-gap-3 tvw-px-4 tvw-py-3"
  );

  // Icon container
  const iconContainer = createElement("div", "tvw-flex-shrink-0 tvw-mt-0.5");
  iconContainer.setAttribute("data-approval-icon", "true");
  const iconName = approval.status === "denied" ? "shield-x"
    : approval.status === "timeout" ? "shield-alert"
    : "shield-check";
  const iconColor = approval.status === "approved" ? "#16a34a"
    : approval.status === "denied" ? "#dc2626"
    : approval.status === "timeout" ? "#ca8a04"
    : (approvalConfig?.titleColor ?? "currentColor");
  const icon = renderLucideIcon(iconName, 20, iconColor, 2);
  if (icon) {
    iconContainer.appendChild(icon);
  }

  // Content area
  const content = createElement("div", "tvw-flex-1 tvw-min-w-0");

  // Title row with status badge
  const titleRow = createElement("div", "tvw-flex tvw-items-center tvw-gap-2");
  const title = createElement("span", "tvw-text-sm tvw-font-medium tvw-text-cw-primary");
  if (approvalConfig?.titleColor) {
    title.style.color = approvalConfig.titleColor;
  }
  title.textContent = approvalConfig?.title ?? "Approval Required";
  titleRow.appendChild(title);

  // Status badge (shown when resolved)
  if (!isPending) {
    const badge = createElement("span", "tvw-inline-flex tvw-items-center tvw-px-2 tvw-py-0.5 tvw-rounded-full tvw-text-xs tvw-font-medium");
    badge.setAttribute("data-approval-status", approval.status);
    if (approval.status === "approved") {
      badge.className += " tvw-approval-badge-approved";
      badge.textContent = "Approved";
    } else if (approval.status === "denied") {
      badge.className += " tvw-approval-badge-denied";
      badge.textContent = "Denied";
    } else if (approval.status === "timeout") {
      badge.className += " tvw-approval-badge-timeout";
      badge.textContent = "Timeout";
    }
    titleRow.appendChild(badge);
  }

  content.appendChild(titleRow);

  // Description
  const description = createElement("p", "tvw-text-sm tvw-mt-0.5 tvw-text-cw-muted");
  if (approvalConfig?.descriptionColor) {
    description.style.color = approvalConfig.descriptionColor;
  }
  description.textContent = approval.description;
  content.appendChild(description);

  // Parameters block
  if (approval.parameters) {
    const paramsPre = createElement(
      "pre",
      "tvw-mt-2 tvw-text-xs tvw-p-2 tvw-rounded tvw-overflow-x-auto tvw-max-h-32 tvw-bg-cw-container tvw-text-cw-primary"
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
    const buttonsContainer = createElement("div", "tvw-flex tvw-gap-2 tvw-mt-2");
    buttonsContainer.setAttribute("data-approval-buttons", "true");

    // Approve button
    const approveBtn = createElement("button", "tvw-inline-flex tvw-items-center tvw-px-3 tvw-py-1.5 tvw-rounded-md tvw-text-xs tvw-font-medium tvw-border-none tvw-cursor-pointer") as HTMLButtonElement;
    approveBtn.type = "button";
    approveBtn.style.backgroundColor = approvalConfig?.approveButtonColor ?? "#16a34a";
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
    const denyBtn = createElement("button", "tvw-inline-flex tvw-items-center tvw-px-3 tvw-py-1.5 tvw-rounded-md tvw-text-xs tvw-font-medium tvw-cursor-pointer") as HTMLButtonElement;
    denyBtn.type = "button";
    denyBtn.style.backgroundColor = approvalConfig?.denyButtonColor ?? "transparent";
    denyBtn.style.color = approvalConfig?.denyButtonTextColor ?? "#dc2626";
    denyBtn.style.border = `1px solid ${approvalConfig?.denyButtonTextColor ?? "#fca5a5"}`;
    denyBtn.setAttribute("data-approval-action", "deny");
    const denyIcon = renderLucideIcon("shield-x", 14, approvalConfig?.denyButtonTextColor ?? "#dc2626", 2);
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
