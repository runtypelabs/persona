/**
 * History ("Messages") navigation view — the default visitor-facing surface
 * described in `docs/visitor-history-implementation-plan.md` D7.
 *
 * Scope split: this file owns the VIEW (list, grouping, paging, list-region
 * states, row/menu affordances, its own announcements and styles). The shell
 * owns placement, open/close, inertness of the obscured conversation, focus
 * orchestration between surfaces, confirmations, and every session mutation —
 * the view only invokes the callbacks below and awaits their promises.
 *
 * Never statically imported on the core path: the IIFE build marks
 * `@runtypelabs/persona/history-view` external and `build:client` marks the same
 * subpath external for ESM/CJS. The core reaches it through
 * `history-view-loader.ts`. Guarded by `history-view-bundle.test.ts`.
 */

import { injectStyles } from "../plugin-kit";
import { createNode, cx } from "../utils/dom";
import { createHistoryAnnouncer } from "./history-view/announcer";
import { HISTORY_VIEW_CSS } from "./history-view/css";
import {
  resolveHistoryViewCopy,
  type HistoryViewCopyInput,
  type ResolvedHistoryViewCopy,
} from "./history-view/copy";
import { groupConversations } from "./history-view/grouping";
import { historyIcon } from "./history-view/icons";
import {
  buildConversationRow,
  menuItemFocusKey,
  type RowPending,
} from "./history-view/rows";
import {
  buildStateBlock,
  toListState,
  type HistoryListState,
} from "./history-view/state";
import {
  isHistoryProviderError,
  type HistoryConversationSummary,
  type HistoryOperationContext,
  type HistoryProvider,
} from "../internal/history-provider";
import type { HistoryIdentityStatus } from "../types";

export type HistoryViewPresentation = "panel" | "rail";

export type HistoryViewPendingAction =
  | { kind: "refresh" | "load-more" | "start-new" | "clear" | "reset" }
  | { kind: "open" | "delete"; conversationId: string }
  | null;

export interface HistoryViewOptions {
  /** Internal seam (D9). The view never touches `AgentWidgetClient`. */
  provider: HistoryProvider;
  /** Resolved once when history opens; reused by every operation. */
  context: HistoryOperationContext;
  /** Canonical active target filter. `null` lists the whole authorized scope. */
  targetId: string | null;
  /** Host overrides; defaults are applied here, so passing a partial is fine. */
  copy?: HistoryViewCopyInput;
  /** Already resolved against the host container width by the shell, not here. */
  presentation: HistoryViewPresentation;
  showScopeStatus: boolean;
  activeConversationId: string | null;
  /** List page size. Default 25. */
  pageSize?: number;
  /** Clock seam for grouping and relative time. */
  now?: () => number;

  /** Row selection. The shell commits the open; the view shows row pending. */
  onSelect: (conversationId: string) => void | Promise<void>;
  onStartNew: () => void | Promise<void>;
  /** Back (panel) or close (rail). */
  onClose: () => void;
  /** Shell owns the confirmation; resolves with the outcome. */
  onRequestDeleteConversation: (
    conversationId: string
  ) => Promise<"deleted" | "cancelled">;
  onRequestClearHistory: () => Promise<"cleared" | "cancelled">;
  /** Rendered only when the provider exposes `resetDevice`. */
  onRequestResetIdentity?: () => Promise<
    { outcome: "cancelled" } | { outcome: "reset"; remoteRevocationConfirmed: boolean }
  >;
}

export interface HistoryViewHandle {
  element: HTMLElement;
  /** Re-fetch and re-render the list in place, preserving list/focus state. */
  refresh(): void;
  /** Keep the active-row indicator in sync when the shell changes conversation. */
  setActiveConversationId(conversationId: string | null): void;
  /** Enter/leave the post-deletion replacement-init recovery state. */
  setNewConversationRequired(required: boolean): void;
  destroy(): void;
}

const DEFAULT_PAGE_SIZE = 25;

function identityKey(status: HistoryIdentityStatus): string {
  return `${status.state}:${"reason" in status ? status.reason : ""}`;
}

