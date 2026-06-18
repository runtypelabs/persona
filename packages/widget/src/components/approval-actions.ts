/**
 * Built-in default approval renderer.
 *
 * Renders the neutral "permission card": a tool icon, a "The assistant wants to
 * use <tool>" title, the call arguments collapsed behind a "show more" header
 * chevron, and an action row. By default the row is a single "Allow" (allow
 * once) + "Deny". When `config.approval.enableAlwaysAllow` is true it becomes a
 * split "Always allow ⏎" primary with an "Allow once ⌘⏎" dropdown plus
 * "Deny Esc", with keyboard shortcuts — that affordance is opt-in because
 * "Always allow" only means anything if the integrator persists the policy via
 * `onDecision`'s `remember` flag (needs a backend).
 *
 * Installed as an internal `renderApproval` plugin (see ui.ts) so it rides the
 * existing plugin stub-and-hydrate + teardown path and survives idiomorph
 * re-renders. A user-supplied `renderApproval` plugin still fully overrides it.
 *
 * Resolved states mirror the example plugin: approved → render nothing (the
 * tool call takes over the transcript); denied/timeout → a subtle one-line
 * trace.
 */
import { createElement } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import { formatUnknownValue } from "../utils/formatting";
import { WEBMCP_TOOL_PREFIX, getWebMcpToolDisplayTitle } from "../webmcp-bridge";
import { createPopover, isEditableEventTarget, type PopoverHandle } from "../plugin-kit";
import type {
  AgentWidgetMessage,
  AgentWidgetConfig,
  AgentWidgetApprovalConfig,
} from "../types";
import type { AgentWidgetPlugin } from "../plugins/types";
import { humanizeToolName, approvalDetailsExpansionState } from "./approval-bubble";

type Approval = NonNullable<AgentWidgetMessage["approval"]>;
type Decide = (options?: { remember?: boolean }) => void;

// Per-message runtime state. The document `keydown` handler (re-bound on each
// render to the freshest approve/deny closures) and the "Allow once" popover
// are torn down when the approval resolves, the bubble rebuilds, or the widget
// is destroyed.
const keyHandlers = new Map<string, (e: KeyboardEvent) => void>();
const popovers = new Map<string, PopoverHandle>();
// Only the most-recently-built pending approval owns the keyboard shortcuts, so
// Enter/Esc don't fire on every pending card at once.
let latestPendingApprovalId: string | null = null;

const teardownMessage = (messageId: string): void => {
  const prevKey = keyHandlers.get(messageId);
  if (prevKey) {
    document.removeEventListener("keydown", prevKey);
    keyHandlers.delete(messageId);
  }
  const popover = popovers.get(messageId);
  if (popover) {
    popover.destroy();
    popovers.delete(messageId);
  }
  if (latestPendingApprovalId === messageId) latestPendingApprovalId = null;
};

/** Release every pending approval's global listener + popover. Pushed into the widget's destroy callbacks. */
export const teardownAllBuiltInApprovals = (): void => {
  for (const id of [...keyHandlers.keys(), ...popovers.keys()]) teardownMessage(id);
  latestPendingApprovalId = null;
};

const resolveApprovalConfig = (
  config?: AgentWidgetConfig
): AgentWidgetApprovalConfig | undefined =>
  config?.approval !== false ? config?.approval : undefined;

const isDetailsExpanded = (
  messageId: string,
  approvalConfig?: AgentWidgetApprovalConfig
): boolean => {
  const mode = approvalConfig?.detailsDisplay ?? "collapsed";
  return approvalDetailsExpansionState.get(messageId) ?? mode === "expanded";
};

const kbd = (label: string): HTMLElement => {
  const el = createElement("span", "persona-approval-kbd");
  el.textContent = label;
  return el;
};

// Title: "The assistant wants to use <tool>" with an optional "from <source>"
// when a non-WebMCP `toolType` source label is present. `formatDescription`
// fully overrides the line. Mirrors the built-in bubble's label priority
// (formatDescription → declared WebMCP title → humanized tool name).
const buildTitle = (
  approval: Approval,
  approvalConfig?: AgentWidgetApprovalConfig
): HTMLElement => {
  const title = createElement("span", "persona-approval-title");
  if (approvalConfig?.titleColor) title.style.color = approvalConfig.titleColor;

  const isWebMcp =
    approval.toolType === "webmcp" || approval.toolName.startsWith(WEBMCP_TOOL_PREFIX);
  const declaredTitle = isWebMcp
    ? getWebMcpToolDisplayTitle(approval.toolName)
    : undefined;

  const custom = approvalConfig?.formatDescription?.({
    toolName: approval.toolName,
    toolType: approval.toolType,
    description: approval.description ?? "",
    parameters: approval.parameters,
    ...(declaredTitle ? { displayTitle: declaredTitle } : {}),
    ...(approval.reason ? { reason: approval.reason } : {}),
  });
  if (custom) {
    title.textContent = custom;
    return title;
  }

  const toolDisplay = declaredTitle ?? humanizeToolName(approval.toolName);
  const source =
    approval.toolType && approval.toolType !== "webmcp" ? approval.toolType : null;
  title.append("The assistant wants to use ");
  const toolStrong = document.createElement("strong");
  toolStrong.textContent = toolDisplay;
  title.appendChild(toolStrong);
  if (source) {
    title.append(" from ");
    const srcStrong = document.createElement("strong");
    srcStrong.textContent = source;
    title.appendChild(srcStrong);
  }
  return title;
};

