/**
 * Pure state machine for composer message-history navigation (Up/Down arrows).
 *
 * Mirrors the shell / Slack convention: pressing Up recalls previously sent
 * user messages for re-entry or editing; Down walks back toward the present
 * and restores the in-progress draft once you page past the newest entry.
 *
 * Kept free of DOM access so it can be unit-tested in the Node test env. The
 * UI layer (`ui.ts`) supplies caret information and applies the returned value
 * to the textarea.
 */

/**
 * Generic over the entry type `T` so the same machine drives both composer
 * surfaces: chip mode recalls `string`s (textarea values); inline mode recalls
 * `ComposerDocument`s (blocks + mention ids). The machine never inspects an entry
 * — it only indexes the list and swaps the draft — so it stays entirely
 * value-agnostic. Defaults to `string` so every existing chip-mode caller is
 * unchanged.
 */
export interface ComposerHistoryState<T = string> {
  /** Index into the history list, or -1 when not navigating. */
  index: number;
  /** The user's in-progress entry, saved when navigation begins. */
  draft: T;
}

export const INITIAL_HISTORY_STATE: ComposerHistoryState<string> = {
  index: -1,
  draft: ""
};

export interface ComposerHistoryInput<T = string> {
  direction: "up" | "down";
  /** Previously sent user entries, oldest first. */
  history: T[];
  /** Current composer entry (saved as the draft when navigation begins). */
  currentValue: T;
  /** True when the caret sits at the very start of the composer. */
  atStart: boolean;
  state: ComposerHistoryState<T>;
}

export interface ComposerHistoryResult<T = string> {
  /** Whether the key was consumed (caller should preventDefault). */
  handled: boolean;
  /** New entry to apply: only present when it should change. */
  value?: T;
  /** Next navigation state. */
  state: ComposerHistoryState<T>;
}

/**
 * Compute the next navigation state for an Up/Down key press.
 *
 * - **Up** enters history only from the top boundary (`atStart`), then keeps
 *   stepping toward older messages on each subsequent press while navigating.
 * - **Down** only acts while already navigating, stepping toward newer messages
 *   and finally restoring the saved draft once it walks past the newest entry.
 */
export function navigateComposerHistory<T = string>(
  input: ComposerHistoryInput<T>
): ComposerHistoryResult<T> {
  const { direction, history, currentValue, atStart, state } = input;
  const inHistory = state.index !== -1;

  if (history.length === 0) {
    return { handled: false, state };
  }

  if (direction === "up") {
    // Only hijack Up from the top boundary so normal multi-line cursor
    // movement keeps working until the user is actually cycling history.
    if (!inHistory && !atStart) {
      return { handled: false, state };
    }

    if (!inHistory) {
      // First step: stash the draft and jump to the newest entry.
      const index = history.length - 1;
      return {
        handled: true,
        value: history[index],
        state: { index, draft: currentValue }
      };
    }

    if (state.index > 0) {
      const index = state.index - 1;
      return {
        handled: true,
        value: history[index],
        state: { index, draft: state.draft }
      };
    }

    // Already at the oldest entry: consume the key but don't change.
    return { handled: true, state };
  }

  // direction === "down": only meaningful while navigating history.
  if (!inHistory) {
    return { handled: false, state };
  }

  if (state.index < history.length - 1) {
    const index = state.index + 1;
    return {
      handled: true,
      value: history[index],
      state: { index, draft: state.draft }
    };
  }

  // Stepped past the newest entry: restore the saved draft and exit. `index: -1`
  // marks "not navigating"; the draft field is dead until the next Up overwrites
  // it, so keep the existing (correctly-typed) value rather than fabricating one.
  return {
    handled: true,
    value: state.draft,
    state: { index: -1, draft: state.draft }
  };
}
