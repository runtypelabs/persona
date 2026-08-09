/**
 * Inline editor that replaces a user bubble during edit-and-resend.
 *
 * The element is built ONCE per edit session and re-inserted into the morphed
 * wrapper after every transcript render (the stub-and-hydrate pattern already
 * used by plugin ask/approval bubbles). Idiomorph imports nodes via
 * `document.importNode`, which strips listeners and resets a textarea's live
 * value, so the live node must never be handed to the morph pass.
 */

import { createElement, createNode } from "../utils/dom";

export interface MessageEditEditor {
  element: HTMLElement;
  /** Live edited text. */
  getValue: () => string;
  focus: () => void;
  destroy: () => void;
}

export function createMessageEditEditor(options: {
  messageId: string;
  initialText: string;
  onSave: (text: string) => void;
  onCancel: () => void;
  saveLabel?: string;
  cancelLabel?: string;
}): MessageEditEditor {
  const element = createNode("div", {
    className: "persona-message-edit",
    attrs: {
      "data-persona-message-edit": options.messageId,
      // Runtime-owned: the morph pass must leave this subtree alone.
      "data-preserve-runtime": "",
    },
  });

  const textarea = createNode("textarea", {
    className: "persona-message-edit-input",
    attrs: {
      rows: "1",
      dir: "auto",
      "aria-label": "Edit message",
      "data-persona-message-edit-input": "",
    },
  }) as HTMLTextAreaElement;
  textarea.value = options.initialText;

  const autoSize = (): void => {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  textarea.addEventListener("input", autoSize);

  const actions = createElement("div", "persona-message-edit-actions");
  const button = (
    label: string,
    className: string,
    attribute: string,
    onClick: () => void
  ): HTMLButtonElement => {
    const el = createNode("button", {
      className: `persona-message-edit-button ${className}`,
      attrs: { type: "button", [attribute]: "" },
      text: label,
    }) as HTMLButtonElement;
    el.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return el;
  };

  const save = (): void => {
    const value = textarea.value.trim();
    if (!value) return;
    options.onSave(value);
  };

  actions.append(
    button(
      options.cancelLabel ?? "Cancel",
      "persona-message-edit-cancel",
      "data-persona-message-edit-cancel",
      options.onCancel
    ),
    button(
      options.saveLabel ?? "Send",
      "persona-message-edit-save",
      "data-persona-message-edit-save",
      save
    )
  );

  // Escape cancels; the composer keeps its own Escape-stop behavior because this
  // handler never reaches it (the editor is a separate subtree).
  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      options.onCancel();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      save();
    }
  });

  element.append(textarea, actions);

  return {
    element,
    getValue: () => textarea.value,
    focus: () => {
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
      autoSize();
    },
    destroy: () => {
      element.replaceChildren();
      element.remove();
    },
  };
}
