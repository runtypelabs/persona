/**
 * Conversation row + its overflow menu.
 *
 * The row is a whole-row button; the overflow trigger is a SIBLING absolutely
 * positioned over it, because a button cannot legally nest inside a button.
 *
 * Hierarchy: avatar, then title over preview with the relative time aligned to
 * the title. A conversation without a server title promotes its preview to the
 * title line rather than rendering an empty one; nothing is derived locally.
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
  /** Image URL or glyph for the leading avatar; empty/false omits the block. */
  avatar: string | false | undefined;
  /** Row overflow menu (delete). False drops the trigger entirely. */
  showDelete: boolean;
  nowMs: number;
  copy: ResolvedHistoryViewCopy;
  onOpen: () => void;
  onToggleMenu: () => void;
  onCloseMenu: (options?: { restoreFocus?: boolean }) => void;
  onDelete: () => void;
}

/** Same source shape as the header icon: a URL renders as an image, else a glyph. */
const AVATAR_URL = /^(https?:|\/|data:)/i;

function buildAvatar(source: string): HTMLElement {
  const holder = createNode("span", {
    className: "persona-history-row-avatar",
    attrs: { "aria-hidden": "true" },
  });
  if (AVATAR_URL.test(source)) {
    holder.appendChild(
      createNode("img", { attrs: { src: source, alt: "", loading: "lazy" } })
    );
  } else {
    holder.textContent = source;
  }
  return holder;
}

export const rowFocusKey = (id: string): string => `row:${id}`;
export const menuFocusKey = (id: string): string => `menu:${id}`;
export const menuItemFocusKey = (id: string): string => `menu-item:${id}`;

export function buildConversationRow(
  options: ConversationRowOptions
): HTMLLIElement {
  const { conversation, copy, busy, pending } = options;
  const inert = busy || pending !== null;

  // A placeholder-titled conversation promotes its preview instead of showing
  // an empty title line above it.
  const titled = conversation.title.trim().length > 0;
  const head = createNode(
    "div",
    { className: "persona-history-row-head" },
    createNode("span", {
      className: "persona-history-row-title persona-history-truncate",
      text: titled ? conversation.title : (conversation.preview ?? ""),
    }),
    createNode("time", {
      className: "persona-history-row-time",
      attrs: { datetime: conversation.updatedAt },
      text: formatRelativeTime(conversation.updatedAt, options.nowMs, copy),
    })
  );

  const preview =
    titled && conversation.preview
      ? createNode("span", {
          className: "persona-history-row-preview persona-history-truncate",
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
    options.avatar ? buildAvatar(options.avatar) : null,
    createNode(
      "div",
      { className: "persona-history-row-body" },
      head,
      preview,
      createNode("span", {
        className: "persona-history-row-count persona-history-sr-only",
        text: formatMessageCount(conversation.messageCount, copy),
      })
    )
  );
  rowButton.addEventListener("click", () => {
    if (inert) return;
    options.onOpen();
  });

  let menuButton: HTMLElement | null = null;
  if (options.showDelete) {
    menuButton = createNode("button", {
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
  }

  const item = createNode(
    "li",
    {
      className: cx(
        "persona-history-item",
        !options.showDelete && "persona-history-item--no-menu"
      ),
      attrs: { "data-persona-history-item": conversation.id },
    },
    rowButton,
    menuButton,
    options.menuOpen && options.showDelete ? buildRowMenu(options) : null,
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
