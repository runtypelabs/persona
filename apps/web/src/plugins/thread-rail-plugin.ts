import type {
  AgentWidgetPlugin,
  AgentWidgetRenderHistoryViewContext,
} from "@runtypelabs/persona";
import { injectStyles } from "@runtypelabs/persona/plugin-kit";

/**
 * Blueprint: a sidebar thread rail that replaces Persona's Messages view
 * through `renderHistoryView`, using public hooks only. Shaped like the rails
 * in production assistants: a quiet title row with icon actions, a pinned
 * section for starred threads, a flat recents list of single-line rows with a
 * hover-revealed delete, and a subdued destructive footer.
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
 * conversation body (narrow hosts, floating launchers), which restores the
 * two-line rows and a roomier density.
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

const SVG_NS = "http://www.w3.org/2000/svg";

/** 16px stroke glyph, decorative; the owning button carries the label. */
const icon = (paths: string[]): SVGElement => {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
};

const ICON_PLUS = ["M5 12h14", "M12 5v14"];
const ICON_X = ["M18 6 6 18", "m6 6 12 12"];

const iconButton = (
  className: string,
  label: string,
  paths: string[],
  inert: boolean,
  onClick: () => void,
): HTMLButtonElement => {
  const button = el("button", `${CLASS}__icon-button ${className}`);
  button.type = "button";
  button.setAttribute("aria-label", label);
  if (inert) button.setAttribute("aria-disabled", "true");
  button.appendChild(icon(paths));
  button.addEventListener("click", () => {
    if (button.getAttribute("aria-disabled") === "true") return;
    onClick();
  });
  return button;
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

  // Trailing slot: the time rests there and the delete takes it on hover or
  // keyboard focus, the way the built-in rows trade the same space.
  const time = el("time", `${CLASS}__row-time`, relativeTime(conversation.updatedAt));
  time.dateTime = conversation.updatedAt;

  // A sibling, never a nested button: the row itself is already a button.
  const remove = el("button", `${CLASS}__row-delete`);
  remove.type = "button";
  remove.setAttribute(
    "aria-label",
    `${context.copy.deleteConversationLabel}: ${conversation.title}`,
  );
  remove.appendChild(icon(ICON_X));
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

/** A labelled thread group: tiny muted heading over a flat list of rows. */
function buildGroup(
  context: AgentWidgetRenderHistoryViewContext,
  label: string,
  conversations: AgentWidgetRenderHistoryViewContext["conversations"],
  busy: boolean,
): HTMLElement {
  const section = el("section", `${CLASS}__group`);
  const heading = el("h3", `${CLASS}__group-heading`, label);
  const list = el("ul", `${CLASS}__list`);
  for (const conversation of conversations) {
    list.append(buildRow(context, conversation, busy));
  }
  section.append(heading, list);
  return section;
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

      // Title row: identity left, icon actions right. The close reads as an
      // icon control here; the panel keeps the same glyph as a back-style exit.
      const header = el("header", `${CLASS}__header`);
      header.append(
        el("h2", `${CLASS}__title`, copy.viewTitle),
        iconButton(
          `${CLASS}__new`,
          copy.newConversationLabel,
          ICON_PLUS,
          busy,
          () => void actions.startNewConversation(),
        ),
        iconButton(
          `${CLASS}__dismiss`,
          presentation === "rail" ? copy.closeLabel : copy.backLabel,
          ICON_X,
          false,
          () => actions.close(),
        ),
      );

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

      // Starred threads pin into their own section; the rest read as recents.
      const pinned = context.conversations.filter((c) => c.starred);
      const recents = context.conversations.filter((c) => !c.starred);
      if (pinned.length > 0) {
        body.append(buildGroup(context, copy.groupStarred, pinned, busy));
      }
      if (recents.length > 0) {
        body.append(buildGroup(context, copy.conversationsTitle, recents, busy));
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

      root.append(header, body, footer);
      return root;
    },
  };
}

