/**
 * Built-in default approval renderer.
 *
 * Renders a permission card with per-instance disclosure and shortcut state.
 * V4 preserves the legacy opt-in remembered-permission split button and trace.
 * V5 keeps one-time permission primary, scopes keys to the focused card, and
 * retains decisions as compact, inspectable rows. Each behavior is configurable.
 * Installed through renderApproval so user plugins can replace or decorate it.
 */
import { createElement, createNode } from "../utils/dom";
import { BROWSER_TOOL_INTERRUPTION } from "../utils/restored-browser-state";
// The webmcp-title lookup is injected by ui.ts at chunk adoption (see
// approval-deps): this module ships in the lazy approval-ui chunk. Icons are
// direct lucide data imports.
import { getWebMcpToolDisplayTitle, getApprovalPopoverDeps } from "./approval-deps";
import { Ban } from "lucide";
import { renderApprovalIcon, renderApprovalIconNode as renderIconNode } from "./approval-deps";
import { formatUnknownValue } from "../utils/format-value";
import { WEBMCP_TOOL_PREFIX } from "../webmcp-bridge";
import type { PopoverHandle } from "../plugin-kit";
import type {
  AgentWidgetMessage,
  AgentWidgetApprovalConfig,
} from "../types";
import type { AgentWidgetPlugin } from "../plugins/types";
import { humanizeToolName } from "../utils/humanize-tool-name";
import { resolveApprovalConfig } from "../utils/approval-config";
import { resolveApprovalStyles } from "../utils/approval-styles";

type Approval = NonNullable<AgentWidgetMessage["approval"]>;
type Decide = (options?: { remember?: boolean }) => void;

/**
 * Per-widget-instance runtime state. The document `keydown` handler (re-bound on
 * each render to the freshest approve/deny closures) and the "Allow once"
 * popover are torn down when the approval resolves, the bubble rebuilds, or the
 * widget is destroyed. This lives on the plugin instance (NOT module scope) so
 * tearing down one widget never clears listeners/popovers another widget on the
 * same page still owns.
 */
let nextInstanceId = 0;

interface InstanceState {
  disclosurePrefix: string;
  keyHandlers: Map<string, (e: KeyboardEvent) => void>;
  popovers: Map<string, PopoverHandle>;
  // Order in which approvals FIRST became pending — not re-render order. The
  // newest pending approval (bottom of the thread) owns the keyboard shortcuts,
  // so Enter/Esc don't fire on every pending card at once, and an older card
  // re-rendering can't steal ownership from a newer one.
  pendingOrder: string[];
  latestPendingApprovalId: string | null;
}

const createInstanceState = (): InstanceState => ({
  disclosurePrefix: `approval-${++nextInstanceId}`,
  keyHandlers: new Map(),
  popovers: new Map(),
  pendingOrder: [],
  latestPendingApprovalId: null,
});

// Drop a message's transient listener + popover WITHOUT touching its place in
// the pending order. Used when a still-pending card re-renders and rebinds fresh
// closures (so a rebuild of an older card doesn't reorder it to "newest").
const detachMessage = (state: InstanceState, messageId: string): void => {
  const prevKey = state.keyHandlers.get(messageId);
  if (prevKey) {
    document.removeEventListener("keydown", prevKey);
    state.keyHandlers.delete(messageId);
  }
  const popover = state.popovers.get(messageId);
  if (popover) {
    popover.destroy();
    state.popovers.delete(messageId);
  }
};

// Fully retire a message (resolved, denied, or widget destroyed): detach its
// listener/popover AND remove it from the pending order. If the keyboard owner
// just went away, promote the newest remaining pending approval so Enter/Esc
// keep working instead of going dead while another pending card remains.
const teardownMessage = (state: InstanceState, messageId: string): void => {
  detachMessage(state, messageId);
  const idx = state.pendingOrder.indexOf(messageId);
  if (idx !== -1) state.pendingOrder.splice(idx, 1);
  if (state.latestPendingApprovalId === messageId) {
    state.latestPendingApprovalId = state.pendingOrder.length
      ? state.pendingOrder[state.pendingOrder.length - 1]
      : null;
  }
};

