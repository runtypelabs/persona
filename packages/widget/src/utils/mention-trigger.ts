/**
 * Pure `@`-trigger detection for the composer mention menu.
 *
 * No DOM, no contenteditable — a small function over `(value, caret)` mirroring
 * the Slack/Discord approach. Shared by the core orchestrator's lightweight
 * "should I open?" pre-check and the lazy-loaded controller's full parse, so the
 * trigger rule lives in exactly one place.
 */

export type MentionTriggerMatch = {
  /** Index of the trigger character in `value`. */
  triggerIndex: number;
  /** The text typed after the trigger, up to the caret (no leading trigger). */
  query: string;
};

const WHITESPACE = /\s/;

/**
 * Detect an active mention trigger ending at `caret`.
 *
 * Active when, scanning back from the caret, a trigger char is reached with no
 * intervening whitespace AND the char before the trigger is whitespace or the
 * start of input. Returns `null` otherwise — notably for `user@example.com`
 * (trigger glued to a word char) and once a space follows the trigger.
 *
 * @param value   Full textarea value.
 * @param caret   Caret offset (selectionStart). Out-of-range → `null`.
 * @param trigger Single trigger character. @default "@"
 */
export function parseMentionTrigger(
  value: string,
  caret: number,
  trigger = "@"
): MentionTriggerMatch | null {
  if (!trigger) return null;
  if (caret <= 0 || caret > value.length) return null;

  let i = caret - 1;
  while (i >= 0) {
    const ch = value[i];
    if (ch === trigger) {
      const before = i > 0 ? value[i - 1] : "";
      if (before === "" || WHITESPACE.test(before)) {
        return { triggerIndex: i, query: value.slice(i + 1, caret) };
      }
      // Trigger is glued to a preceding word char (e.g. an email) — not a mention.
      return null;
    }
    // Whitespace before reaching a trigger means the caret isn't inside a query.
    if (WHITESPACE.test(ch)) return null;
    i--;
  }
  return null;
}

/**
 * Whether a given `inputType` (from an `InputEvent`) is one that may OPEN the
 * menu. Paste never opens it (`insertFromPaste`); only real typing does. The
 * caller separately guards `event.isComposing` for IME safety.
 */
export function isMenuOpeningInput(inputType: string | undefined): boolean {
  if (!inputType) return true; // older browsers omit inputType; treat as typing
  return inputType !== "insertFromPaste" && inputType !== "insertFromDrop";
}

/**
 * Remove the `@query` span (trigger char through the caret) from `value`,
 * returning the new value + the caret position after removal. Used on select to
 * strip the typed query while leaving the rest of the prose intact.
 */
export function stripMentionQuery(
  value: string,
  match: MentionTriggerMatch,
  caret: number
): { value: string; caret: number } {
  const next = value.slice(0, match.triggerIndex) + value.slice(caret);
  return { value: next, caret: match.triggerIndex };
}
