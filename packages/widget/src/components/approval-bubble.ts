/** @deprecated Built-in approvals use the renderApproval plugin in approval-actions. */
import { BROWSER_TOOL_INTERRUPTION } from "../utils/restored-browser-state";
import { createElement } from "../utils/dom";
import { AgentWidgetMessage, AgentWidgetConfig } from "../types";
import { formatUnknownValue } from "../utils/format-value";
import { resolveApprovalStyles } from "../utils/approval-styles";
// The webmcp-title lookup is injected by ui.ts at chunk adoption: this module
// ships in the lazy approval-ui chunk and must not read a duplicated (empty)
// webmcp title map. See approval-deps. Icons are direct lucide data imports.
import { getWebMcpToolDisplayTitle } from "./approval-deps";
import { renderApprovalIcon as renderIconNode } from "./approval-deps";
import { WEBMCP_TOOL_PREFIX } from "../webmcp-bridge";

import { humanizeToolName } from "../utils/humanize-tool-name";
/** @deprecated Import from utils/humanize-tool-name instead. */
export { humanizeToolName } from "../utils/humanize-tool-name";

const resolveApprovalConfig = (config?: AgentWidgetConfig) =>
  config?.approval !== false ? config?.approval : undefined;

const isDetailsExpanded = (
  messageId: string,
  expansionState: Map<string, boolean>,
  config?: AgentWidgetConfig
): boolean => {
  const detailsMode = resolveApprovalConfig(config)?.detailsDisplay ?? "collapsed";
  return expansionState.get(messageId) ?? detailsMode === "expanded";
};

const applyDetailsToggleState = (
  toggle: HTMLElement,
  expanded: boolean,
  config?: AgentWidgetConfig
): void => {
  const approvalConfig = resolveApprovalConfig(config);
  toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  const label = toggle.querySelector("[data-approval-details-label]") as HTMLElement | null;
  if (label) {
    label.textContent = expanded
      ? (approvalConfig?.hideDetailsLabel ?? "Hide details")
      : (approvalConfig?.showDetailsLabel ?? "Show details");
  }
  const chevronHolder = toggle.querySelector("[data-approval-details-chevron]") as HTMLElement | null;
  if (chevronHolder) {
    chevronHolder.innerHTML = "";
    const chevron = renderIconNode(expanded ? "chevron-up" : "chevron-down", 14, "currentColor", 2);
    if (chevron) {
      chevronHolder.appendChild(chevron);
    }
  }
};

/**
 * Sync the technical-details section (toggle label/chevron + visibility) with
 * the widget instance's expansion state. Called from the ui.ts expansion event
 * delegation after a toggle click.
 */
export const updateApprovalDetailsUI = (
  messageId: string,
  bubble: HTMLElement,
  config?: AgentWidgetConfig,
  expansionState = new Map<string, boolean>()
): void => {
  const toggle = bubble.querySelector('button[data-bubble-type="approval"]') as HTMLElement | null;
  const details = bubble.querySelector("[data-approval-details]") as HTMLElement | null;
  if (!toggle || !details) return;
  const expanded = isDetailsExpanded(messageId, expansionState, config);
  applyDetailsToggleState(toggle, expanded, config);
  details.style.display = expanded ? "" : "none";
};

/**
 * Update an existing approval bubble's UI after status changes.
 */
