import type {
  PersonaArtifactActionContext,
  PersonaArtifactCustomAction,
  PersonaArtifactRecord,
} from "../types";
import { createIconButton, createLabelButton } from "./buttons";
import { createElement } from "./dom";

/** Base class applied to every custom artifact action button. */
const CUSTOM_ACTION_CLASS = "persona-artifact-custom-action-btn";

/**
 * Builds a toolbar/card button for a {@link PersonaArtifactCustomAction}.
 *
 * The result always carries `persona-artifact-custom-action-btn` after the
 * button-system base classes. When `opts.documentChrome` is set, the button
 * also picks up the document-toolbar styling used by the built-in controls.
 *
 * A string `icon` routes through the shared button helpers; a factory `icon`
 * is hand-assembled to match the same class structure so author-owned SVGs
 * slot in without duplicating the button system. A throwing factory falls back
 * to a no-icon button rather than breaking the toolbar.
 *
 * `opts.onClick` (used by the toolbar path) is attached as a click listener;
 * the card path omits it and wires clicks via event delegation instead.
 */
export function buildArtifactActionButton(
  action: PersonaArtifactCustomAction,
  opts?: { documentChrome?: boolean; onClick?: () => void }
): HTMLButtonElement {
  const documentChrome = opts?.documentChrome ?? false;

  let btn: HTMLButtonElement;

  if (typeof action.icon === "function") {
    // Hand-assemble to mirror createIconButton/createLabelButton, with the
    // author-provided element in place of a Lucide icon.
    if (action.showLabel) {
      const className =
        "persona-label-btn persona-label-btn--sm " +
        CUSTOM_ACTION_CLASS +
        (documentChrome ? " persona-artifact-doc-copy-btn" : "");
      btn = createElement("button", className);
    } else {
      const className =
        "persona-icon-btn " +
        CUSTOM_ACTION_CLASS +
        (documentChrome ? " persona-artifact-doc-icon-btn" : "");
      btn = createElement("button", className);
    }
    btn.type = "button";
    btn.setAttribute("aria-label", action.label);
    btn.title = action.label;

    try {
      const el = action.icon();
      if (el) {
        btn.appendChild(el);
      }
    } catch {
      /* a throwing factory must not break the toolbar; fall back to no icon */
    }

    if (action.showLabel) {
      const span = createElement("span");
      span.textContent = action.label;
      btn.appendChild(span);
    }
  } else if (action.showLabel || !action.icon) {
    // Visible label, or no icon at all: icon-less actions fall back to a text
    // button so the control always has a visible affordance (an empty
    // icon-only button would render as a bare chip and warn on every render).
    btn = createLabelButton({
      icon: action.icon,
      label: action.label,
      className:
        CUSTOM_ACTION_CLASS + (documentChrome ? " persona-artifact-doc-copy-btn" : ""),
    });
  } else {
    // Icon-only: icon is a registry name.
    btn = createIconButton({
      icon: action.icon,
      label: action.label,
      className:
        CUSTOM_ACTION_CLASS + (documentChrome ? " persona-artifact-doc-icon-btn" : ""),
    });
  }

  if (opts?.onClick) {
    btn.addEventListener("click", opts.onClick);
  }

  return btn;
}

/**
 * Derives an action context from a persisted artifact record, mirroring how the
 * artifact pane discriminates record shapes. Returns `null` when no record is
 * available so callers can skip evaluating visibility gates / handlers.
 */
export function artifactRecordActionContext(
  record: PersonaArtifactRecord | undefined
): PersonaArtifactActionContext | null {
  if (!record) {
    return null;
  }

  const ctx: PersonaArtifactActionContext = {
    artifactId: record.id,
    title: record.title ?? "",
    artifactType: record.artifactType,
  };

  if (record.artifactType === "markdown") {
    ctx.markdown = record.markdown ?? "";
    if (record.file) {
      ctx.file = record.file;
    }
  } else {
    ctx.jsonPayload = JSON.stringify(
      { component: record.component, props: record.props },
      null,
      2
    );
  }

  return ctx;
}