const isDetailsExpanded = (
  messageId: string,
  expansionState: Map<string, boolean>,
  approvalConfig?: AgentWidgetApprovalConfig
): boolean => {
  const mode = approvalConfig?.detailsDisplay ?? "collapsed";
  return expansionState.get(messageId) ?? mode === "expanded";
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
  const icon = renderIconNode(Ban, 15, "currentColor", 2);
  if (icon) row.appendChild(icon);
  const name = createElement("span", "persona-approval-resolved-name");
  name.textContent = approval.toolName ? humanizeToolName(approval.toolName) : "Tool";
  const explanation = approval.status === "timeout" && approval.interrupted
    ? ` approval expired. ${BROWSER_TOOL_INTERRUPTION}`
    : approval.status === "timeout" ? " timed out" : " denied";
  row.appendChild(createNode("span", { className: "persona-approval-resolved-text" }, name, explanation));
  return row;
};

const buildPending = (
  state: InstanceState,
  expansionState: Map<string, boolean>,
  message: AgentWidgetMessage,
  approval: Approval,
  approvalConfig: AgentWidgetApprovalConfig | undefined,
  approve: Decide,
  deny: Decide,
  enableAlways: boolean,
  showRawCall = false,
  resolvedLabel?: string
): HTMLElement => {
  const compact = resolvedLabel !== undefined;
  const card = createElement("div", compact ? "persona-approval-row persona-activity-row" : "persona-approval-card persona-shadow-sm");
  card.id = `bubble-${message.id}`;
  card.setAttribute("data-message-id", message.id);
  card.setAttribute("data-bubble-type", "approval");
  if (approvalConfig?.backgroundColor) card.style.background = approvalConfig.backgroundColor;
  if (approvalConfig?.borderColor) card.style.borderColor = approvalConfig.borderColor;
  if (approvalConfig?.shadow !== undefined) {
    card.style.boxShadow = approvalConfig.shadow.trim() === "" ? "none" : approvalConfig.shadow;
  }

  const detailsMode = approvalConfig?.detailsDisplay ?? "collapsed";
  // The disclosure surfaces the agent-facing description (prompt prose, usage
  // rules) and the raw call parameters. `buildTitle` never falls back to the
  // raw description (it uses formatDescription → declared title → humanized
  // name), so the description is only ever visible here. Mirrors the legacy
  // bubble, which also opened a disclosure when only a description was present.
  const hasDescription = Boolean(approval.description) && detailsMode !== "hidden";
  const hasParams = approval.parameters != null && detailsMode !== "hidden" && !showRawCall;
  const hasReason = Boolean(approval.reason) && detailsMode !== "hidden";
  const hasDetails = hasDescription || hasParams || (compact && hasReason);
  const expanded = hasDetails && isDetailsExpanded(message.id, expansionState, approvalConfig);

  // The card uses the whole header as the disclosure toggle (chevron-only, no
  // separate text button), but the legacy `showDetailsLabel`/`hideDetailsLabel`
  // strings are still honored as the toggle's accessible label so integrators
  // who localized them keep a meaningful, customizable name on the control.
  const showDetailsLabel = approvalConfig?.showDetailsLabel ?? "Show details";
  const hideDetailsLabel = approvalConfig?.hideDetailsLabel ?? "Hide details";

  // Header. When a disclosure exists, the whole header toggles its visibility.
  const head = createElement(compact && !hasDetails ? "div" : "button", "persona-approval-head");
  if (head instanceof HTMLButtonElement) head.type = "button";
  if (hasDetails) {
    head.setAttribute("data-action", "toggle-params");
    head.setAttribute("aria-expanded", expanded ? "true" : "false");
    head.setAttribute("aria-label", expanded ? hideDetailsLabel : showDetailsLabel);
  } else {
    head.setAttribute("data-static", "true");
  }

  const logo = createElement("span", "persona-approval-logo");
  const glyph = renderApprovalIcon("shield-check", 16, "currentColor", 2);
  if (glyph) logo.appendChild(glyph);
  if (!compact) head.appendChild(logo);

  const title = compact ? createElement("span", "persona-approval-title") : buildTitle(approval, approvalConfig);
  let accessibleSummary = "";
  if (compact) {
    const name = (approval.toolType === "webmcp" || approval.toolName.startsWith(WEBMCP_TOOL_PREFIX))
      ? getWebMcpToolDisplayTitle(approval.toolName) : undefined;
    const toolName = name ?? humanizeToolName(approval.toolName);
    const status = createElement("span", "persona-approval-status");
    status.setAttribute("role", "status");
    status.textContent = resolvedLabel;
    title.append(toolName, " · ", status);
    if (approvalConfig?.titleColor) title.style.color = approvalConfig.titleColor;
    accessibleSummary = `${toolName} · ${resolvedLabel}`;
  }
  if (hasDetails) {
    const toggle = createElement("span", "persona-approval-toggle");
    toggle.setAttribute("aria-hidden", "true");
    const chevron = renderApprovalIcon("chevron-down", 14, "currentColor", 2);
    if (chevron) toggle.appendChild(chevron);
    title.append(" ");
    title.appendChild(toggle);
  }
  head.appendChild(title);
  card.appendChild(head);

  const body = createElement("div", "persona-approval-body");

  let contextBlock: HTMLElement | undefined;
  if (hasDetails) {
    const details = createElement("div", "persona-approval-details");
    details.setAttribute("data-role", "params");
    details.hidden = !expanded;

    const section = (label: string): HTMLElement => {
      const block = createElement("div", "persona-tool-detail");
      const heading = createElement("div", "persona-tool-detail-label");
      heading.textContent = label;
      block.appendChild(heading);
      details.appendChild(block);
      return block;
    };
    const requestBlock = compact && hasParams ? section("Request") : details;
    if (compact && (hasDescription || hasReason)) contextBlock = section("Context");

    if (hasDescription) {
      const desc = createElement("p", "persona-approval-desc");
      if (approvalConfig?.descriptionColor) desc.style.color = approvalConfig.descriptionColor;
      desc.textContent = approval.description as string;
      (contextBlock ?? details).appendChild(desc);
    }

    if (hasParams) {
      const pre = createElement("pre", compact ? "persona-approval-params persona-tool-detail-value persona-tool-detail-code" : "persona-approval-params");
      if (approvalConfig?.parameterBackgroundColor) pre.style.background = approvalConfig.parameterBackgroundColor;
      if (approvalConfig?.parameterTextColor) pre.style.color = approvalConfig.parameterTextColor;
      pre.textContent = formatUnknownValue(approval.parameters);
      requestBlock.appendChild(pre);
    }

    body.appendChild(details);
  }

  // The raw tool name and arguments, always visible and above the reason, so
  // what will actually run is never less prominent than the agent's claim.
  if (showRawCall) {
    const call = createElement("div", "persona-approval-call");
    call.setAttribute("data-role", "raw-call");
    const name = createElement("code", "persona-approval-tool-name");
    name.textContent = approval.toolName;
    call.appendChild(name);
    if (approval.parameters != null) {
      const pre = createElement("pre", "persona-approval-params");
      if (approvalConfig?.parameterBackgroundColor) pre.style.background = approvalConfig.parameterBackgroundColor;
      if (approvalConfig?.parameterTextColor) pre.style.color = approvalConfig.parameterTextColor;
      pre.textContent = formatUnknownValue(approval.parameters);
      call.appendChild(pre);
    }
    body.appendChild(call);
  }

  // Agent-authored justification: attacker-writable, so plain text + attributed.
  if (approval.reason) {
    const reasonLine = createElement("p", "persona-approval-reason");
    if (approvalConfig?.reasonColor) reasonLine.style.color = approvalConfig.reasonColor;
    else if (approvalConfig?.descriptionColor) reasonLine.style.color = approvalConfig.descriptionColor;
    const label = createElement("span", "persona-approval-reason-label");
    label.textContent = `${approvalConfig?.reasonLabel ?? "Agent's stated reason:"} `;
    reasonLine.append(label, document.createTextNode(approval.reason));
    if (compact) contextBlock?.appendChild(reasonLine);
    else body.appendChild(reasonLine);
  }

  const updateDisclosureLabel = (open: boolean): void => {
    head.setAttribute("aria-expanded", String(open));
    const label = open ? hideDetailsLabel : showDetailsLabel;
    head.setAttribute("aria-label", compact ? `${accessibleSummary}. ${label}` : label);
  };
  const toggleDetails = (): void => {
    const details = card.querySelector<HTMLElement>('[data-role="params"]');
    if (!details) return;
    const willOpen = details.hidden !== false;
    details.hidden = !willOpen;
    if (compact) body.hidden = !willOpen;
    updateDisclosureLabel(willOpen);
    expansionState.set(message.id, willOpen);
  };
  if (compact) {
    if (hasDetails) {
      const details = body.querySelector<HTMLElement>('[data-role="params"]')!;
      details.id = `${state.disclosurePrefix}-details-${message.id}`;
      head.setAttribute("aria-controls", details.id);
      updateDisclosureLabel(expanded);
      body.hidden = !expanded;
      card.appendChild(body);
      head.addEventListener("click", toggleDetails);
    }
    return card;
  }

  const actions = createElement("div", "persona-approval-actions");
  const oncePrimary = approvalConfig?.primaryAction === "allow-once";
  const legacyKeys = approvalConfig?.keyboardShortcuts !== false && approvalConfig?.keyboardShortcuts !== "focused";
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
    primary.setAttribute("data-action", oncePrimary ? "allow" : "always");
    applyPrimaryColors(primary);
    primary.append(approvalConfig?.approveLabel ?? (oncePrimary ? "Allow once" : "Always allow"));
    if (legacyKeys) primary.append(kbd("⏎"));

    const caret = createElement("button", "persona-approval-caret") as HTMLButtonElement;
    caret.type = "button";
    caret.setAttribute("data-action", "toggle-menu");
    caret.setAttribute("aria-label", "More options");
    applyPrimaryColors(caret);
    const caretIcon = renderApprovalIcon("chevron-down", 15, "currentColor", 2);
    if (caretIcon) caret.appendChild(caretIcon);

    split.append(primary, caret);
    actions.append(split, denyBtn);
    if (legacyKeys) denyBtn.append(kbd("Esc"));

    // "Allow once" menu, portaled out of the transcript by createPopover so it
    // overlays the rest of the UI and isn't clipped by the scroll container.
    const menu = createElement("div", "persona-approval-menu");
    const once = createElement("button", "persona-approval-menu-item") as HTMLButtonElement;
    once.type = "button";
    once.append(oncePrimary ? (approvalConfig?.alwaysAllowLabel ?? "Always allow") : "Allow once");
    if (!oncePrimary && legacyKeys) once.append(kbd("⌘⏎"));
    menu.appendChild(once);
    popover = getApprovalPopoverDeps().createPopover({
      anchor: split,
      content: menu,
      placement: "bottom-start",
      matchAnchorWidth: true,
    });
    state.popovers.set(message.id, popover);
    once.addEventListener("click", () => {
      teardownMessage(state, message.id);
      if (oncePrimary) approve({ remember: true });
      else approve();
    });
  } else {
    const allow = createElement(
      "button",
      "persona-approval-primary persona-approval-primary--solo"
    ) as HTMLButtonElement;
    allow.type = "button";
    allow.setAttribute("data-action", "allow");
    applyPrimaryColors(allow);
    allow.append(approvalConfig?.approveLabel ?? (oncePrimary ? "Allow once" : "Allow"));
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
      toggleDetails();
      return;
    }
    if (action === "toggle-menu") {
      popover?.toggle();
      return;
    }
    if (action === "always") {
      teardownMessage(state, message.id);
      approve({ remember: true });
      return;
    }
    if (action === "allow") {
      teardownMessage(state, message.id);
      approve();
      return;
    }
    if (action === "deny") {
      teardownMessage(state, message.id);
      deny();
      return;
    }
  });

  return card;
};

