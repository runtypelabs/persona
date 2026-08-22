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
  // Filled miniature of the chunk's stroke star; sr text reuses the group label.
  const starMark = conversation.starred
    ? (() => {
        const glyph = historyIcon("star", 11);
        glyph.setAttribute("fill", "currentColor");
        glyph.setAttribute("stroke-width", "1");
        return createNode(
          "span",
          { className: "persona-history-row-star" },
          glyph,
          createNode("span", {
            className: "persona-history-sr-only",
            text: copy.groupStarred,
          })
        );
      })()
    : null;

  const head = createNode(
    "div",
    { className: "persona-history-row-head" },
    createNode("span", {
      className: "persona-history-row-title persona-history-truncate",
      text: titled ? conversation.title : (conversation.preview ?? ""),
    }),
    starMark,
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

  const menuButton = options.showDelete
    ? buildMenuTrigger({
        className: "persona-history-row-menu-button",
        label: `${copy.rowActionsLabel}: ${conversation.title}`,
        focusKey: menuFocusKey(conversation.id),
        open: options.menuOpen,
        inert,
        onToggle: options.onToggleMenu,
      })
    : null;

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
  return buildOverflowMenu({
    label: `${copy.rowActionsLabel}: ${conversation.title}`,
    items: [
      {
        label: copy.deleteConversationLabel,
        focusKey: menuItemFocusKey(conversation.id),
        danger: true,
        onSelect: options.onDelete,
      },
    ],
    onCloseMenu: options.onCloseMenu,
  });
}

export interface MenuTriggerOptions {
  /** Added to the shared icon-button class. */
  className: string;
  label: string;
  focusKey: string;
  open: boolean;
  /** Keeps focus but does not open. Read live, so an owner may re-set it. */
  inert: boolean;
  iconSize?: number;
  onToggle: () => void;
}

/**
 * The ellipsis trigger both menus hang off. State is read back from the
 * element, so an owner that mutates the attributes in place stays consistent.
 */
export function buildMenuTrigger(options: MenuTriggerOptions): HTMLElement {
  const button = createNode("button", {
    className: cx("persona-history-icon-button", options.className),
    attrs: {
      type: "button",
      "aria-label": options.label,
      "aria-haspopup": "menu",
      "aria-expanded": options.open ? "true" : "false",
      "data-persona-history-focus": options.focusKey,
      ...(options.inert ? { "aria-disabled": "true" } : {}),
    },
  });
  button.appendChild(historyIcon("ellipsis", options.iconSize));
  const blocked = (): boolean =>
    button.getAttribute("aria-disabled") === "true";
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (blocked()) return;
    options.onToggle();
  });
  button.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (blocked() || button.getAttribute("aria-expanded") === "true") return;
    options.onToggle();
  });
  return button;
}

export interface HistoryMenuItemSpec {
  label: string;
  /** `data-persona-history-focus` value, so a re-render can land focus back. */
  focusKey: string;
  /** Destructive (red) styling. Host list actions default to neutral text. */
  danger?: boolean;
  onSelect: () => void;
}

export interface OverflowMenuOptions {
  /** Accessible name of the menu itself. */
  label: string;
  items: HistoryMenuItemSpec[];
  onCloseMenu: (options?: { restoreFocus?: boolean }) => void;
}

/**
 * The one popover shape this view uses: rows and the list-level trigger share
 * it, so keyboard behaviour is defined once.
 */
export function buildOverflowMenu(options: OverflowMenuOptions): HTMLElement {
  const menu = createNode("div", {
    className: "persona-history-menu",
    attrs: { role: "menu", "aria-label": options.label },
  });

  for (const spec of options.items) {
    const item = createNode("button", {
      className: cx(
        "persona-history-menu-item",
        spec.danger && "persona-history-menu-item--danger"
      ),
      text: spec.label,
      attrs: {
        type: "button",
        role: "menuitem",
        tabindex: "0",
        "data-persona-history-focus": spec.focusKey,
      },
    });
    item.addEventListener("click", () => {
      options.onCloseMenu();
      spec.onSelect();
    });
    menu.appendChild(item);
  }

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