const THREAD_RAIL_CSS = `
.persona-threads {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--persona-container, #f7f7f8);
  color: var(--persona-text, #111827);
  font-family: var(--persona-font-family, inherit);
  font-size: 14px;
  line-height: 1.45;
}
.persona-threads * { box-sizing: border-box; }
/* No divider here: Persona's rail host draws one on the edge facing the
   conversation, whichever side the rail docked to. */
.persona-threads__header {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 52px;
  padding: 8px 8px 4px 16px;
}
/* Headings pin their full text style: bare host h2/h3 rules beat inheritance
   for any property left undeclared. */
.persona-threads h2.persona-threads__title {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  padding: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.45;
  letter-spacing: normal;
  color: var(--persona-text, #111827);
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
.persona-threads button.persona-threads__icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--persona-text-muted, #6b7280);
}
.persona-threads button.persona-threads__icon-button:hover:not([aria-disabled="true"]) {
  background: var(--persona-button-ghost-hover-bg, rgba(0, 0, 0, 0.05));
  color: var(--persona-text, #111827);
}
.persona-threads__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 8px 12px;
}
.persona-threads__group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.persona-threads h3.persona-threads__group-heading {
  margin: 0 0 2px;
  padding: 0 8px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.45;
  letter-spacing: normal;
  color: var(--persona-text-muted, #6b7280);
}
.persona-threads ul.persona-threads__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.persona-threads li.persona-threads__item {
  position: relative;
  display: flex;
  align-items: center;
  margin: 0;
  padding: 0;
  border-radius: 8px;
}
.persona-threads li.persona-threads__item:hover {
  background: var(--persona-button-ghost-hover-bg, rgba(0, 0, 0, 0.05));
}
.persona-threads button.persona-threads__row {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 34px;
  padding: 7px 4px 7px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
}
.persona-threads button.persona-threads__row[aria-current="page"] {
  background: var(--persona-divider, rgba(0, 0, 0, 0.07));
  font-weight: 500;
}
.persona-threads__row-title,
.persona-threads__row-preview {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* The rail is a list of titles; the panel variant restores the preview line. */
.persona-threads--rail .persona-threads__row-preview {
  display: none;
}
.persona-threads__row-preview {
  font-size: 12px;
  color: var(--persona-text-muted, #6b7280);
}
/* Time and delete share the trailing slot; hover and focus trade them. The
   time is in flow, so a long title truncates before it instead of under it. */
.persona-threads time.persona-threads__row-time {
  flex: none;
  padding-right: 10px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--persona-text-muted, #6b7280);
  white-space: nowrap;
  pointer-events: none;
}
.persona-threads button.persona-threads__row-delete {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--persona-text-muted, #6b7280);
}
.persona-threads button.persona-threads__row-delete:hover {
  color: var(--persona-palette-colors-error-600, #b91c1c);
}
/* Reveal on hover or keyboard focus only; it never leaves the tab order. */
@media (hover: hover) {
  .persona-threads button.persona-threads__row-delete {
    opacity: 0;
  }
  .persona-threads li.persona-threads__item:hover time.persona-threads__row-time,
  .persona-threads li.persona-threads__item:focus-within time.persona-threads__row-time {
    opacity: 0;
  }
  .persona-threads li.persona-threads__item:hover button.persona-threads__row-delete,
  .persona-threads li.persona-threads__item:focus-within button.persona-threads__row-delete {
    opacity: 1;
  }
}
.persona-threads__state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 8px;
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
  margin: 0 8px;
  padding: 8px 12px;
  border: 1px solid var(--persona-divider, #d1d5db);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font-size: 13px;
}
.persona-threads__footer {
  padding: 6px 8px;
  border-top: 1px solid var(--persona-divider, #e5e7eb);
}
.persona-threads button.persona-threads__danger {
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--persona-text-muted, #6b7280);
  font-size: 12px;
}
.persona-threads button.persona-threads__danger:hover:not([aria-disabled="true"]) {
  color: var(--persona-palette-colors-error-600, #b91c1c);
}
/* Panel reflow: the same renderer on the conversation surface, two-line rows
   and a back-style dismiss. */
.persona-threads--panel {
  background: var(--persona-surface, #ffffff);
}
.persona-threads--panel .persona-threads__body {
  padding: 4px 12px 16px;
}
.persona-threads--panel button.persona-threads__row {
  min-height: 52px;
  padding: 9px 4px 9px 10px;
}
`;
