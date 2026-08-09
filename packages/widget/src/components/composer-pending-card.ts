/**
 * Deferred submission card in the composer header.
 *
 * Shows the one captured submission with Edit (restore into the draft) and
 * Remove (discard). Pure presentation: the snapshot itself never changes here,
 * so what sends after the current turn is exactly what was captured.
 */

import type { ComposerSubmissionSnapshot } from "../types";
import { createElement, createNode } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import { summarizeQuoteText } from "../utils/composer-quote";

export interface ComposerPendingCard {
  element: HTMLElement;
  render: (snapshot: Readonly<ComposerSubmissionSnapshot> | undefined) => void;
  destroy: () => void;
}

export function createComposerPendingCard(options: {
  onEdit: () => void;
  onRemove: () => void;
  label?: string;
  editLabel?: string;
  removeLabel?: string;
}): ComposerPendingCard {
  const element = createNode("div", {
    className: "persona-composer-pending",
    attrs: { "data-persona-composer-pending": "" },
  });
  element.style.display = "none";
  let painted: Readonly<ComposerSubmissionSnapshot> | undefined;
  let destroyed = false;

  const iconButton = (
    iconName: string,
    label: string,
    attribute: string,
    onClick: () => void
  ): HTMLButtonElement => {
    const button = createNode("button", {
      className: "persona-composer-pending-action",
      attrs: { type: "button", "aria-label": label, [attribute]: "" },
    }) as HTMLButtonElement;
    const icon = renderLucideIcon(iconName, 12, "currentColor", 2);
    if (icon) button.appendChild(icon);
    else button.textContent = label;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return button;
  };

  const summarize = (snapshot: Readonly<ComposerSubmissionSnapshot>): string => {
    const text = summarizeQuoteText(snapshot.text ?? "", 90);
    if (text) return text;
    const parts = snapshot.contentParts?.length ?? 0;
    if (parts > 0) return parts === 1 ? "1 attachment" : `${parts} attachments`;
    const mentions = snapshot.mentionRefs?.length ?? 0;
    if (mentions > 0) return snapshot.mentionRefs.map((ref) => ref.label).join(", ");
    return "Queued message";
  };

  return {
    element,
    render: (snapshot) => {
      if (destroyed || snapshot === painted) return;
      painted = snapshot;
      if (!snapshot) {
        element.replaceChildren();
        element.style.display = "none";
        return;
      }
      const badge = createElement("span", "persona-composer-pending-badge");
      badge.textContent = options.label ?? "Sends next";
      const text = createNode("div", {
        className: "persona-composer-pending-text",
        attrs: { "data-persona-composer-pending-text": "" },
      });
      text.textContent = summarize(snapshot);
      element.replaceChildren(
        badge,
        text,
        iconButton(
          "pencil",
          options.editLabel ?? "Edit queued message",
          "data-persona-composer-pending-edit",
          options.onEdit
        ),
        iconButton(
          "x",
          options.removeLabel ?? "Remove queued message",
          "data-persona-composer-pending-remove",
          options.onRemove
        )
      );
      element.style.display = "flex";
    },
    destroy: () => {
      destroyed = true;
      element.replaceChildren();
      element.remove();
    },
  };
}
