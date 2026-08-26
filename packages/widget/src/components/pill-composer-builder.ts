import { createElement, createNode } from "../utils/dom";
import { ChevronUp, MessageSquare } from "lucide";
import { renderIconNode } from "../utils/icon-node";
import { ComposerBuildContext, ComposerElements } from "./composer-builder";
import {
  createAttachmentControls,
  createComposerTextarea,
  createMicButton,
  createSendButton,
  createStatusText,
  createSuggestionsRow,
} from "./composer-parts";
import { PILL_COMPOSER_MAX_LINES } from "../utils/composer-input-config";

export interface PillPeekBanner {
  /**
   * The peek button itself: a chrome-less row that floats above the pill,
   * showing a chat-bubble icon, a trailing-100-char preview of the most
   * recent assistant message, and a chevron-up. Rendered hidden by default
   * (opacity 0, pointer-events none); ui.ts toggles
   * `.persona-pill-peek--visible` based on streaming/hover/open state.
   */
  root: HTMLButtonElement;
  /** Wrapper around the trailing message preview text. */
  textNode: HTMLElement;
}

/**
 * Build the peek banner for `launcher.mountMode: "composer-bar"`. The peek
 * is the user's path back into the expanded chat from the collapsed pill: * it fades in during streaming OR on composer hover, and clicking it opens
 * the panel. ui.ts owns visibility + content updates via
 * `syncComposerBarPeek`; this factory just produces the inert DOM shell.
 *
 * Placed in the panel between `container` and `footer` so it visually sits
 * just above the pill in the collapsed-state UI.
 */
export const buildPillPeekBanner = (): PillPeekBanner => {
  const root = createNode("button", {
    className: "persona-pill-peek",
    attrs: {
      type: "button",
      "data-persona-pill-peek": "",
      "aria-label": "Show conversation",
      tabindex: "-1",
    },
  });

  const iconHolder = createElement("span", "persona-pill-peek__icon");
  const messageIcon = renderIconNode(MessageSquare, 16, "currentColor", 1.5);
  if (messageIcon) {
    iconHolder.appendChild(messageIcon);
  }

  const textNode = createElement("span", "persona-pill-peek__text");

  const caret = createElement("span", "persona-pill-peek__caret");
  const caretIcon = renderIconNode(ChevronUp, 16, "currentColor", 1.5);
  if (caretIcon) {
    caret.appendChild(caretIcon);
  }

  root.append(iconHolder, textNode, caret);
  return { root, textNode };
};

/**
 * Single-row pill composer for `launcher.mountMode: "composer-bar"`.
 *
 * Same control factories as `buildComposer`: the only difference is the
 * layout shell + className. The form ships with `persona-pill-composer`
 * (no `persona-flex-col` / `persona-rounded-2xl` baggage), so the CSS
 * layout rules apply at normal specificity without `!important` fights.
 *
 * Returns the same `ComposerElements` shape as `buildComposer` so panel.ts
 * and ui.ts plumbing is unconditional past the choice of builder.
 *
 * Suggestions row + status text are built so plugin code that mutates them
 * keeps working and `bindComposerRefsFromFooter` finds them. CSS hides the
 * suggestions while collapsed and reveals them above the pill when expanded;
 * status text stays hidden because the pill UX has no room for it.
 *
 * Attachment previews float ABOVE the pill in their own row when
 * AttachmentManager toggles the previews container's `display` property
 * as items are added/removed.
 */
