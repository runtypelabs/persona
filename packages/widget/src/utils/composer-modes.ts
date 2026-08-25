/**
 * Composer modes.
 *
 * Pure state math: which ids a toggle produces under a group's selection
 * policy, which survive a send, and which placeholder wins. The DOM side lives
 * in ui.ts (actions) and composer-mode-chips.ts (header chips).
 *
 * Persona attaches no meaning to a mode id. Reasoning effort, tool pinning, and
 * personas are all just configured modes.
 */

import type { ComposerMode, ComposerModeGroup } from "../types";

/** Registry id for a mode's bar action. Namespaced so hosts cannot collide. */
export const composerModeActionId = (modeId: string): string =>
  `core:mode:${modeId}`;

/** Order range reserved for mode actions in the start cluster (300-499). */
export const COMPOSER_MODE_ORDER_START = 300;
export const COMPOSER_MODE_ORDER_END = 499;

/** Contribution order within the reserved range; extra modes stack at the top. */
export const composerModeOrder = (index: number): number =>
  Math.min(COMPOSER_MODE_ORDER_START + index, COMPOSER_MODE_ORDER_END);

/** Registry id for a segmented group's track. Namespaced like the mode ids. */
export const composerModeGroupActionId = (groupId: string): string =>
  `core:mode-group:${groupId}`;

/** True when this group draws as one segmented track instead of loose buttons. */
export function isSegmentedModeGroup(
  groupId: string | undefined,
  groups: readonly ComposerModeGroup[] | undefined
): boolean {
  if (!groupId) return false;
  return (
    groups?.find((group) => group.id === groupId)?.presentation === "segmented"
  );
}

/**
 * Modes that still earn a header chip. A segmented track already shows its own
 * state, so a chip for the same mode would be a second, removable copy of it.
 */
export function chipVisibleComposerModes(
  modes: readonly ComposerMode[] | undefined,
  groups: readonly ComposerModeGroup[] | undefined
): ComposerMode[] {
  if (!modes?.length) return [];
  return modes.filter((mode) => !isSegmentedModeGroup(mode.groupId, groups));
}

const groupSelection = (
  mode: ComposerMode,
  groups: readonly ComposerModeGroup[] | undefined
): "single" | "multiple" | null => {
  if (!mode.groupId) return null;
  return groups?.find((group) => group.id === mode.groupId)?.selection ?? null;
};

/**
 * Toggle one mode. A `single` group deselects its siblings; `multiple` groups
 * and ungrouped modes toggle independently. The result keeps configuration
 * order so chips and snapshots read deterministically.
 */
export function toggleComposerMode(
  active: readonly string[],
  modeId: string,
  modes: readonly ComposerMode[],
  groups: readonly ComposerModeGroup[] | undefined
): string[] {
  const mode = modes.find((item) => item.id === modeId);
  if (!mode) return [...active];

  const wasActive = active.includes(modeId);
  let next = new Set(active);

  if (wasActive) {
    next.delete(modeId);
  } else {
    if (groupSelection(mode, groups) === "single") {
      const siblings = modes
        .filter((item) => item.groupId === mode.groupId)
        .map((item) => item.id);
      next = new Set([...next].filter((id) => !siblings.includes(id)));
    }
    next.add(modeId);
  }

  return modes.filter((item) => next.has(item.id)).map((item) => item.id);
}

/** Drop ids whose mode no longer exists; live config edits must not strand them. */
export function pruneComposerModes(
  active: readonly string[],
  modes: readonly ComposerMode[] | undefined
): string[] {
  if (!modes?.length) return [];
  return modes.filter((mode) => active.includes(mode.id)).map((mode) => mode.id);
}

/**
 * Step 8 of the submission order: one-shot modes clear once the user message is
 * accepted locally. `sticky` (the default) survives.
 */
export function clearOnceComposerModes(
  active: readonly string[],
  modes: readonly ComposerMode[] | undefined
): string[] {
  if (!modes?.length) return [];
  return modes
    .filter(
      (mode) => active.includes(mode.id) && (mode.persistence ?? "sticky") !== "once"
    )
    .map((mode) => mode.id);
}

/**
 * The placeholder an active mode imposes. Priority is configuration order: the
 * first mode in `composer.modes` that is active and declares one wins. Returns
 * undefined when none does, so the caller restores the configured placeholder.
 */
export function resolveComposerModePlaceholder(
  active: readonly string[],
  modes: readonly ComposerMode[] | undefined
): string | undefined {
  if (!modes?.length || active.length === 0) return undefined;
  return modes.find((mode) => active.includes(mode.id) && mode.placeholder)
    ?.placeholder;
}