export const updateApprovalBubbleUI = (
  _messageId: string,
  bubble: HTMLElement,
  config?: AgentWidgetConfig,
  approval?: AgentWidgetMessage["approval"]
): void => {
  const styles = resolveApprovalStyles(config, "public");
  applyApprovalBubbleStyles(bubble, config);
  if (!approval) return;

  // Update status badge
  const statusBadge = bubble.querySelector('[data-approval-status]') as HTMLElement;
  if (statusBadge) {
    statusBadge.textContent = approval.status === "approved" ? "Approved"
      : approval.status === "denied" ? "Denied"
      : (approval.status === "timeout" && approval.interrupted) ? "Interrupted"
      : approval.status === "timeout" ? "Timeout"
      : "Pending";

    // Update badge color
    if (approval.status === "approved") {
      statusBadge.className = "persona-inline-flex persona-items-center persona-px-2 persona-py-0.5 persona-rounded-full persona-text-xs persona-font-medium";
      statusBadge.style.backgroundColor = "var(--persona-palette-colors-success-100)";
      statusBadge.style.color = "var(--persona-palette-colors-success-700)";
    } else if (approval.status === "denied") {
      statusBadge.className = "persona-inline-flex persona-items-center persona-px-2 persona-py-0.5 persona-rounded-full persona-text-xs persona-font-medium";
      statusBadge.style.backgroundColor = "var(--persona-palette-colors-error-100)";
      statusBadge.style.color = "var(--persona-palette-colors-error-700)";
    } else if (approval.status === "timeout") {
      statusBadge.className = "persona-inline-flex persona-items-center persona-px-2 persona-py-0.5 persona-rounded-full persona-text-xs persona-font-medium";
      statusBadge.style.backgroundColor = "var(--persona-palette-colors-warning-100)";
      statusBadge.style.color = "var(--persona-palette-colors-warning-700)";
    }
    statusBadge.setAttribute("data-approval-status", approval.status);
  }

  // Update icon
  const iconContainer = bubble.querySelector('[data-approval-icon]') as HTMLElement;
  if (iconContainer) {
    iconContainer.innerHTML = "";
    const iconData = approval.status === "denied" ? "shield-x"
      : approval.status === "timeout" ? "shield-alert"
      : "shield-check";
    const iconColor = approval.status === "approved" ? "var(--persona-feedback-success, var(--persona-palette-colors-success-600))"
      : approval.status === "denied" ? "var(--persona-feedback-error, var(--persona-palette-colors-error-600))"
      : approval.status === "timeout" ? "var(--persona-feedback-warning, var(--persona-palette-colors-warning-600))"
      : styles.pendingIconColor;
    const icon = renderIconNode(iconData, 20, iconColor, 2);
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
  config?: AgentWidgetConfig,
  expansionState = new Map<string, boolean>()
): HTMLElement => {
  const approval = message.approval;
  const approvalConfig = resolveApprovalConfig(config);
  const isPending = approval?.status === "pending";

  const bubble = createElement(
    "div",
    [
      "persona-approval-bubble",
      "persona-w-full",
      "persona-rounded-2xl",
      "persona-border",
      "persona-shadow-sm",
      "persona-overflow-hidden",
    ].join(" ")
  );

  // Set id for idiomorph matching
  bubble.id = `bubble-${message.id}`;
  bubble.setAttribute("data-message-id", message.id);

  if (!approval) {
    applyApprovalBubbleStyles(bubble, config);
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
  // Content area
  const content = createElement("div", "persona-flex-1 persona-min-w-0");

  // Title row with status badge
  const titleRow = createElement("div", "persona-flex persona-items-center persona-gap-2");
  const title = createElement("span", "persona-text-sm persona-font-medium persona-text-persona-primary");
  title.setAttribute("data-approval-title", "true");
  title.textContent = approvalConfig?.title ?? "Approval Required";
  titleRow.appendChild(title);

  // Status badge (shown when resolved)
  if (!isPending) {
    const badge = createElement("span", "persona-inline-flex persona-items-center persona-px-2 persona-py-0.5 persona-rounded-full persona-text-xs persona-font-medium");
    badge.setAttribute("data-approval-status", approval.status);
    titleRow.appendChild(badge);
  }

  content.appendChild(titleRow);
  if (approval.status === "timeout" && approval.interrupted) {
    const notice = createElement("p", "persona-text-sm");
    notice.textContent = BROWSER_TOOL_INTERRUPTION;
    content.appendChild(notice);
  }

  // User-facing summary line. The wire `description` is the tool's
  // agent-facing description (prompt prose, usage rules), so it is not shown
  // here: it lives in the collapsible details section below. Label priority:
  // formatDescription → declared WebMCP `title` → humanized tool name →
  // raw description (no tool name at all).
  const isWebMcpTool =
    approval.toolType === "webmcp" ||
    approval.toolName.startsWith(WEBMCP_TOOL_PREFIX);
  const declaredTitle = isWebMcpTool
    ? getWebMcpToolDisplayTitle(approval.toolName)
    : undefined;
  const summaryFromConfig = approvalConfig?.formatDescription?.({
    toolName: approval.toolName,
    toolType: approval.toolType,
    description: approval.description,
    parameters: approval.parameters,
    ...(declaredTitle ? { displayTitle: declaredTitle } : {}),
    ...(approval.reason ? { reason: approval.reason } : {}),
  });
  const summaryFallsBackToDescription = !approval.toolName;
  const summaryText =
    summaryFromConfig ||
    (summaryFallsBackToDescription
      ? approval.description
      : `The assistant wants to use “${declaredTitle ?? humanizeToolName(approval.toolName)}”.`);

  const summary = createElement("p", "persona-text-sm persona-mt-0.5 persona-text-persona-muted");
  summary.setAttribute("data-approval-summary", "true");
  summary.textContent = summaryText;
  content.appendChild(summary);

  // Agent-authored justification for this specific call. It is the agent's
  // own claim about its intent (attacker-writable under prompt injection), so
  // it is rendered as plain text via textContent, never markdown/HTML, and
  // explicitly attributed to the agent rather than spoken in system voice.
  if (approval.reason) {
    const reasonLine = createElement("p", "persona-text-sm persona-mt-1 persona-text-persona-muted");
    reasonLine.setAttribute("data-approval-reason", "true");
    const reasonLabel = createElement("span", "persona-font-medium");
    reasonLabel.textContent = `${approvalConfig?.reasonLabel ?? "Agent's stated reason:"} `;
    reasonLine.appendChild(reasonLabel);
    reasonLine.appendChild(document.createTextNode(approval.reason));
    content.appendChild(reasonLine);
  }

  // Technical details: agent-facing description + raw parameters JSON,
  // collapsed behind a toggle by default (`approval.detailsDisplay`).
  const detailsMode = approvalConfig?.detailsDisplay ?? "collapsed";
  const showDescriptionInDetails = Boolean(approval.description) && !summaryFallsBackToDescription;
  const hasDetails = showDescriptionInDetails || Boolean(approval.parameters);
  if (detailsMode !== "hidden" && hasDetails) {
    const expanded = isDetailsExpanded(message.id, expansionState, config);

    const toggle = createElement(
      "button",
      "persona-inline-flex persona-items-center persona-gap-1 persona-mt-1 persona-p-0 persona-border-none persona-bg-transparent persona-text-xs persona-font-medium persona-cursor-pointer persona-text-persona-muted"
    ) as HTMLButtonElement;
    toggle.type = "button";
    toggle.setAttribute("data-expand-header", "true");
    toggle.setAttribute("data-bubble-type", "approval");
    const toggleLabel = createElement("span");
    toggleLabel.setAttribute("data-approval-details-label", "true");
    const chevronHolder = createElement("span", "persona-inline-flex persona-items-center");
    chevronHolder.setAttribute("data-approval-details-chevron", "true");
    toggle.append(toggleLabel, chevronHolder);
    applyDetailsToggleState(toggle, expanded, config);
    content.appendChild(toggle);

    const details = createElement("div");
    details.setAttribute("data-approval-details", "true");
    details.style.display = expanded ? "" : "none";

    if (showDescriptionInDetails) {
      const description = createElement("p", "persona-text-sm persona-mt-1 persona-text-persona-muted");
      description.setAttribute("data-approval-description", "true");
      description.textContent = approval.description;
      details.appendChild(description);
    }

    if (approval.parameters) {
      const paramsPre = createElement(
        "pre",
        "persona-mt-2 persona-text-xs persona-p-2 persona-rounded persona-overflow-x-auto persona-max-h-32 persona-bg-persona-container persona-text-persona-primary"
      );
      paramsPre.setAttribute("data-approval-parameters", "true");
      paramsPre.style.fontSize = "0.75rem";
      paramsPre.style.lineHeight = "1rem";
      paramsPre.textContent = formatUnknownValue(approval.parameters);
      details.appendChild(paramsPre);
    }

    content.appendChild(details);
  }

  // Action buttons (only shown when pending)
  if (isPending) {
    const buttonsContainer = createElement("div", "persona-flex persona-gap-2 persona-mt-2");
    buttonsContainer.setAttribute("data-approval-buttons", "true");

    // Approve button
    const approveBtn = createElement("button", "persona-inline-flex persona-items-center persona-px-3 persona-py-1.5 persona-rounded-md persona-text-xs persona-font-medium persona-border-none persona-cursor-pointer") as HTMLButtonElement;
    approveBtn.type = "button";
    approveBtn.setAttribute("data-approval-action", "approve");
    const approveIcon = renderIconNode("shield-check", 14, "currentColor", 2);
    if (approveIcon) {
      approveIcon.style.marginRight = "4px";
      approveBtn.appendChild(approveIcon);
    }
    const approveLabel = document.createTextNode(approvalConfig?.approveLabel ?? "Approve");
    approveBtn.appendChild(approveLabel);

    // Deny button
    const denyBtn = createElement("button", "persona-inline-flex persona-items-center persona-px-3 persona-py-1.5 persona-rounded-md persona-text-xs persona-font-medium persona-cursor-pointer") as HTMLButtonElement;
    denyBtn.type = "button";
    denyBtn.setAttribute("data-approval-action", "deny");
    const denyIcon = renderIconNode("shield-x", 14, "currentColor", 2);
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
  updateApprovalBubbleUI(message.id, bubble, config, approval);
  return bubble;
};


/** Restore theme fallbacks when a host clears an appearance override during update. */
const applyApprovalBubbleStyles = (bubble: HTMLElement, config?: AgentWidgetConfig): void => {
  const styles = resolveApprovalStyles(config, "public");
  bubble.style.backgroundColor = styles.backgroundColor ?? "var(--persona-approval-bg)";
  bubble.style.borderColor = styles.borderColor ?? "var(--persona-approval-border)";
  bubble.style.boxShadow = styles.shadow === undefined ? "var(--persona-approval-shadow)" : styles.shadow.trim() || "none";
  const color = (selector: string, value?: string): void => {
    bubble.querySelectorAll<HTMLElement>(selector).forEach((element) => { element.style.color = value ?? ""; });
  };
  if (!bubble.querySelector("[data-approval-status]")) {
    bubble.querySelector("[data-approval-icon] svg")?.setAttribute("stroke", styles.pendingIconColor);
  }
  color("[data-approval-title]", styles.titleColor);
  color("[data-approval-summary], [data-approval-description], button[data-bubble-type='approval']", styles.descriptionColor);
  color("[data-approval-reason]", styles.reasonColor);
  color("[data-approval-parameters]", styles.parameterTextColor);
  bubble.querySelectorAll<HTMLElement>("[data-approval-parameters]").forEach((element) => {
    element.style.backgroundColor = styles.parameterBackgroundColor ?? "";
  });
  for (const action of ["approve", "deny"] as const) {
    const button = bubble.querySelector<HTMLElement>(`[data-approval-action="${action}"]`);
    if (!button) continue;
    const foreground = action === "approve" ? styles.approveButtonTextColor : styles.denyButtonTextColor;
    button.style.backgroundColor = (action === "approve" ? styles.approveButtonColor ?? "var(--persona-approval-approve-bg)" : styles.denyButtonColor) ?? "";
    button.style.color = foreground ?? "";
    button.querySelector("svg")?.setAttribute("stroke", foreground ?? "currentColor");
    if (action === "deny") button.style.border = `1px solid ${styles.denyBorderColor}`;
  }
};
