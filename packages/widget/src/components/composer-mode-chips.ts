/**
 * Active-mode chips in the composer header.
 *
 * Rendered into the SHARED header chip row (`composer-chip-row.ts`) alongside
 * mention chips: modes lead the row, mentions follow. This renderer owns only
 * its own chips, so a repaint never touches a mention chip. Removal is click or
 * keyboard: the remove control is a real button.
 */

import type { ComposerMode } from "../types";
import { createElement, createNode } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import { syncComposerChipRow } from "./composer-chip-row";

const MODE_CHIP_SELECTOR = ":scope > [data-persona-composer-mode]";

export interface ComposerModeChipRow {
  /** The shared row these chips render into. */
  element: HTMLElement;
  /** Repaint from the active ids; a no-op when nothing changed. */
  render: (active: readonly string[], modes: readonly ComposerMode[]) => void;
  destroy: () => void;
}

export function createComposerModeChipRow(options: {
  /** Shared header chip row, from `ensureComposerChipRow`. */
  row: HTMLElement;
  onRemove: (modeId: string) => void;
  /**
   * Ids already active when this row was created. A composer rebuild makes a
   * new row for chips the user has been looking at, so those mount without an
   * entrance animation; only a genuinely new chip animates in.
   */
  initialIds?: readonly string[];
}): ComposerModeChipRow {
  const element = options.row;
  let painted = "";
  let destroyed = false;
  const preExisting = new Set(options.initialIds ?? []);

  const chip = (mode: ComposerMode): HTMLElement => {
    const root = createNode("span", {
      className: "persona-mention-chip persona-composer-mode-chip",
      attrs: { "data-persona-composer-mode": mode.id },
    });
    if (mode.iconName) {
      const holder = createElement("span", "persona-mention-chip-icon");
      const icon = renderLucideIcon(mode.iconName, 12, "currentColor", 1.5);
      if (icon) holder.appendChild(icon);
      root.appendChild(holder);
    }
    const label = createElement("span", "persona-mention-chip-label");
    label.textContent = mode.shortLabel ?? mode.label;
    root.appendChild(label);

    const remove = createNode("button", {
      className: "persona-mention-chip-remove",
      attrs: { type: "button", "aria-label": `Remove ${mode.label}` },
    }) as HTMLButtonElement;
    const icon = renderLucideIcon("x", 12, "currentColor", 2);
    if (icon) remove.appendChild(icon);
    else remove.textContent = "×";
    remove.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      options.onRemove(mode.id);
    });
    root.appendChild(remove);
    return root;
  };

  const liveChips = (): HTMLElement[] =>
    Array.from(element.querySelectorAll<HTMLElement>(MODE_CHIP_SELECTOR));

  /**
   * Fade the node out, then drop it. The composer's own state already changed
   * before this runs, so the animation never delays the state, only the node.
   * `animationend` may never fire (reduced motion, no animation support), so
   * the exit is armed with a same-frame fallback.
   */
  const exitChip = (el: HTMLElement): void => {
    el.setAttribute("data-persona-chip-exit", "");
    el.setAttribute("aria-hidden", "true");
    el.style.pointerEvents = "none";
    const drop = (): void => {
      el.remove();
      syncComposerChipRow(element);
    };
    const view = element.ownerDocument.defaultView;
    // An engine that reports no animation name at all (reduced motion resolves
    // to "none"; a non-rendering engine reports "") never fires animationend,
    // so the node has to go now rather than linger forever.
    const name =
      typeof view?.getComputedStyle === "function"
        ? view.getComputedStyle(el).animationName
        : "";
    if (!name || name === "none") {
      drop();
      return;
    }
    el.addEventListener("animationend", drop, { once: true });
    // A cancelled animation (the row is hidden mid-exit) must still collect.
    el.addEventListener("animationcancel", drop, { once: true });
  };

  const dropChips = (): void => {
    for (const el of liveChips()) el.remove();
  };

  return {
    element,
    render: (active, modes) => {
      if (destroyed) return;
      const visible = modes.filter((mode) => active.includes(mode.id));
      const key = visible
        .map((mode) => `${mode.id}:${mode.shortLabel ?? mode.label}`)
        .join("|");
      if (key === painted) return;
      painted = key;

      // Diffed, not repainted: a chip that stays active keeps its own node, so
      // adding a second mode never re-animates the first one.
      const kept = new Map<string, HTMLElement>();
      for (const el of liveChips()) {
        const id = el.getAttribute("data-persona-composer-mode");
        const stays = id && visible.some((mode) => mode.id === id);
        if (stays && !el.hasAttribute("data-persona-chip-exit")) kept.set(id, el);
        else if (!el.hasAttribute("data-persona-chip-exit")) exitChip(el);
      }

      // Modes lead the row in configuration order; mention chips follow.
      let anchor = element.firstChild;
      for (const mode of visible) {
        let el = kept.get(mode.id);
        if (!el) {
          el = chip(mode);
          // Suppressed for chips this row inherited from a previous composer.
          if (!preExisting.has(mode.id)) {
            el.setAttribute("data-persona-chip-enter", "");
            el.addEventListener(
              "animationend",
              () => el?.removeAttribute("data-persona-chip-enter"),
              { once: true }
            );
          }
        }
        preExisting.delete(mode.id);
        if (el !== anchor) element.insertBefore(el, anchor);
        anchor = el.nextSibling;
      }
      syncComposerChipRow(element);
    },
    destroy: () => {
      destroyed = true;
      dropChips();
      syncComposerChipRow(element);
    },
  };
}
