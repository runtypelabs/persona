import type { AgentWidgetController, ComposerQuote } from "@runtypelabs/persona";
import {
  createPopover,
  injectStyles,
  type PopoverHandle,
} from "@runtypelabs/persona/plugin-kit";

/**
 * Blueprint: a floating "ask about this" toolbar for text selections on the
 * host page. Copy this file into your project and point it at a container.
 *
 * This is a host-page companion, not an `AgentWidgetPlugin`. Deliberately so:
 * every plugin hook renders UI inside the widget, and plugins never receive
 * the controller. A selection toolbar lives outside the widget and needs the
 * controller, so it follows the companion convention instead (create, then
 * `attach(controller)`).
 *
 * Integration is one call in either setup:
 *
 * - Bundler: `createSelectionExplainPlugin({ container: "#article", controller })`
 *   with the handle returned by `initAgentWidget()`.
 * - Script tag: `createSelectionExplainPlugin({ container: "#article" })`.
 *   It attaches itself when the installer fires `persona:chat-ready`.
 *
 * `persona:chat-ready` fires once, so create the companion before the widget
 * initializes. If it may run later, pass `controller`, call `attach()`, or set
 * `windowKey` to adopt an already-mounted widget from `window[windowKey]`. The
 * toolbar stays hidden until a controller is attached — it never renders
 * actions that would silently do nothing.
 *
 * Each action stages the selection with `controller.setQuote()`. A `"send"`
 * action then calls `submitMessage(prompt)`; a `"draft"` action calls
 * `focusInput()` so the visitor types the question. The quote rides the send
 * as a ```quoted-text``` block in the same user turn.
 *
 * Customization points, in order of usefulness:
 * - `actions` replaces the toolbar buttons, labels, and prompts.
 * - `sourceLabel` sets the quote attribution (static or per-selection).
 * - `shouldShow` filters selections (e.g. skip code blocks).
 * - `className` adds your own class; style via `.selection-explain*` rules.
 *   Colors already follow the `--persona-*` theme variables.
 */

export type SelectionExplainMode = "send" | "draft";

export type SelectionExplainAction = {
  id: string;
  label: string;
  /** Message submitted with the quoted selection. Required for `"send"`. */
  prompt?: string;
  /** `"send"` submits `prompt` immediately. `"draft"` focuses the composer. */
  mode: SelectionExplainMode;
};

export type SelectionExplainOptions = {
  /** Element (or selector) whose selections trigger the toolbar. Resolved lazily. */
  container: string | HTMLElement;
  /** Widget handle from `initAgentWidget()`. Omit to rely on auto-attach. */
  controller?: AgentWidgetController;
  /**
   * Attach automatically when `persona:chat-ready` fires (script-tag installs
   * dispatch it with the controller). Default true. An explicit `controller`
   * or `attach()` call always wins.
   */
  autoAttach?: boolean;
  /**
   * Installer `windowKey` holding the widget handle. Checked lazily, so a
   * companion created after `persona:chat-ready` already fired can still
   * adopt the mounted widget.
   */
  windowKey?: string;
  /** Quote-banner attribution (e.g. the article title). Static or per-selection. */
  sourceLabel?: string | ((selectionText: string) => string);
  /** Minimum selected characters before the toolbar appears. Default 8. */
  minLength?: number;
  /** Selections are truncated to this many characters. Default 1000. */
  maxLength?: number;
  /** Toolbar actions, in display order. Replaces `DEFAULT_SELECTION_ACTIONS`. */
  actions?: SelectionExplainAction[];
  /** Veto a selection (return false to keep the toolbar hidden). */
  shouldShow?: (context: { text: string; range: Range }) => boolean;
  /** Extra class for the toolbar element, for host CSS overrides. */
  className?: string;
  /** Observer hook, fired after an action runs (logging, analytics). */
  onAction?: (action: SelectionExplainAction, selectionText: string) => void;
};

export type SelectionExplainHandle = {
  /** Point the toolbar at a live widget. Safe to call again after a remount. */
  attach: (controller: AgentWidgetController) => void;
  /** Remove listeners, the toolbar, and the anchor. The handle is inert afterward. */
  destroy: () => void;
};

export const DEFAULT_SELECTION_ACTIONS: SelectionExplainAction[] = [
  {
    id: "explain",
    label: "Explain this",
    prompt: "Explain the highlighted passage to me in plain language.",
    mode: "send",
  },
  {
    id: "ask",
    label: "Ask about it",
    mode: "draft",
  },
];

