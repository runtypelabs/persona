import type {
  AgentWidgetPlugin,
  AgentWidgetRenderHistoryViewContext,
} from "@runtypelabs/persona";
import { injectStyles } from "@runtypelabs/persona/plugin-kit";

/**
 * Blueprint: a ChatGPT-style thread rail that replaces Persona's Messages view
 * through `renderHistoryView`, using public hooks only.
 *
 * The plugin owns nothing but DOM. Persona still owns orchestration: it loads
 * the chunk, resolves the presentation, places the element, runs Escape and
 * focus, opens every destructive confirmation, and enforces the selection
 * epochs behind `context.actions`. There is no provider, controller, or
 * internal registry access anywhere in this file, and no history state is
 * cached across renders: `context` is a frozen snapshot and Persona re-invokes
 * the renderer whenever it changes.
 *
 * One renderer covers both placements. `context.presentation` is `"rail"` for
 * the side column and `"panel"` when the same surface has to reflow into the
 * conversation body (narrow hosts, floating launchers), which only changes the
 * dismiss control and the row density.
 */

const CLASS = "persona-threads";

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const RELATIVE_UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

/** Localized relative time. Empty string for a value that will not parse. */
const relativeTime = (iso: string): string => {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diff = then - Date.now();
  const absolute = Math.abs(diff);
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (absolute >= ms) return format.format(Math.round(diff / ms), unit);
  }
  return format.format(0, "second");
};

/** Non-ready list states, worded from `context.copy` so overrides still apply. */
const stateCopy = (
  context: AgentWidgetRenderHistoryViewContext,
): { title: string; description: string; retry: boolean } | null => {
  const { state, copy } = context;
  switch (state.kind) {
    case "ready":
      return null;
    case "loading":
      return { title: copy.loadingLabel, description: "", retry: false };
    case "empty":
      return {
        title: copy.emptyTitle,
        description: copy.emptyDescription,
        retry: false,
      };
    case "rate_limited":
      return {
        title: copy.rateLimitedTitle,
        description: copy.rateLimitedDescription,
        retry: true,
      };
    case "new_conversation_required":
      return {
        title: copy.newConversationRequiredTitle,
        description: copy.newConversationRequiredDescription,
        retry: false,
      };
    default:
      return {
        title: copy.errorTitle,
        description: copy.errorDescription,
        retry: state.retryable,
      };
  }
};

function buildRow(
  context: AgentWidgetRenderHistoryViewContext,
  conversation: AgentWidgetRenderHistoryViewContext["conversations"][number],
  busy: boolean,
): HTMLElement {
  const pending = context.pendingAction;
  const rowPending =
    pending &&
    "conversationId" in pending &&
    pending.conversationId === conversation.id
      ? pending.kind
      : null;
  const active = conversation.id === context.activeConversationId;
  const inert = busy || rowPending !== null;

  const item = el("li", `${CLASS}__item`);

  const open = el("button", `${CLASS}__row`);
  open.type = "button";
  if (active) open.setAttribute("aria-current", "page");
  if (inert) open.setAttribute("aria-disabled", "true");
  if (rowPending) open.setAttribute("aria-busy", "true");
  open.append(
    el("span", `${CLASS}__row-title`, conversation.title),
    ...(conversation.preview
      ? [el("span", `${CLASS}__row-preview`, conversation.preview)]
      : []),
  );
  open.addEventListener("click", () => {
    if (inert) return;
    void context.actions.openConversation(conversation.id);
  });

  const time = el("time", `${CLASS}__row-time`, relativeTime(conversation.updatedAt));
  time.dateTime = conversation.updatedAt;

  // A sibling, never a nested button: the row itself is already a button.
  const remove = el("button", `${CLASS}__row-delete`, "×");
  remove.type = "button";
  remove.setAttribute(
    "aria-label",
    `${context.copy.deleteConversationLabel}: ${conversation.title}`,
  );
  if (inert) remove.setAttribute("aria-disabled", "true");
  remove.addEventListener("click", (event) => {
    event.stopPropagation();
    if (inert) return;
    // Persona owns the confirmation dialog, its focus trap, and the announce.
    void context.actions.requestDeleteConversation(conversation.id);
  });

  item.append(open, time, remove);
  return item;
}

/**
 * The plugin instance. `renderHistoryView` returning an element wins
 * arbitration outright, so Persona's default Messages view never renders.
 */