function scopeCopy(
  status: HistoryIdentityStatus,
  copy: ResolvedHistoryViewCopy
): { title: string; description: string; pending: boolean } {
  switch (status.state) {
    case "verified":
      return {
        title: copy.verifiedTitle,
        description: copy.verifiedDescription,
        pending: false,
      };
    case "verifying":
    case "resetting":
      return {
        title: copy.verifyingTitle,
        description: copy.verifyingDescription,
        pending: true,
      };
    case "authentication_required":
      return {
        title: copy.authenticationRequiredTitle,
        description: copy.authenticationRequiredDescription,
        pending: false,
      };
    case "identity_provider_failed":
      return {
        title: copy.identityProviderFailedTitle,
        description: copy.identityProviderFailedDescription,
        pending: false,
      };
    case "configuration_error":
      return {
        title: copy.proofNotAdmittedTitle,
        description: copy.proofNotAdmittedDescription,
        pending: false,
      };
    case "unavailable":
      return {
        title: copy.unavailableTitle,
        description: copy.unavailableDescription,
        pending: false,
      };
    default:
      return {
        title: copy.browserOnlyTitle,
        description: copy.browserOnlyDescription,
        pending: false,
      };
  }
}

/** Identity states whose failure copy offers a retry. */
function identityRetryable(status: HistoryIdentityStatus): boolean {
  return (
    status.state === "authentication_required" ||
    status.state === "identity_provider_failed" ||
    status.state === "configuration_error"
  );
}