export const buildPillComposer = (context: ComposerBuildContext): ComposerElements => {
  const { config } = context;

  const footer = createNode("div", {
    className: "persona-widget-footer persona-widget-footer--pill",
    attrs: { "data-persona-theme-zone": "composer" },
  });

  const suggestions = createSuggestionsRow();
  const statusText = createStatusText(config);
  statusText.style.display = "none";

  // Pill textarea: starts single-line, grows to `composer.maxLines` (5 by
  // default) so expanded mode still supports multi-line composition.
  const { textarea, attachAutoResize } = createComposerTextarea(config, {
    defaultMaxLines: PILL_COMPOSER_MAX_LINES,
  });
  attachAutoResize();

  const send = createSendButton(config);
  const mic = createMicButton(config);
  const attachment = createAttachmentControls(config);

  if (attachment) {
    attachment.previewsContainer.classList.add("persona-pill-composer__previews");
  }

  // Pill form: NO `persona-flex-col`. Only the marker classes that the rest
  // of the codebase queries by name.
  const composerForm = createNode("form", {
    className: "persona-widget-composer persona-pill-composer",
    attrs: { "data-persona-composer-form": "" },
    style: { outline: "none" },
  });

  // Three columns of the grid: [paperclip?] · textarea · mic + send.
  // The empty leftActions wrapper still ships when attachments are off so
  // the grid has a consistent first cell (auto width → collapses to 0).
  const leftActions = createNode("div", {
    className: "persona-widget-composer__left-actions persona-pill-composer__left",
    attrs: { "data-persona-composer-actions-start": "" },
  });
  if (attachment) leftActions.append(attachment.wrapper);

  // Both pill clusters are spaced from CSS (`.persona-pill-composer__left/right`,
  // 4px), symmetrically. The pill is a deliberately tighter single row, so it
  // keeps its own rhythm rather than the full composer's 8px.
  const rightActions = createNode("div", {
    className: "persona-widget-composer__right-actions persona-pill-composer__right",
    attrs: { "data-persona-composer-actions-end": "" },
  });
  if (mic) rightActions.append(mic.wrapper);
  rightActions.append(send.wrapper);

  composerForm.addEventListener("click", (e) => {
    if (
      e.target !== send.button &&
      e.target !== send.wrapper &&
      e.target !== mic?.button &&
      e.target !== mic?.wrapper &&
      e.target !== attachment?.button &&
      e.target !== attachment?.wrapper
    ) {
      textarea.focus();
    }
  });

  if (attachment) composerForm.append(attachment.input);
  composerForm.append(leftActions, textarea, rightActions);

  // Footer assembly:
  //   [header region: previews row, hidden until attachments exist]
  //   [suggestions, visible only while expanded]
  //   [pill form]
  //   [hidden status]
  //
  // The header floats above the pill. It is `display: contents` so an empty
  // header adds no row to the footer's flex column (the previews row keeps its
  // own float exactly as before); a later phase can promote it to a real box
  // once it hosts chips/quote/pending UI.
  const header = createNode("div", {
    className: "persona-pill-composer__header",
    attrs: { "data-persona-composer-header": "" },
    style: { display: "contents" },
  });
  footer.append(header);
  if (attachment) header.append(attachment.previewsContainer);
  footer.append(suggestions, composerForm, statusText);

  // The pill flattens left/right into the form's grid; there's no separate
  // wrapper. Surface the form itself as `actionsRow` to satisfy the
  // ComposerElements contract: downstream code only treats it as an
  // opaque ref. The pill form intentionally carries no
  // `data-persona-composer-actions` marker, so `bindComposerRefsFromFooter`
  // finds no actions row in pill mode; that lookup writes to `_actionsRow`
  // (the underscore prefix marks it as soft-optional).
  const actionsRow = composerForm;

  return {
    footer,
    suggestions,
    composerForm,
    header,
    textarea,
    sendButton: send.button,
    sendButtonWrapper: send.wrapper,
    micButton: mic?.button ?? null,
    micButtonWrapper: mic?.wrapper ?? null,
    statusText,
    attachmentButton: attachment?.button ?? null,
    attachmentButtonWrapper: attachment?.wrapper ?? null,
    attachmentInput: attachment?.input ?? null,
    attachmentPreviewsContainer: attachment?.previewsContainer ?? null,
    actionsRow,
    leftActions,
    rightActions,
    setSendButtonMode: send.setMode,
  };
};