export function createThreadRailPlugin(): AgentWidgetPlugin {
  return {
    id: "demo-thread-rail",
    renderHistoryView: (context) => {
      const { copy, presentation, actions } = context;
      const busy = context.pendingAction !== null;

      const root = el("div", `${CLASS} ${CLASS}--${presentation}`);
      injectStyles(root, "persona-thread-rail-plugin", THREAD_RAIL_CSS);

      const header = el("header", `${CLASS}__header`);
      header.append(el("h2", `${CLASS}__title`, copy.viewTitle));
      // Rail dismisses itself; panel returns to whatever opened Messages.
      const dismiss = el(
        "button",
        `${CLASS}__dismiss`,
        presentation === "rail" ? copy.closeLabel : copy.backLabel,
      );
      dismiss.type = "button";
      dismiss.addEventListener("click", () => actions.close());
      header.append(dismiss);

      const create = el("button", `${CLASS}__new`, copy.newConversationLabel);
      create.type = "button";
      if (busy) create.setAttribute("aria-disabled", "true");
      create.addEventListener("click", () => {
        if (busy) return;
        void actions.startNewConversation();
      });

      const body = el("div", `${CLASS}__body`);
      const state = stateCopy(context);
      if (state) {
        const block = el("div", `${CLASS}__state`);
        block.setAttribute("role", "status");
        block.append(el("p", `${CLASS}__state-title`, state.title));
        if (state.description) {
          block.append(el("p", `${CLASS}__state-description`, state.description));
        }
        if (state.retry) {
          const retry = el("button", `${CLASS}__secondary`, copy.retryLabel);
          retry.type = "button";
          retry.addEventListener("click", () => void actions.refresh());
          block.append(retry);
        }
        body.append(block);
      }

      if (context.conversations.length > 0) {
        const list = el("ul", `${CLASS}__list`);
        for (const conversation of context.conversations) {
          list.append(buildRow(context, conversation, busy));
        }
        body.append(list);
      }

      if (context.nextCursor) {
        const more = el(
          "button",
          `${CLASS}__secondary`,
          context.pendingAction?.kind === "load-more"
            ? copy.loadingMoreLabel
            : copy.loadMoreLabel,
        );
        more.type = "button";
        if (busy) more.setAttribute("aria-disabled", "true");
        more.addEventListener("click", () => {
          if (busy) return;
          void actions.loadMore();
        });
        body.append(more);
      }

      const footer = el("footer", `${CLASS}__footer`);
      const clear = el("button", `${CLASS}__danger`, copy.clearHistoryLabel);
      clear.type = "button";
      if (busy) clear.setAttribute("aria-disabled", "true");
      clear.addEventListener("click", () => {
        if (busy) return;
        void actions.requestClearConversationHistory();
      });
      footer.append(clear);

      root.append(header, create, body, footer);
      return root;
    },
  };
}

const THREAD_RAIL_CSS = `
.persona-threads {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 12px;
  overflow: hidden;
  background: var(--persona-container, #f7f7f8);
  color: var(--persona-text, #111827);
  font-family: var(--persona-font-family, inherit);
  font-size: 14px;
}
.persona-threads * { box-sizing: border-box; }
.persona-threads--rail {
  border-right: 1px solid var(--persona-divider, #e5e7eb);
}
.persona-threads__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.persona-threads h2.persona-threads__title {
  margin: 0;
  padding: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--persona-text-muted, #6b7280);
}
.persona-threads button {
  font: inherit;
  cursor: pointer;
}
.persona-threads button[aria-disabled="true"] {
  opacity: 0.55;
  cursor: default;
}
.persona-threads button:focus-visible {
  outline: 2px solid var(--persona-primary, #2563eb);
  outline-offset: 2px;
}
.persona-threads button.persona-threads__dismiss {
  padding: 4px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--persona-text-muted, #6b7280);
  font-size: 13px;
}
.persona-threads button.persona-threads__new {
  display: block;
  width: 100%;
  padding: 10px 12px;
  border: 1px dashed var(--persona-divider, #d1d5db);
  border-radius: 10px;
  background: var(--persona-surface, #ffffff);
  text-align: left;
  font-weight: 600;
}
.persona-threads__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.persona-threads ul.persona-threads__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.persona-threads li.persona-threads__item {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 0;
  border-radius: 8px;
}
.persona-threads li.persona-threads__item:hover {
  background: var(--persona-surface, #ffffff);
}
.persona-threads button.persona-threads__row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 8px 4px 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
}
.persona-threads button.persona-threads__row[aria-current="page"] {
  font-weight: 600;
  box-shadow: inset 3px 0 0 0 var(--persona-primary, #2563eb);
}
.persona-threads__row-title,
.persona-threads__row-preview {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.persona-threads__row-preview {
  font-size: 12px;
  color: var(--persona-text-muted, #6b7280);
}
.persona-threads time.persona-threads__row-time {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--persona-text-muted, #6b7280);
  white-space: nowrap;
}
.persona-threads button.persona-threads__row-delete {
  width: 28px;
  height: 28px;
  margin-right: 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--persona-text-muted, #6b7280);
  line-height: 1;
}
.persona-threads button.persona-threads__row-delete:hover {
  color: var(--persona-palette-colors-error-600, #b91c1c);
}
.persona-threads__state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 4px;
}
.persona-threads p.persona-threads__state-title {
  margin: 0;
  font-weight: 600;
}
.persona-threads p.persona-threads__state-description {
  margin: 0;
  font-size: 13px;
  color: var(--persona-text-muted, #6b7280);
}
.persona-threads button.persona-threads__secondary {
  padding: 8px 12px;
  border: 1px solid var(--persona-divider, #d1d5db);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font-size: 13px;
}
.persona-threads__footer {
  padding-top: 8px;
  border-top: 1px solid var(--persona-divider, #e5e7eb);
}
.persona-threads button.persona-threads__danger {
  padding: 6px 4px;
  border: 0;
  background: transparent;
  color: var(--persona-palette-colors-error-600, #b91c1c);
  font-size: 13px;
}
/* Panel reflow: the same renderer, wider rows and a back-style dismiss. */
.persona-threads--panel {
  padding: 16px;
  background: var(--persona-surface, #ffffff);
}
.persona-threads--panel button.persona-threads__row {
  padding: 12px 4px 12px 12px;
}
.persona-threads--panel .persona-threads__row-preview {
  white-space: normal;
}
`;
