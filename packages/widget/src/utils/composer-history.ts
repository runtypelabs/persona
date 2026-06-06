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

export interface ComposerHistoryState {
  /** Index into the history list, or -1 when not navigating. */
  index: number;
  /** The user's in-progress text, saved when navigation begins. */
  draft: string;
}

export const INITIAL_HISTORY_STATE: ComposerHistoryState = {
  index: -1,
  draft: ""
};

export interface ComposerHistoryInput {
  direction: "up" | "down";
  /** Previously sent user-message texts, oldest first. */
  history: string[];
  /** Current textarea value (saved as the draft when navigation begins). */
  currentValue: string;
  /** True when the caret sits at the very start of the textarea. */
  atStart: boolean;
  state: ComposerHistoryState;
}

export interface ComposerHistoryResult {
  /** Whether the key was consumed (caller should preventDefault). */
  handled: boolean;
  /** New textarea value to apply — only present when it should change. */
  value?: string;
  /** Next navigation state. */
  state: ComposerHistoryState;
}

/**
 * Compute the next navigation state for an Up/Down key press.
 *
 * - **Up** enters history only from the top boundary (`atStart`), then keeps
 *   stepping toward older messages on each subsequent press while navigating.
 * - **Down** only acts while already navigating, stepping toward newer messages
 *   and finally restoring the saved draft once it walks past the newest entry.
 */
export function navigateComposerHistory(
  input: ComposerHistoryInput
): ComposerHistoryResult {
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

    // Already at the oldest entry — consume the key but don't change.
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

  // Stepped past the newest entry — restore the saved draft and exit.
  return {
    handled: true,
    value: state.draft,
    state: { ...INITIAL_HISTORY_STATE }
  };
}