const STYLE_ID = "persona-selection-explain";
const STYLES = `
.selection-explain {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  padding: 0.25rem;
  border-radius: 999px;
  background: var(--persona-surface, #ffffff);
  border: 1px solid var(--persona-border, rgba(0, 0, 0, 0.12));
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
}
.selection-explain__action {
  border: none;
  border-radius: 999px;
  background: transparent;
  padding: 0.35rem 0.7rem;
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1;
  color: var(--persona-text, #0f172a);
  cursor: pointer;
  white-space: nowrap;
}
.selection-explain__action:hover,
.selection-explain__action:focus-visible {
  background: var(--persona-button-ghost-hover-bg, rgba(0, 0, 0, 0.06));
}
.selection-explain__action--primary {
  background: var(--persona-text, #111827);
  color: var(--persona-surface, #ffffff);
}
.selection-explain__action--primary:hover,
.selection-explain__action--primary:focus-visible {
  background: var(--persona-text, #1f2937);
  opacity: 0.92;
}
`;

/** Collapse runs of whitespace so a multi-paragraph drag quotes cleanly. */
function normalizeSelectionText(raw: string, maxLength: number): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

function rangeWithin(range: Range, container: HTMLElement): boolean {
  const node = range.commonAncestorContainer;
  const element = node instanceof Element ? node : node.parentElement;
  return !!element && container.contains(element);
}