const buildResolvedTrace = (approval: Approval): HTMLElement => {
  const row = createElement("div", "persona-approval-resolved");
  const icon = renderLucideIcon("ban", 15, "currentColor", 2);
  if (icon) row.appendChild(icon);
  const name = createElement("span", "persona-approval-resolved-name");
  name.textContent = approval.toolName ? humanizeToolName(approval.toolName) : "Tool";
  row.append(name, document.createTextNode(approval.status === "timeout" ? " timed out" : " denied"));
  return row;
};

const buildPending = (
  message: AgentWidgetMessage,
  approval: Approval,
  approvalConfig: AgentWidgetApprovalConfig | undefined,
  approve: Decide,
  deny: Decide,
  enableAlways: boolean
): HTMLElement => {
  const card = createElement("div", "persona-approval-card persona-shadow-sm");
  card.id = `bubble-${message.id}`;
  card.setAttribute("data-message-id", message.id);
  card.setAttribute("data-bubble-type", "approval");
  if (approvalConfig?.backgroundColor) card.style.background = approvalConfig.backgroundColor;
  if (approvalConfig?.borderColor) card.style.borderColor = approvalConfig.borderColor;
  if (approvalConfig?.shadow !== undefined) {
    card.style.boxShadow = approvalConfig.shadow.trim() === "" ? "none" : approvalConfig.shadow;
  }

  const detailsMode = approvalConfig?.detailsDisplay ?? "collapsed";
  const hasParams = approval.parameters != null && detailsMode !== "hidden";
  const expanded = hasParams && isDetailsExpanded(message.id, approvalConfig);

  // Header. When params exist, the whole header toggles their visibility.
  const head = createElement("button", "persona-approval-head") as HTMLButtonElement;
  head.type = "button";
  if (hasParams) {
    head.setAttribute("data-action", "toggle-params");
    head.setAttribute("aria-expanded", expanded ? "true" : "false");
  } else {
    head.setAttribute("data-static", "true");
  }

  const logo = createElement("span", "persona-approval-logo");
  const glyph = renderLucideIcon("shield-check", 16, "currentColor", 2);
  if (glyph) logo.appendChild(glyph);
  head.appendChild(logo);

  const title = buildTitle(approval, approvalConfig);
  if (hasParams) {
    const toggle = createElement("span", "persona-approval-toggle");
    toggle.setAttribute("aria-hidden", "true");
    const chevron = renderLucideIcon("chevron-down", 14, "currentColor", 2);
    if (chevron) toggle.appendChild(chevron);
    title.append(" ");
    title.appendChild(toggle);
  }
  head.appendChild(title);
  card.appendChild(head);

  const body = createElement("div", "persona-approval-body");

  if (hasParams) {
    const pre = createElement("pre", "persona-approval-params");
    pre.setAttribute("data-role", "params");
    pre.hidden = !expanded;
    if (approvalConfig?.parameterBackgroundColor) pre.style.background = approvalConfig.parameterBackgroundColor;
    if (approvalConfig?.parameterTextColor) pre.style.color = approvalConfig.parameterTextColor;
    pre.textContent = formatUnknownValue(approval.parameters);
    body.appendChild(pre);
  }

  // Agent-authored justification: attacker-writable, so plain text + attributed.
  if (approval.reason) {
    const reasonLine = createElement("p", "persona-approval-reason");
    if (approvalConfig?.reasonColor) reasonLine.style.color = approvalConfig.reasonColor;
    else if (approvalConfig?.descriptionColor) reasonLine.style.color = approvalConfig.descriptionColor;
    const label = createElement("span", "persona-approval-reason-label");
    label.textContent = `${approvalConfig?.reasonLabel ?? "Agent's stated reason:"} `;
    reasonLine.append(label, document.createTextNode(approval.reason));
    body.appendChild(reasonLine);
  }

  const actions = createElement("div", "persona-approval-actions");
  let popover: PopoverHandle | null = null;

  const applyPrimaryColors = (el: HTMLElement): void => {
    if (approvalConfig?.approveButtonColor) el.style.background = approvalConfig.approveButtonColor;
    if (approvalConfig?.approveButtonTextColor) el.style.color = approvalConfig.approveButtonTextColor;
  };
  const denyBtn = createElement("button", "persona-approval-deny") as HTMLButtonElement;
  denyBtn.type = "button";
  denyBtn.setAttribute("data-action", "deny");
  if (approvalConfig?.denyButtonColor) denyBtn.style.background = approvalConfig.denyButtonColor;
  if (approvalConfig?.denyButtonTextColor) denyBtn.style.color = approvalConfig.denyButtonTextColor;
  denyBtn.append(approvalConfig?.denyLabel ?? "Deny");

  if (enableAlways) {
    const split = createElement("div", "persona-approval-split");
    const primary = createElement("button", "persona-approval-primary") as HTMLButtonElement;
    primary.type = "button";
    primary.setAttribute("data-action", "always");
    applyPrimaryColors(primary);
    primary.append(approvalConfig?.approveLabel ?? "Always allow", kbd("⏎"));

    const caret = createElement("button", "persona-approval-caret") as HTMLButtonElement;
    caret.type = "button";
    caret.setAttribute("data-action", "toggle-menu");
    caret.setAttribute("aria-label", "More options");
    applyPrimaryColors(caret);
    const caretIcon = renderLucideIcon("chevron-down", 15, "currentColor", 2);
    if (caretIcon) caret.appendChild(caretIcon);

    split.append(primary, caret);
    actions.append(split, denyBtn);
    denyBtn.append(kbd("Esc"));

    // "Allow once" menu, portaled out of the transcript by createPopover so it
    // overlays the rest of the UI and isn't clipped by the scroll container.
    const menu = createElement("div", "persona-approval-menu");
    const once = createElement("button", "persona-approval-menu-item") as HTMLButtonElement;
    once.type = "button";
    once.append("Allow once", kbd("⌘⏎"));
    menu.appendChild(once);
    popover = createPopover({
      anchor: split,
      content: menu,
      placement: "bottom-start",
      matchAnchorWidth: true,
    });
    popovers.set(message.id, popover);
    once.addEventListener("click", () => {
      teardownMessage(message.id);
      approve(); // Allow once
    });
  } else {
    const allow = createElement(
      "button",
      "persona-approval-primary persona-approval-primary--solo"
    ) as HTMLButtonElement;
    allow.type = "button";
    allow.setAttribute("data-action", "allow");
    applyPrimaryColors(allow);
    allow.append(approvalConfig?.approveLabel ?? "Allow");
    actions.append(allow, denyBtn);
  }

  body.appendChild(actions);
  card.appendChild(body);

  // Single delegated click listener; survives morph via the plugin hydrate path.
  card.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target.closest("[data-action]") : null;
    if (!target) return;
    const action = target.getAttribute("data-action");
    if (action === "toggle-params") {
      const pre = card.querySelector<HTMLElement>('[data-role="params"]');
      if (pre) {
        const willOpen = pre.hidden;
        pre.hidden = !willOpen;
        head.setAttribute("aria-expanded", willOpen ? "true" : "false");
        approvalDetailsExpansionState.set(message.id, willOpen);
      }
      return;
    }
    if (action === "toggle-menu") {
      popover?.toggle();
      return;
    }
    if (action === "always") {
      teardownMessage(message.id);
      approve({ remember: true });
      return;
    }
    if (action === "allow") {
      teardownMessage(message.id);
      approve();
      return;
    }
    if (action === "deny") {
      teardownMessage(message.id);
      deny();
      return;
    }
  });

  return card;
};

