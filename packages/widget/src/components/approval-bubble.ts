import { createElement } from "../utils/dom";
import { AgentWidgetMessage, AgentWidgetConfig } from "../types";
import { formatUnknownValue } from "../utils/formatting";
import { renderLucideIcon } from "../utils/icons";
import { WEBMCP_TOOL_PREFIX, getWebMcpToolDisplayTitle } from "../webmcp-bridge";

/**
 * Per-message expanded/collapsed state for the technical-details section.
 * Absent means "use the config default" (`approval.detailsDisplay`). Lives at
 * module scope so the choice survives idiomorph re-renders, mirroring
 * `toolExpansionState` in tool-bubble.ts.
 */
export const approvalDetailsExpansionState = new Map<string, boolean>();

/**
 * Turn a wire tool name into a user-facing label: strips the `webmcp:`
 * prefix and splits snake_case / kebab-case / camelCase into a sentence
 * (`add_to_cart` → "Add to cart"). Falls back to the input when nothing
 * word-like remains.
 */
export const humanizeToolName = (toolName: string): string => {
  const bare = toolName.startsWith(WEBMCP_TOOL_PREFIX)
    ? toolName.slice(WEBMCP_TOOL_PREFIX.length)
    : toolName;
  const words = bare
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[_\-\s.]+/)
    .filter(Boolean);
  if (words.length === 0) return toolName;
  const sentence = words.join(" ").toLowerCase();
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
};

const resolveApprovalConfig = (config?: AgentWidgetConfig) =>
  config?.approval !== false ? config?.approval : undefined;

const isDetailsExpanded = (
  messageId: string,
  config?: AgentWidgetConfig
): boolean => {
  const detailsMode = resolveApprovalConfig(config)?.detailsDisplay ?? "collapsed";
  return approvalDetailsExpansionState.get(messageId) ?? detailsMode === "expanded";
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
    const chevron = renderLucideIcon(expanded ? "chevron-up" : "chevron-down", 14, "currentColor", 2);
    if (chevron) {
      chevronHolder.appendChild(chevron);
    }
  }
};

/**
 * Sync the technical-details section (toggle label/chevron + visibility) with
 * `approvalDetailsExpansionState`. Called from the ui.ts expansion event
 * delegation after a toggle click.
 */
export const updateApprovalDetailsUI = (
  messageId: string,
  bubble: HTMLElement,
  config?: AgentWidgetConfig
): void => {
  const toggle = bubble.querySelector('button[data-bubble-type="approval"]') as HTMLElement | null;
  const details = bubble.querySelector("[data-approval-details]") as HTMLElement | null;
  if (!toggle || !details) return;
  const expanded = isDetailsExpanded(messageId, config);
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

  // Apply styling: use semantic tokens with config overrides
  bubble.style.backgroundColor = approvalConfig?.backgroundColor ?? "var(--persona-approval-bg, #fefce8)";
  bubble.style.borderColor = approvalConfig?.borderColor ?? "var(--persona-approval-border, #fef08a)";
  bubble.style.boxShadow =
    approvalConfig?.shadow !== undefined
      ? (approvalConfig.shadow.trim() === "" ? "none" : approvalConfig.shadow)
      : "var(--persona-approval-shadow, 0 5px 15px rgba(15, 23, 42, 0.08))";

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
  if (approvalConfig?.descriptionColor) {
    summary.style.color = approvalConfig.descriptionColor;
  }
  summary.textContent = summaryText;
  content.appendChild(summary);

  // WebMCP security context. Page tools are same-origin code (any script on the
  // page can register them), never a vetted remote server, so the gate shows
  // provenance and an elevated warning when the tool's metadata was sanitized
  // or its definition changed since it was offered. All values are rendered via
  // textContent — they originate from page-controlled strings.
  if (isWebMcpTool) {
    if (approval.suspicious) {
      const warning = createElement(
        "div",
        "persona-flex persona-items-start persona-gap-2 persona-mt-2 persona-p-2 persona-rounded-md persona-text-xs"
      );
      warning.setAttribute("data-approval-security-warning", "true");
      warning.style.backgroundColor =
        "var(--persona-palette-colors-warning-100, #fef3c7)";
      warning.style.color = "var(--persona-palette-colors-warning-700, #b45309)";
      const warnIconHolder = createElement("span", "persona-flex-shrink-0 persona-mt-0.5");
      const warnIcon = renderLucideIcon(
        "shield-alert",
        14,
        "var(--persona-palette-colors-warning-700, #b45309)",
        2
      );
      if (warnIcon) warnIconHolder.appendChild(warnIcon);
      const warnBody = createElement("div", "persona-flex-1 persona-min-w-0");
      const warnTitle = createElement("p", "persona-font-medium");
      warnTitle.textContent = "Unverified tool — review carefully";
      warnBody.appendChild(warnTitle);
      const reasons =
        approval.securityWarnings && approval.securityWarnings.length > 0
          ? approval.securityWarnings
          : ["This tool's definition could not be verified."];
      for (const reason of reasons) {
        const line = createElement("p", "persona-mt-0.5");
        line.textContent = reason;
        warnBody.appendChild(line);
      }
      warning.append(warnIconHolder, warnBody);
      content.appendChild(warning);
    }

    if (approval.pageOrigin) {
      const provenance = createElement(
        "p",
        "persona-text-xs persona-mt-1 persona-text-persona-muted"
      );
      provenance.setAttribute("data-approval-provenance", "true");
      const label = createElement("span", "persona-font-medium");
      label.textContent = "Runs code from: ";
      provenance.appendChild(label);
      provenance.appendChild(document.createTextNode(approval.pageOrigin));
      content.appendChild(provenance);
    }
  }

  // Agent-authored justification for this specific call. It is the agent's
  // own claim about its intent (attacker-writable under prompt injection), so
  // it is rendered as plain text via textContent, never markdown/HTML, and
  // explicitly attributed to the agent rather than spoken in system voice.
  if (approval.reason) {
    const reasonLine = createElement("p", "persona-text-sm persona-mt-1 persona-text-persona-muted");
    reasonLine.setAttribute("data-approval-reason", "true");
    if (approvalConfig?.reasonColor) {
      reasonLine.style.color = approvalConfig.reasonColor;
    } else if (approvalConfig?.descriptionColor) {
      reasonLine.style.color = approvalConfig.descriptionColor;
    }
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
    const expanded = isDetailsExpanded(message.id, config);

    const toggle = createElement(
      "button",
      "persona-inline-flex persona-items-center persona-gap-1 persona-mt-1 persona-p-0 persona-border-none persona-bg-transparent persona-text-xs persona-font-medium persona-cursor-pointer persona-text-persona-muted"
    ) as HTMLButtonElement;
    toggle.type = "button";
    toggle.setAttribute("data-expand-header", "true");
    toggle.setAttribute("data-bubble-type", "approval");
    if (approvalConfig?.descriptionColor) {
      toggle.style.color = approvalConfig.descriptionColor;
    }
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
      if (approvalConfig?.descriptionColor) {
        description.style.color = approvalConfig.descriptionColor;
      }
      description.textContent = approval.description;
      details.appendChild(description);
    }

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