export function createSelectionExplainPlugin(
  options: SelectionExplainOptions
): SelectionExplainHandle {
  const {
    minLength = 8,
    maxLength = 1000,
    actions = DEFAULT_SELECTION_ACTIONS,
    autoAttach = true,
    shouldShow,
    onAction,
  } = options;

  let controller: AgentWidgetController | null = options.controller ?? null;
  let popover: PopoverHandle | null = null;
  let currentText = "";
  let evaluateTimer: number | null = null;
  let destroyed = false;

  // `persona:chat-ready` fires once; a companion created after it has missed
  // the event. `windowKey` closes that race: the installer stores the handle
  // on `window[windowKey]`, so check there lazily as the fallback.
  const resolveController = (): AgentWidgetController | null => {
    if (controller) return controller;
    if (options.windowKey) {
      const handle = (window as unknown as Record<string, unknown>)[
        options.windowKey
      ];
      if (handle) controller = handle as AgentWidgetController;
    }
    return controller;
  };

  // Resolved on every evaluation, so the toolbar survives SPA re-renders and
  // containers that mount after this call.
  const resolveContainer = (): HTMLElement | null => {
    if (typeof options.container === "string") {
      return document.querySelector<HTMLElement>(options.container);
    }
    return options.container;
  };

  // Zero-size marker tracking the selection rect in page coordinates, so the
  // plugin-kit popover (which positions off `anchor.getBoundingClientRect()`
  // and repositions on scroll) can treat the selection like any element.
  const anchor = document.createElement("span");
  anchor.setAttribute("aria-hidden", "true");
  anchor.style.position = "absolute";
  anchor.style.pointerEvents = "none";
  document.body.appendChild(anchor);
  injectStyles(anchor, STYLE_ID, STYLES);

  const resolveSourceLabel = (text: string): string | undefined => {
    const { sourceLabel } = options;
    if (typeof sourceLabel === "function") return sourceLabel(text);
    return sourceLabel;
  };

  const buildQuote = (): ComposerQuote => ({
    text: currentText,
    sourceLabel: resolveSourceLabel(currentText),
  });

  const dismiss = (): void => {
    popover?.close();
  };

  const runAction = (action: SelectionExplainAction): void => {
    const active = resolveController();
    if (!active || !currentText) return;
    const text = currentText;

    active.setQuote(buildQuote());
    active.open();

    if (action.mode === "send" && action.prompt) {
      // `submitMessage` refuses while a reply is streaming (it returns false
      // and the composer keeps the staged quote), so fall back to the draft
      // flow instead of dropping the visitor's selection on the floor.
      if (!active.submitMessage(action.prompt)) active.focusInput();
    } else {
      active.focusInput();
    }

    window.getSelection()?.removeAllRanges();
    dismiss();
    onAction?.(action, text);
  };

  const toolbar = document.createElement("div");
  toolbar.className = options.className
    ? `selection-explain ${options.className}`
    : "selection-explain";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Ask the assistant about this selection");
  // A pointerdown on the toolbar would collapse the document selection before
  // `click` fires (closing the toolbar out from under its own buttons), so
  // swallow it: buttons still receive `click` on pointerup.
  toolbar.addEventListener("pointerdown", (event) => event.preventDefault());
  for (const action of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      action.mode === "send"
        ? "selection-explain__action selection-explain__action--primary"
        : "selection-explain__action";
    button.textContent = action.label;
    button.addEventListener("click", () => runAction(action));
    toolbar.appendChild(button);
  }

  const evaluate = (): void => {
    if (destroyed) return;
    // No controller yet (widget not mounted, or the ready event was missed):
    // keep the toolbar hidden rather than show actions that would no-op.
    if (!resolveController()) {
      dismiss();
      return;
    }
    const container = resolveContainer();
    const selection = window.getSelection();
    if (
      !container ||
      !selection ||
      selection.isCollapsed ||
      selection.rangeCount === 0
    ) {
      dismiss();
      return;
    }
    const range = selection.getRangeAt(0);
    if (!rangeWithin(range, container)) {
      dismiss();
      return;
    }
    const text = normalizeSelectionText(selection.toString(), maxLength);
    if (text.length < minLength) {
      dismiss();
      return;
    }
    if (shouldShow && !shouldShow({ text, range })) {
      dismiss();
      return;
    }

    currentText = text;
    const rect = range.getBoundingClientRect();
    anchor.style.left = `${rect.left + window.scrollX}px`;
    anchor.style.top = `${rect.top + window.scrollY}px`;
    anchor.style.width = `${rect.width}px`;
    anchor.style.height = `${rect.height}px`;

    if (!popover) {
      popover = createPopover({
        anchor,
        content: toolbar,
        placement: "top-start",
        offset: 8,
      });
    }
    popover.open();
    popover.reposition();
  };

  // `selectionchange` fires continuously mid-drag; debounce so the toolbar
  // appears once the selection settles. It also fires on collapse (a plain
  // click), which is what dismisses the toolbar.
  const handleSelectionChange = (): void => {
    if (evaluateTimer !== null) window.clearTimeout(evaluateTimer);
    evaluateTimer = window.setTimeout(() => {
      evaluateTimer = null;
      evaluate();
    }, 180);
  };
  document.addEventListener("selectionchange", handleSelectionChange);

  // Script-tag installs dispatch `persona:chat-ready` with the controller as
  // `event.detail`. Auto-attaching on it makes those installs zero-wiring.
  // Direct `initAgentWidget()` callers pass `controller` (or call `attach`)
  // because direct init does not dispatch the event.
  const handleChatReady = (event: Event): void => {
    if (controller) return;
    const detail = (event as CustomEvent<AgentWidgetController>).detail;
    if (detail) {
      controller = detail;
      clearWarnTimer();
    }
  };
  if (autoAttach) {
    window.addEventListener("persona:chat-ready", handleChatReady);
  }

  // A companion created after `persona:chat-ready` fired, with no `controller`
  // and no `windowKey`, has no channel to the widget: the toolbar just stays
  // hidden. Silent failure is undiagnosable, so tell the developer what to
  // wire up if nothing attaches within the grace period.
  let warnTimer: number | null = null;
  const clearWarnTimer = (): void => {
    if (warnTimer !== null) {
      window.clearTimeout(warnTimer);
      warnTimer = null;
    }
  };
  if (autoAttach && !controller) {
    warnTimer = window.setTimeout(() => {
      warnTimer = null;
      if (destroyed || resolveController()) return;
      console.warn(
        "[selection-explain] No widget controller attached after 4s; the toolbar will stay hidden. " +
          "Pass `controller` (from initAgentWidget), call `attach(handle)`, or set `windowKey` to match " +
          "your installer config. Script-tag installs must create this companion before the widget " +
          "mounts so it can catch `persona:chat-ready`."
      );
    }, 4000);
  }

  return {
    attach(next: AgentWidgetController) {
      controller = next;
      clearWarnTimer();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      document.removeEventListener("selectionchange", handleSelectionChange);
      window.removeEventListener("persona:chat-ready", handleChatReady);
      clearWarnTimer();
      if (evaluateTimer !== null) window.clearTimeout(evaluateTimer);
      popover?.destroy();
      popover = null;
      anchor.remove();
      controller = null;
    },
  };
}