/**
 * The built-in approval renderer, shaped as a plugin so ui.ts can run it through
 * the same `renderApproval` pipeline as user plugins (which still take
 * precedence). Reads `config` from the render context, so a single plugin
 * serves every render for one widget instance.
 *
 * Returns the plugin alongside a `teardown` the host pushes into its destroy
 * callbacks — both close over the SAME per-instance state, so destroying one
 * widget never disturbs another widget's open approvals on the same page.
 */
export const createBuiltInApprovalPlugin = (
  expansionState = new Map<string, boolean>()
): {
  plugin: AgentWidgetPlugin;
  teardown: () => void;
} => {
  const state = createInstanceState();

  const plugin: AgentWidgetPlugin = {
    id: "persona-built-in-approval",
    renderApproval: ({ message, approve, deny, config, execution, signal }) => {
      const approval = message?.approval;
      if (!approval) return null;
      const approvalConfig = { ...resolveApprovalConfig(config), ...resolveApprovalStyles(config, "plugin") };
      // A card can remain mounted while the host processes a decision. Retire
      // both action paths immediately, including click after native key events.
      let decided = false;
      const requestApprove = approve;
      const requestDeny = deny;
      approve = (options) => {
        if (decided || signal?.aborted || approval.status !== "pending") return;
        decided = true;
        if (options === undefined) requestApprove();
        else requestApprove(options);
      };
      deny = (options) => {
        if (decided || signal?.aborted || approval.status !== "pending") return;
        decided = true;
        if (options === undefined) requestDeny();
        else requestDeny(options);
      };

      if (approval.status !== "pending") {
        teardownMessage(state, message.id);
        const resolvedLabel = approval.status === "denied" ? "Denied"
          : approval.status === "timeout" ? "Timed out"
          : execution?.status === "running" ? "Allowed · running"
          : execution?.status === "completed" ? "Completed"
          : execution?.status === "failed" ? "Failed" : "Allowed";
        if (approvalConfig?.resolvedDisplay === "row") {
          return buildPending(state, expansionState, message, approval, approvalConfig, approve, deny, false, false, resolvedLabel);
        }
        if (approvalConfig?.resolvedDisplay === "status-line") {
          const card = buildPending(state, expansionState, message, approval, approvalConfig, approve, deny, false);
          const status = createElement("div", "persona-approval-status");
          status.setAttribute("role", "status");
          status.textContent = resolvedLabel;
          card.querySelector(".persona-approval-actions")?.replaceWith(status);
          return card;
        }
        // Approved → render nothing; the tool call takes over the transcript.
        // (An empty hidden element, not null, suppresses the legacy fallback.)
        if (approval.status === "approved") {
          const hidden = document.createElement("div");
          hidden.style.display = "none";
          return hidden;
        }
        return buildResolvedTrace(approval);
      }

      // Rebuild: drop any prior listener/popover before (re)binding fresh
      // closures, but KEEP this approval's place in the pending order so a
      // re-render of an older card doesn't reorder it ahead of a newer one.
      detachMessage(state, message.id);
      // Client-token visitors answer the gate themselves, so they see the
      // exact call rather than just the agent's framing.
      const visitorGate = Boolean(config?.clientToken);
      const enableAlways = approvalConfig?.enableAlwaysAllow === true;
      const card = buildPending(
        state,
        expansionState,
        message,
        approval,
        approvalConfig,
        approve,
        deny,
        enableAlways,
        visitorGate
      );

      const keyboardMode = approvalConfig?.keyboardShortcuts ?? "legacy";
      if (keyboardMode === "focused" || (keyboardMode === "legacy" && enableAlways)) {
        if (!state.pendingOrder.includes(message.id)) state.pendingOrder.push(message.id);
        // The newest first-seen pending approval owns the shortcuts, regardless
        // of which card happens to be re-rendering right now.
        state.latestPendingApprovalId = state.pendingOrder[state.pendingOrder.length - 1];
        const onKeydown = (e: KeyboardEvent): void => {
          if (e.defaultPrevented || e.isComposing || getApprovalPopoverDeps().isEditableEventTarget(e)) return;
          if (keyboardMode === "focused") {
            // A document listener also receives host-page keys and retargeted
            // Shadow DOM events. Only the focused approval's composed path owns them.
            if (!e.composedPath().includes(card)) return;
            if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
            const target = e.composedPath()[0];
            if (e.key === "Enter" && target instanceof Element &&
                target.closest("[data-action]")?.getAttribute("data-action") !== "allow") return;
          }
          if (keyboardMode === "legacy" && message.id !== state.latestPendingApprovalId) return;
          if (e.key !== "Escape" && e.key !== "Enter") return;
          e.preventDefault();
          // Resolving here promotes the next-newest pending approval to owner.
          // Stop immediate propagation so the SAME keypress doesn't then reach
          // that freshly-promoted card's listener and resolve it too — one
          // keypress resolves exactly one approval; the next owner waits for the
          // next press.
          e.stopImmediatePropagation();
          teardownMessage(state, message.id);
          if (e.key === "Escape") {
            deny();
          } else if (keyboardMode === "focused" || approvalConfig?.primaryAction === "allow-once" || e.metaKey || e.ctrlKey) {
            approve();
          } else {
            approve({ remember: true }); // Always allow
          }
        };
        state.keyHandlers.set(message.id, onKeydown);
        document.addEventListener("keydown", onKeydown);
      }

      signal?.addEventListener("abort", () => teardownMessage(state, message.id), { once: true });
      return card;
    },
  };

  // Release every pending approval's global listener + popover for THIS widget.
  const teardown = (): void => {
    for (const id of [...state.keyHandlers.keys(), ...state.popovers.keys()]) {
      teardownMessage(state, id);
    }
    state.latestPendingApprovalId = null;
  };

  return { plugin, teardown };
};
