import { createElement, createNode } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import { ComposerBuildContext, ComposerElements } from "./composer-builder";
import {
  createAttachmentControls,
  createComposerTextarea,
  createMicButton,
  createSendButton,
  createStatusText,
  createSuggestionsRow,
} from "./composer-parts";

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
  const messageIcon = renderLucideIcon("message-square", 16, "currentColor", 1.5);
  if (messageIcon) {
    iconHolder.appendChild(messageIcon);
  }

  const textNode = createElement("span", "persona-pill-peek__text");

  const caret = createElement("span", "persona-pill-peek__caret");
  const caretIcon = renderLucideIcon("chevron-up", 16, "currentColor", 1.5);
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
 * Suggestions row + status text are built (so plugin code that mutates
 * them keeps working and `bindComposerRefsFromFooter` finds them) but are
 * `display: none` by default: pill UX is just textarea + 3 buttons.
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
  suggestions.style.display = "none";
  const statusText = createStatusText(config);
  statusText.style.display = "none";

  const { textarea, attachAutoResize } = createComposerTextarea(config);
  // Pill textarea: starts single-line, allowed to grow up to ~5 lines so
  // expanded mode still supports multi-line composition. attachAutoResize
  // reads max-height at event time, so this override flows through.
  textarea.style.maxHeight = "100px";
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
  const leftActions = createElement(
    "div",
    "persona-widget-composer__left-actions persona-pill-composer__left"
  );
  if (attachment) leftActions.append(attachment.wrapper);

  const rightActions = createElement(
    "div",
    "persona-widget-composer__right-actions persona-pill-composer__right"
  );
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
  //   [previews row, hidden until attachments exist]
  //   [pill form]
  //   [hidden suggestions]
  //   [hidden status]
  if (attachment) footer.append(attachment.previewsContainer);
  footer.append(composerForm, suggestions, statusText);

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
