/**
 * Shared composer chip row.
 *
 * One wrapping rail in the header region for every pill-shaped pre-send token:
 * active mode chips lead, mention context chips follow. Banners and cards (the
 * quote row, the deferred-submission card) are full-width rows below it, so a
 * user with a mode and a mention sees one rail, not two stacked rows.
 *
 * The row has no owner: mode chips and the mention manager both write into the
 * element this module hands them, and both call `syncComposerChipRow` after a
 * mutation. Visibility is derived from the children, never from one owner's
 * count, so neither can hide the other's chips.
 */

import { createNode } from "../utils/dom";

export const COMPOSER_CHIP_ROW_SELECTOR = "[data-persona-composer-chip-row]";

/** Flex rail while it holds chips, absent from layout while empty. */
export function syncComposerChipRow(row: HTMLElement): void {
  row.style.display = row.childElementCount > 0 ? "flex" : "none";
}

/**
 * The chip row for `header`, created on first use. Sits ahead of the quote and
 * pending rows, which are banners rather than pills.
 */
export function ensureComposerChipRow(header: HTMLElement): HTMLElement {
  const existing = header.querySelector<HTMLElement>(COMPOSER_CHIP_ROW_SELECTOR);
  if (existing) return existing;

  const row = createNode("div", {
    className: "persona-composer-chip-row",
    attrs: { "data-persona-composer-chip-row": "" },
  });
  row.style.display = "none";

  const banner = header.querySelector<HTMLElement>(
    "[data-persona-composer-quote], [data-persona-composer-pending]"
  );
  if (banner?.parentElement === header) header.insertBefore(row, banner);
  else header.appendChild(row);
  return row;
}
