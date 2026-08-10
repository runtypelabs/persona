/**
 * Conversation row + its overflow menu.
 *
 * The row is a whole-row button; the overflow trigger is a SIBLING absolutely
 * positioned over it, because a button cannot legally nest inside a button.
 *
 * v1 hierarchy (plan D7 "beta hierarchy"): `updatedAt`/preview read as primary
 * and the server title as secondary, unconditionally. Titles are frequently
 * placeholders and nothing may derive a title or preview locally, so the
 * hierarchy is a fixed rendering choice rather than a heuristic on the string.
 */

import { createNode, cx } from "../../utils/dom";
import { historyIcon } from "./icons";
import { formatMessageCount, formatRelativeTime } from "./grouping";
import type { ResolvedHistoryViewCopy } from "./copy";
import type { HistoryConversationSummary } from "../../internal/history-provider";

export type RowPending = "opening" | "deleting" | null;

export interface ConversationRowOptions {
  conversation: HistoryConversationSummary;
  active: boolean;
  pending: RowPending;
  /** A view-level action is in flight; every row action is inert. */
  busy: boolean;
  menuOpen: boolean;
  /** Row-adjacent, retryable failure text. */
  error: { message: string; retry: () => void } | null;
  nowMs: number;
  copy: ResolvedHistoryViewCopy;
  onOpen: () => void;
  onToggleMenu: () => void;
  onCloseMenu: (options?: { restoreFocus?: boolean }) => void;
  onDelete: () => void;
}

export const rowFocusKey = (id: string): string => `row:${id}`;
export const menuFocusKey = (id: string): string => `menu:${id}`;
export const menuItemFocusKey = (id: string): string => `menu-item:${id}`;

export function buildConversationRow(
  options: ConversationRowOptions
): HTMLLIElement {
  const { conversation, copy, busy, pending } = options;
  const inert = busy || pending !== null;

  const head = createNode(
    "div",
    { className: "persona-history-row-head" },
    createNode("span", {
      className: "persona-history-row-title persona-history-truncate",
      text: conversation.title,
    }),
    createNode("time", {
      className: "persona-history-row-time",
      attrs: { datetime: conversation.updatedAt },
      text: formatRelativeTime(conversation.updatedAt, options.nowMs, copy),
    })
  );

  const preview = conversation.preview
    ? createNode("span", {
        className: "persona-history-row-preview persona-history-clamp",
        text: conversation.preview,
      })
    : null;

  const rowButton = createNode(
    "button",
    {
      className: cx(
        "persona-history-row",
        options.active && "persona-history-row--active",
        pending && `persona-history-row--${pending}`
      ),
      attrs: {
        type: "button",
        "data-persona-history-focus": rowFocusKey(conversation.id),
        "data-persona-history-conversation": conversation.id,
        ...(options.active ? { "aria-current": "page" } : {}),
        ...(inert ? { "aria-disabled": "true" } : {}),
        ...(pending ? { "aria-busy": "true" } : {}),
      },
    },
    head,
    preview,
    createNode("span", {
      className: "persona-history-row-count persona-history-sr-only",
      text: formatMessageCount(conversation.messageCount, copy),
    })
  );
  rowButton.addEventListener("click", () => {
    if (inert) return;
    options.onOpen();
  });

  const menuButton = createNode("button", {
    className: "persona-history-icon-button persona-history-row-menu-button",
    attrs: {
      type: "button",
      "aria-label": `${copy.rowActionsLabel}: ${conversation.title}`,
      "aria-haspopup": "menu",
      "aria-expanded": options.menuOpen ? "true" : "false",
      "data-persona-history-focus": menuFocusKey(conversation.id),
      ...(inert ? { "aria-disabled": "true" } : {}),
    },
  });
  menuButton.appendChild(historyIcon("ellipsis"));
  menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (inert) return;
    options.onToggleMenu();
  });
  menuButton.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (inert || options.menuOpen) return;
    options.onToggleMenu();
  });

  const item = createNode(
    "li",
    {
      className: "persona-history-item",
      attrs: { "data-persona-history-item": conversation.id },
    },
    rowButton,
    menuButton,
    options.menuOpen ? buildRowMenu(options) : null,
    options.error ? buildRowError(options.error, copy, conversation.id) : null
  );
  return item;
}

function buildRowMenu(options: ConversationRowOptions): HTMLElement {
  const { conversation, copy } = options;
  const deleteItem = createNode("button", {
    className: "persona-history-menu-item",
    text: copy.deleteConversationLabel,
    attrs: {
      type: "button",
      role: "menuitem",
      tabindex: "0",
      "data-persona-history-focus": menuItemFocusKey(conversation.id),
    },
  });
  deleteItem.addEventListener("click", () => {
    options.onCloseMenu();
    options.onDelete();
  });

  const menu = createNode(
    "div",
    {
      className: "persona-history-menu",
      attrs: {
        role: "menu",
        "aria-label": `${copy.rowActionsLabel}: ${conversation.title}`,
      },
    },
    deleteItem
  );

  menu.addEventListener("keydown", (event) => {
    const items = Array.from(
      menu.querySelectorAll<HTMLElement>('[role="menuitem"]')
    );
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    // Escape is handled at the view root so it can stop propagation before the
    // shell's own Escape handler sees it.
    if (event.key === "Tab") {
      options.onCloseMenu({ restoreFocus: true });
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1 + items.length) % items.length]?.focus();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  });
  return menu;
}

function buildRowError(
  error: { message: string; retry: () => void },
  copy: ResolvedHistoryViewCopy,
  conversationId: string
): HTMLElement {
  const retry = createNode("button", {
    className: "persona-history-secondary persona-history-state-action",
    text: copy.retryLabel,
    attrs: {
      type: "button",
      "data-persona-history-focus": `row-retry:${conversationId}`,
    },
  });
  retry.addEventListener("click", error.retry);
  return createNode(
    "div",
    {
      className: "persona-history-row-error",
      attrs: { role: "alert" },
    },
    createNode("span", { text: error.message }),
    retry
  );
}
