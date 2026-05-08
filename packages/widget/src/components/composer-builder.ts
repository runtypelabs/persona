import { createElement } from "../utils/dom";
import { AgentWidgetConfig, ContentPart } from "../types";
import {
  createAttachmentControls,
  createComposerTextarea,
  createMicButton,
  createSendButton,
  createStatusText,
  createSuggestionsRow,
} from "./composer-parts";

export interface ComposerElements {
  footer: HTMLElement;
  suggestions: HTMLElement;
  composerForm: HTMLFormElement;
  textarea: HTMLTextAreaElement;
  sendButton: HTMLButtonElement;
  sendButtonWrapper: HTMLElement;
  micButton: HTMLButtonElement | null;
  micButtonWrapper: HTMLElement | null;
  statusText: HTMLElement;
  attachmentButton: HTMLButtonElement | null;
  attachmentButtonWrapper: HTMLElement | null;
  attachmentInput: HTMLInputElement | null;
  attachmentPreviewsContainer: HTMLElement | null;
  actionsRow: HTMLElement;
  leftActions: HTMLElement;
  rightActions: HTMLElement;
  /**
   * Swap the send button between its idle ("send") appearance and its
   * streaming ("stop") appearance. In icon mode this swaps the SVG; in text
   * mode it swaps the button label. Tooltip text is updated when a tooltip
   * element is present.
   */
  setSendButtonMode: (mode: "send" | "stop") => void;
}

export interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string;
  contentPart: ContentPart;
}

export interface ComposerBuildContext {
  config?: AgentWidgetConfig;
  onSubmit?: (text: string) => void;
  disabled?: boolean;
}

/**
 * Build the full footer + composer form (column-stacked card layout) for
 * the floating, docked, and inline-embed launcher modes. The pill variant
 * for `mountMode: "composer-bar"` lives in `pill-composer-builder.ts` and
 * shares the same low-level part factories from `composer-parts.ts`.
 */
export const buildComposer = (context: ComposerBuildContext): ComposerElements => {
  const { config } = context;

  const footer = createElement(
    "div",
    "persona-widget-footer persona-border-t-persona-divider persona-bg-persona-surface persona-px-6 persona-py-4"
  );
  footer.setAttribute("data-persona-theme-zone", "composer");

  const suggestions = createSuggestionsRow();

  const composerForm = createElement(
    "form",
    "persona-widget-composer persona-flex persona-flex-col persona-gap-2 persona-rounded-2xl persona-border persona-border-gray-200 persona-bg-persona-input-background persona-px-4 persona-py-3"
  ) as HTMLFormElement;
  composerForm.setAttribute("data-persona-composer-form", "");
  composerForm.style.outline = "none";

  const { textarea, attachAutoResize } = createComposerTextarea(config);
  attachAutoResize();

  const send = createSendButton(config);
  const mic = createMicButton(config);
  const attachment = createAttachmentControls(config);
  const statusText = createStatusText(config);

  // Layout (column):
  //   row 1: attachment previews (above textarea, smaller)
  //   row 2: textarea (full width)
  //   row 3: actions (paperclip left, mic + send right)
  if (attachment) {
    attachment.previewsContainer.style.gap = "8px";
    composerForm.append(attachment.previewsContainer, attachment.input);
  }
  composerForm.append(textarea);

  // The bare class names (persona-widget-composer__actions / __left-actions /
  // __right-actions) are stable CSS hooks. The pill composer reuses
  // __left-actions / __right-actions as semantic markers in its grid.
  const actionsRow = createElement(
    "div",
    "persona-widget-composer__actions persona-flex persona-items-center persona-justify-between persona-w-full"
  );
  const leftActions = createElement(
    "div",
    "persona-widget-composer__left-actions persona-flex persona-items-center persona-gap-2"
  );
  const rightActions = createElement(
    "div",
    "persona-widget-composer__right-actions persona-flex persona-items-center persona-gap-1"
  );
  if (attachment) leftActions.append(attachment.wrapper);
  if (mic) rightActions.append(mic.wrapper);
  rightActions.append(send.wrapper);
  actionsRow.append(leftActions, rightActions);
  composerForm.append(actionsRow);

  // Click anywhere on the composer (other than the action buttons) → focus
  // textarea so the click target feels like the whole input bar.
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

  footer.append(suggestions, composerForm, statusText);

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