export function createHistoryView(
  options: HistoryViewOptions
): HistoryViewHandle {
  const copy = resolveHistoryViewCopy(options.copy);
  const now = options.now ?? (() => Date.now());
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const headingId = `persona-history-title-${Math.random().toString(36).slice(2, 8)}`;

  let items: HistoryConversationSummary[] = [];
  let nextCursor: string | null = null;
  let listState: HistoryListState = { kind: "loading", phase: "initial" };
  let pending: HistoryViewPendingAction = null;
  let activeConversationId = options.activeConversationId;
  let identityStatus = options.provider.getIdentityStatus();
  let renderedIdentityKey = identityKey(identityStatus);
  let openMenuId: string | null = null;
  let focusMenuOnRender = false;
  let destroyed = false;
  let listEpoch = 0;
  const rowErrors = new Map<string, { message: string; retry: () => void }>();
  let actionError: { message: string; retry: () => void } | null = null;

  const announcer = createHistoryAnnouncer();

  const busy = (): boolean => pending !== null;

  // --- static chrome (built once; never moves between list states) ---------

  const backButton = createNode("button", {
    className: "persona-history-icon-button persona-history-back",
    attrs: {
      type: "button",
      "data-persona-history-focus": "close",
      "aria-label":
        options.presentation === "rail" ? copy.closeLabel : copy.backLabel,
    },
  });
  backButton.appendChild(
    historyIcon(options.presentation === "rail" ? "x" : "arrow-left")
  );
  backButton.addEventListener("click", () => options.onClose());

  const title = createNode("h2", {
    className: "persona-history-title",
    text: copy.viewTitle,
    attrs: { id: headingId },
  });

  const scopeTitle = createNode("span", {
    className: "persona-history-scope-title",
  });
  const scopeLine = createNode(
    "p",
    { className: "persona-history-scope" },
    scopeTitle
  );

  const headingGroup = createNode(
    "div",
    { className: "persona-history-heading-group" },
    title,
    options.showScopeStatus ? scopeLine : null
  );

  const newIconButton = createNode("button", {
    className: "persona-history-icon-button persona-history-new-icon",
    attrs: {
      type: "button",
      "data-persona-history-focus": "new-icon",
      "aria-label": copy.newConversationLabel,
    },
  });
  newIconButton.appendChild(historyIcon("plus"));
  newIconButton.addEventListener("click", () => void startNew());

  const topbar = createNode(
    "div",
    { className: "persona-history-topbar" },
    backButton,
    headingGroup,
    newIconButton
  );

  /** Explanatory scope text + identity retry; below the bar, above the list. */
  const scopeBlock = createNode("div", {
    className: "persona-history-scope-alert",
  });

  const newConversationButton = createNode(
    "button",
    {
      className: "persona-history-new",
      attrs: { type: "button", "data-persona-history-focus": "new" },
    },
    createNode("span", { text: copy.newConversationLabel })
  );
  newConversationButton.appendChild(historyIcon("arrow-right", 18));
  newConversationButton.addEventListener("click", () => void startNew());

  const listRegion = createNode("div", {
    className: "persona-history-list-region",
  });

  const clearButton = createNode("button", {
    className: "persona-history-destructive persona-history-clear",
    text: copy.clearHistoryLabel,
    attrs: { type: "button", "data-persona-history-focus": "clear" },
  });
  clearButton.addEventListener("click", () => void clearHistory());

  const resetButton = options.provider.resetDevice
    ? createNode("button", {
        className: "persona-history-destructive persona-history-reset",
        text: copy.resetIdentityLabel,
        attrs: { type: "button", "data-persona-history-focus": "reset" },
      })
    : null;
  resetButton?.addEventListener("click", () => void resetIdentity());

  const footer = createNode(
    "div",
    { className: "persona-history-footer" },
    clearButton,
    resetButton
  );

  const body = createNode(
    "div",
    { className: "persona-history-body" },
    newConversationButton,
    listRegion,
    footer
  );

  const element = createNode(
    "div",
    {
      className: cx(
        "persona-history-view",
        `persona-history-view--${options.presentation}`,
        "persona-history-view--enter"
      ),
      attrs: {
        role: "region",
        "aria-labelledby": headingId,
        "data-persona-history-presentation": options.presentation,
      },
    },
    announcer.element,
    topbar,
    options.showScopeStatus ? scopeBlock : null,
    body
  );

  injectStyles(element, "persona-history-view", HISTORY_VIEW_CSS);

  // --- rendering ----------------------------------------------------------

  /** `aria-disabled` rather than `disabled`: a busy control keeps its focus. */
  const setInert = (target: HTMLElement | null, inert: boolean): void => {
    if (!target) return;
    if (inert) target.setAttribute("aria-disabled", "true");
    else target.removeAttribute("aria-disabled");
  };

  let scopeRenderedKey: string | null = null;

  const renderScope = (): void => {
    if (!options.showScopeStatus) return;
    // Rebuild only on a real identity change: a `verifying` block is live, and
    // re-rendering it on every list render would re-announce.
    const key = identityKey(identityStatus);
    if (key === scopeRenderedKey) return;
    scopeRenderedKey = key;
    const resolved = scopeCopy(identityStatus, copy);
    // Text is patched in place so a stable subtitle never re-announces.
    scopeTitle.textContent = resolved.title;
    scopeBlock.replaceChildren(
      createNode("span", {
        className: "persona-history-scope-description",
        text: resolved.description,
      })
    );
    if (resolved.pending) scopeBlock.setAttribute("role", "status");
    else scopeBlock.removeAttribute("role");
    scopeBlock.setAttribute("data-persona-history-identity", identityStatus.state);
    if (identityRetryable(identityStatus)) {
      const retry = createNode("button", {
        className: "persona-history-secondary persona-history-state-action",
        text: copy.retryIdentityLabel,
        attrs: { type: "button", "data-persona-history-focus": "identity-retry" },
      });
      retry.addEventListener("click", () => {
        if (busy()) return;
        void loadList("refresh");
      });
      scopeBlock.appendChild(retry);
    }
  };

  const rowPendingFor = (id: string): RowPending => {
    if (!pending) return null;
    if (pending.kind === "open" && pending.conversationId === id) return "opening";
    if (pending.kind === "delete" && pending.conversationId === id)
      return "deleting";
    return null;
  };

  const captureFocusKey = (): string | null => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !element.contains(active)) return null;
    return active.getAttribute("data-persona-history-focus");
  };

  const restoreFocus = (key: string | null): void => {
    if (focusMenuOnRender && openMenuId) {
      focusMenuOnRender = false;
      const item = listRegion.querySelector<HTMLElement>(
        `[data-persona-history-focus="${menuItemFocusKey(openMenuId)}"]`
      );
      if (item) {
        item.focus();
        return;
      }
    }
    if (!key) return;
    listRegion
      .querySelector<HTMLElement>(`[data-persona-history-focus="${key}"]`)
      ?.focus();
  };

  const buildActionError = (): HTMLElement | null => {
    if (!actionError) return null;
    const retry = createNode("button", {
      className: "persona-history-secondary persona-history-state-action",
      text: copy.retryLabel,
      attrs: { type: "button", "data-persona-history-focus": "action-retry" },
    });
    const failed = actionError;
    retry.addEventListener("click", () => {
      if (busy()) return;
      failed.retry();
    });
    return createNode(
      "div",
      { className: "persona-history-row-error", attrs: { role: "alert" } },
      createNode("span", { text: failed.message }),
      retry
    );
  };

  const buildGroups = (): HTMLElement[] =>
    groupConversations(items, now(), copy).map((group, index) => {
      const groupHeadingId = `${headingId}-g${index}`;
      const list = createNode("ul", {
        className: "persona-history-list",
        attrs: { "aria-labelledby": groupHeadingId },
      });
      for (const conversation of group.items) {
        list.appendChild(
          buildConversationRow({
            conversation,
            active: conversation.id === activeConversationId,
            pending: rowPendingFor(conversation.id),
            busy: busy(),
            menuOpen: openMenuId === conversation.id,
            error: rowErrors.get(conversation.id) ?? null,
            nowMs: now(),
            copy,
            onOpen: () => void openConversation(conversation.id),
            onToggleMenu: () => toggleMenu(conversation.id),
            onCloseMenu: (opts) => closeMenu(opts),
            onDelete: () => void deleteConversation(conversation.id),
          })
        );
      }
      return createNode(
        "div",
        {
          className: "persona-history-group",
          attrs: { "data-persona-history-group": group.key },
        },
        createNode("h3", {
          className: "persona-history-group-heading",
          text: group.label,
          attrs: { id: groupHeadingId },
        }),
        list
      );
    });

  const buildLoadMore = (): HTMLElement | null => {
    if (!nextCursor) return null;
    const loadingMore =
      pending?.kind === "load-more" ||
      (listState.kind === "loading" && listState.phase === "load-more");
    const button = createNode("button", {
      className: "persona-history-secondary persona-history-load-more",
      text: loadingMore ? copy.loadingMoreLabel : copy.loadMoreLabel,
      attrs: {
        type: "button",
        "data-persona-history-focus": "load-more",
        ...(loadingMore
          ? { "aria-busy": "true", "aria-disabled": "true" }
          : {}),
        ...(busy() && !loadingMore ? { "aria-disabled": "true" } : {}),
      },
    });
    button.addEventListener("click", () => {
      if (busy()) return;
      void loadList("load-more");
    });
    return button;
  };

  const renderList = (): void => {
    const focusKey = captureFocusKey();
    const children: Array<Node | null> = [buildActionError()];

    const hasRows = items.length > 0;
    if (hasRows) {
      children.push(...buildGroups());
      children.push(buildLoadMore());
    }

    const stateNeedsBlock =
      listState.kind !== "ready" &&
      !(listState.kind === "loading" && listState.phase !== "initial" && hasRows);
    if (stateNeedsBlock) {
      children.push(
        buildStateBlock({
          state: listState as Exclude<HistoryListState, { kind: "ready" }>,
          copy,
          identityStatus,
          busy: busy(),
          onRetry:
            listState.kind === "loading" ? undefined : () => void loadList("refresh"),
          onStartNew:
            listState.kind === "new_conversation_required"
              ? () => void startNew()
              : undefined,
        })
      );
    }

    listRegion.replaceChildren(...children.filter((node): node is Node => !!node));
    restoreFocus(focusKey);
  };

  const renderChrome = (): void => {
    setInert(newConversationButton, busy());
    setInert(newIconButton, busy());
    setInert(clearButton, busy());
    setInert(resetButton, busy());
    // Nothing to delete: keep the destructive control out of the empty state.
    clearButton.hidden = items.length === 0 && listState.kind === "empty";
    footer.hidden = clearButton.hidden && !resetButton;
  };

  const render = (): void => {
    if (destroyed) return;
    renderScope();
    renderChrome();
    renderList();
  };

  // --- menu ---------------------------------------------------------------

  const closeMenu = (opts?: { restoreFocus?: boolean }): void => {
    if (!openMenuId) return;
    const previous = openMenuId;
    openMenuId = null;
    focusMenuOnRender = false;
    render();
    if (opts?.restoreFocus) {
      listRegion
        .querySelector<HTMLElement>(
          `[data-persona-history-focus="menu:${previous}"]`
        )
        ?.focus();
    }
  };

  const toggleMenu = (conversationId: string): void => {
    if (openMenuId === conversationId) {
      closeMenu({ restoreFocus: true });
      return;
    }
    openMenuId = conversationId;
    focusMenuOnRender = true;
    render();
  };

  const onDocumentPointerDown = (event: Event): void => {
    if (!openMenuId) return;
    const target = event.target;
    if (target instanceof Node && element.contains(target)) {
      const item = (target as HTMLElement).closest?.(
        `[data-persona-history-item="${openMenuId}"]`
      );
      if (item) return;
    }
    closeMenu();
  };
  document.addEventListener("pointerdown", onDocumentPointerDown, true);

  const onRootKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !openMenuId) return;
    // Do not let the shell's Escape close the whole surface behind the menu.
    event.stopPropagation();
    closeMenu({ restoreFocus: true });
  };
  element.addEventListener("keydown", onRootKeydown);

  // --- data operations ----------------------------------------------------

  async function loadList(
    phase: "initial" | "refresh" | "load-more"
  ): Promise<void> {
    if (destroyed) return;
    const epoch = ++listEpoch;
    const cursor = phase === "load-more" ? nextCursor : null;
    if (phase === "load-more" && !cursor) return;
    pending = { kind: phase === "load-more" ? "load-more" : "refresh" };
    listState = { kind: "loading", phase };
    if (phase !== "load-more") {
      rowErrors.clear();
      actionError = null;
    }
    closeMenu();
    render();
    try {
      const result = await options.provider.list({
        limit: pageSize,
        context: options.context,
        ...(cursor ? { cursor } : {}),
        ...(options.targetId ? { targetId: options.targetId } : {}),
      });
      if (destroyed || epoch !== listEpoch) return;
      items = cursor ? [...items, ...result.items] : result.items;
      nextCursor = result.nextCursor;
      listState = items.length === 0 ? { kind: "empty" } : { kind: "ready" };
    } catch (error) {
      if (destroyed || epoch !== listEpoch) return;
      listState = toListState(error);
    } finally {
      if (!destroyed && epoch === listEpoch) {
        pending = null;
        render();
      }
    }
  }

  const removeConversation = (conversationId: string): void => {
    items = items.filter((item) => item.id !== conversationId);
    rowErrors.delete(conversationId);
    if (activeConversationId === conversationId) activeConversationId = null;
    if (items.length === 0 && !nextCursor) listState = { kind: "empty" };
  };

  async function openConversation(conversationId: string): Promise<void> {
    if (busy() || destroyed) return;
    rowErrors.delete(conversationId);
    closeMenu();
    pending = { kind: "open", conversationId };
    render();
    try {
      await options.onSelect(conversationId);
      if (destroyed) return;
      activeConversationId = conversationId;
    } catch {
      if (destroyed) return;
      rowErrors.set(conversationId, {
        message: copy.openFailedLabel,
        retry: () => void openConversation(conversationId),
      });
    } finally {
      if (!destroyed) {
        pending = null;
        render();
      }
    }
  }

  async function deleteConversation(conversationId: string): Promise<void> {
    if (busy() || destroyed) return;
    rowErrors.delete(conversationId);
    pending = { kind: "delete", conversationId };
    render();
    try {
      const outcome = await options.onRequestDeleteConversation(conversationId);
      if (destroyed) return;
      if (outcome === "deleted") {
        removeConversation(conversationId);
        announcer.announce(copy.conversationRemovedNotice);
      }
    } catch (error) {
      if (destroyed) return;
      // A 404 means the row is already gone: remove it without an error.
      if (isHistoryProviderError(error) && error.code === "not_found") {
        removeConversation(conversationId);
      } else {
        rowErrors.set(conversationId, {
          message: copy.deleteFailedLabel,
          retry: () => void deleteConversation(conversationId),
        });
      }
    } finally {
      if (!destroyed) {
        pending = null;
        render();
      }
    }
  }

  async function startNew(): Promise<void> {
    if (busy() || destroyed) return;
    actionError = null;
    closeMenu();
    pending = { kind: "start-new" };
    render();
    try {
      await options.onStartNew();
      if (destroyed) return;
      if (listState.kind === "new_conversation_required") {
        listState = items.length === 0 ? { kind: "empty" } : { kind: "ready" };
      }
    } catch {
      if (destroyed) return;
      actionError = {
        message: copy.errorDescription,
        retry: () => void startNew(),
      };
    } finally {
      if (!destroyed) {
        pending = null;
        render();
      }
    }
  }

  async function clearHistory(): Promise<void> {
    if (busy() || destroyed) return;
    actionError = null;
    closeMenu();
    pending = { kind: "clear" };
    render();
    try {
      const outcome = await options.onRequestClearHistory();
      if (destroyed) return;
      if (outcome === "cleared") {
        items = [];
        nextCursor = null;
        activeConversationId = null;
        listState = { kind: "empty" };
        announcer.announce(copy.historyClearedNotice);
      }
    } catch {
      if (destroyed) return;
      actionError = {
        message: copy.errorDescription,
        retry: () => void clearHistory(),
      };
    } finally {
      if (!destroyed) {
        pending = null;
        render();
      }
    }
  }

  async function resetIdentity(): Promise<void> {
    if (busy() || destroyed || !options.onRequestResetIdentity) return;
    actionError = null;
    closeMenu();
    pending = { kind: "reset" };
    render();
    try {
      const result = await options.onRequestResetIdentity();
      if (destroyed) return;
      if (result.outcome === "reset") {
        announcer.announce(
          result.remoteRevocationConfirmed
            ? copy.identityResetNotice
            : copy.identityResetUnconfirmedNotice
        );
        pending = null;
        await loadList("refresh");
        return;
      }
    } catch {
      if (destroyed) return;
      actionError = {
        message: copy.errorDescription,
        retry: () => void resetIdentity(),
      };
    } finally {
      if (!destroyed && pending?.kind === "reset") {
        pending = null;
        render();
      }
    }
  }

  // --- subscriptions ------------------------------------------------------

  const unsubscribeIdentity = options.provider.subscribeIdentityStatus(
    (status) => {
      if (destroyed) return;
      const key = identityKey(status);
      const changed = key !== renderedIdentityKey;
      identityStatus = status;
      renderedIdentityKey = key;
      render();
      // Announce only real transitions, and let `verifying` speak through its
      // own role="status" block instead of announcing twice.
      if (changed && status.state !== "verifying") {
        announcer.announce(scopeCopy(status, copy).title);
      }
    }
  );

  const unsubscribeAvailability = options.provider.subscribeAvailability?.(
    (available) => {
      if (destroyed) return;
      if (available) {
        void loadList("refresh");
        return;
      }
      items = [];
      nextCursor = null;
      listState = { kind: "error", reason: "unavailable", retryable: false };
      render();
    }
  );

  render();
  void loadList("initial");

  return {
    element,
    refresh: () => {
      void loadList("refresh");
    },
    setActiveConversationId: (conversationId) => {
      if (activeConversationId === conversationId) return;
      activeConversationId = conversationId;
      render();
    },
    setNewConversationRequired: (required) => {
      if (required) {
        listState = { kind: "new_conversation_required" };
      } else if (listState.kind === "new_conversation_required") {
        listState = items.length === 0 ? { kind: "empty" } : { kind: "ready" };
      }
      render();
    },
    destroy: () => {
      destroyed = true;
      listEpoch += 1;
      unsubscribeIdentity();
      unsubscribeAvailability?.();
      document.removeEventListener("pointerdown", onDocumentPointerDown, true);
      element.removeEventListener("keydown", onRootKeydown);
      announcer.destroy();
      element.remove();
      element.replaceChildren();
    },
  };
}
