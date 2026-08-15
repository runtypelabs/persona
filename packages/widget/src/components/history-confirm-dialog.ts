/**
 * Shell-owned destructive confirmation for history actions
 * (`docs/visitor-history-implementation-plan.md` D7, accessibility contract).
 *
 * An alert dialog: labelled and described, focus-trapped, least-destructive
 * action focused first, Escape resolves `false`, and focus returns to whatever
 * was focused when it opened. Styling is inline so the dialog costs no bytes in
 * `widget.css`; colors come from the same theme variables the panel uses.
 */

import { createNode } from "../utils/dom";

export interface HistoryConfirmOptions {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Where the modal mounts. Normally the widget container. */
  host: HTMLElement;
}

const FOCUSABLE = "button:not([disabled])";

/** Resolves `true` only for the confirming action. */
export function showHistoryConfirm(
  options: HistoryConfirmOptions
): Promise<boolean> {
  const previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const id = Math.random().toString(36).slice(2, 8);
  const titleId = `persona-history-confirm-title-${id}`;
  const descriptionId = `persona-history-confirm-desc-${id}`;

  const cancel = createNode("button", {
    className: "persona-history-confirm__cancel",
    text: options.cancelLabel,
    attrs: { type: "button" },
  });
  const confirm = createNode("button", {
    className: "persona-history-confirm__confirm",
    text: options.confirmLabel,
    attrs: { type: "button", "data-persona-destructive": "true" },
  });

  const dialog = createNode(
    "div",
    {
      className: "persona-history-confirm__dialog",
      attrs: {
        role: "alertdialog",
        "aria-modal": "true",
        "aria-labelledby": titleId,
        "aria-describedby": descriptionId,
      },
      style: {
        maxWidth: "22rem",
        width: "100%",
        borderRadius: "var(--persona-radius-lg, 0.75rem)",
        background: "var(--persona-surface, #ffffff)",
        color: "var(--persona-text-primary, inherit)",
        boxShadow:
          "var(--persona-history-confirm-shadow, 0 20px 40px -12px rgba(0, 0, 0, 0.35))",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      },
    },
    createNode("h2", {
      className: "persona-history-confirm__title",
      text: options.title,
      attrs: { id: titleId },
      style: { margin: "0", fontSize: "1rem", fontWeight: "600" },
    }),
    createNode("p", {
      className: "persona-history-confirm__description",
      text: options.description,
      attrs: { id: descriptionId },
      style: { margin: "0", fontSize: "0.875rem", lineHeight: "1.4" },
    }),
    createNode(
      "div",
      {
        className: "persona-history-confirm__actions",
        style: {
          display: "flex",
          gap: "8px",
          justifyContent: "flex-end",
          flexWrap: "wrap",
        },
      },
      cancel,
      confirm
    )
  );

  for (const button of [cancel, confirm]) {
    button.style.minHeight = "44px";
    button.style.minWidth = "88px";
    button.style.padding = "0 16px";
    button.style.borderRadius = "var(--persona-radius-md, 0.5rem)";
    button.style.cursor = "pointer";
    button.style.font = "inherit";
  }
  cancel.style.border = "1px solid var(--persona-border, rgba(0,0,0,0.12))";
  cancel.style.background = "transparent";
  cancel.style.color = "inherit";
  confirm.style.border = "none";
  confirm.style.background = "var(--persona-danger, #b42318)";
  confirm.style.color = "var(--persona-danger-fg, #ffffff)";

  const overlay = createNode(
    "div",
    {
      className: "persona-history-confirm",
      style: {
        position: "absolute",
        inset: "0",
        zIndex: "40",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        background: "var(--persona-history-confirm-scrim, rgba(15, 23, 42, 0.45))",
      },
    },
    dialog
  );

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const close = (result: boolean): void => {
      if (settled) return;
      settled = true;
      overlay.removeEventListener("keydown", onKeydown, true);
      overlay.remove();
      previouslyFocused?.focus();
      resolve(result);
    };

    function onKeydown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(false);
        return;
      }
      if (event.key !== "Tab") return;
      // Trap: only the two actions are reachable while the alert is open.
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    overlay.addEventListener("keydown", onKeydown, true);
    // A click on the scrim is not a destructive confirmation.
    overlay.addEventListener("pointerdown", (event) => {
      if (event.target === overlay) close(false);
    });
    cancel.addEventListener("click", () => close(false));
    confirm.addEventListener("click", () => close(true));

    options.host.appendChild(overlay);
    cancel.focus();
  });
}