/**
 * The built-in approval renderer, shaped as a plugin so ui.ts can run it through
 * the same `renderApproval` pipeline as user plugins (which still take
 * precedence). Reads `config` from the render context, so a single instance
 * serves every widget.
 */
export const createBuiltInApprovalPlugin = (): AgentWidgetPlugin => ({
  id: "persona-built-in-approval",
  renderApproval: ({ message, approve, deny, config }) => {
    const approval = message?.approval;
    if (!approval) return null;
    const approvalConfig = resolveApprovalConfig(config);

    if (approval.status !== "pending") {
      teardownMessage(message.id);
      // Approved → render nothing; the tool call takes over the transcript.
      // (An empty hidden element, not null, suppresses the legacy fallback.)
      if (approval.status === "approved") {
        const hidden = document.createElement("div");
        hidden.style.display = "none";
        return hidden;
      }
      return buildResolvedTrace(approval);
    }

    // Rebuild: drop any prior listener/popover before (re)binding fresh closures.
    teardownMessage(message.id);
    const enableAlways = approvalConfig?.enableAlwaysAllow === true;
    const card = buildPending(message, approval, approvalConfig, approve, deny, enableAlways);

    if (enableAlways) {
      latestPendingApprovalId = message.id;
      const onKeydown = (e: KeyboardEvent): void => {
        if (isEditableEventTarget(e)) return;
        if (message.id !== latestPendingApprovalId) return;
        if (e.key === "Escape") {
          e.preventDefault();
          teardownMessage(message.id);
          deny();
        } else if (e.key === "Enter") {
          e.preventDefault();
          teardownMessage(message.id);
          if (e.metaKey || e.ctrlKey) approve(); // Allow once
          else approve({ remember: true }); // Always allow
        }
      };
      keyHandlers.set(message.id, onKeydown);
      document.addEventListener("keydown", onKeydown);
    }

    return card;
  },
});
