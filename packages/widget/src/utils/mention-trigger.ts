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

/**
 * Where a trigger may open. `"anywhere"` is the `@` rule (after any whitespace/
 * start); `"line-start"` and `"input-start"` are the natural rules for `/`
 * slash-commands. Kept as a local string union so the parser stays free of the
 * public config types.
 */
export type MentionTriggerPosition = "anywhere" | "line-start" | "input-start";

/** One trigger channel for `parseAnyTrigger` — a char plus its position rule. */
export type MentionTriggerSpec = {
  trigger: string;
  position?: MentionTriggerPosition;
  /**
   * Allow the query to span spaces/tabs (a newline still ends it). Needed for
   * slash-command ARGS (`/deploy staging` → query `"deploy staging"`); leave
   * false for single-token `@` mentions (a space ends the mention).
   */
  allowSpaces?: boolean;
};

const WHITESPACE = /\s/;

/** Does `triggerIndex` satisfy the channel's position rule? */
function positionAllowed(
  value: string,
  triggerIndex: number,
  position: MentionTriggerPosition
): boolean {
  if (position === "input-start") return triggerIndex === 0;
  const before = triggerIndex > 0 ? value[triggerIndex - 1] : "";
  if (position === "line-start") return before === "" || before === "\n";
  // "anywhere": preceded by whitespace or start (also excludes `user@example.com`).
  return before === "" || WHITESPACE.test(before);
}

/**
 * Detect an active mention trigger ending at `caret`.
 *
 * Active when, scanning back from the caret, a trigger char is reached with no
 * intervening whitespace AND the trigger satisfies `position`. Returns `null`
 * otherwise — notably for `user@example.com` (trigger glued to a word char) and
 * once a space follows the trigger.
 *
 * @param value       Full textarea value.
 * @param caret       Caret offset (selectionStart). Out-of-range → `null`.
 * @param trigger     Single trigger character. @default "@"
 * @param position    Where the trigger may open. @default "anywhere"
 * @param allowSpaces Let the query span spaces/tabs (for command args). @default false
 */
export function parseMentionTrigger(
  value: string,
  caret: number,
  trigger = "@",
  position: MentionTriggerPosition = "anywhere",
  allowSpaces = false
): MentionTriggerMatch | null {
  if (!trigger) return null;
  if (caret <= 0 || caret > value.length) return null;

  let i = caret - 1;
  while (i >= 0) {
    const ch = value[i];
    if (ch === trigger) {
      if (positionAllowed(value, i, position)) {
        return { triggerIndex: i, query: value.slice(i + 1, caret) };
      }
      // Trigger present but disallowed here (glued word char / not line-start).
      return null;
    }
    // A newline always ends the query. Spaces/tabs end it too, unless the
    // channel allows multi-word queries (slash-command args).
    if (ch === "\n") return null;
    if (!allowSpaces && WHITESPACE.test(ch)) return null;
    i--;
  }
  return null;
}

/**
 * Resolve which of several trigger channels is active at `caret`. Channels are
 * tested in order; the FIRST with an active match wins (put `@` first, `/`
 * next). At any caret at most one channel can match — the scan stops at the
 * nearest trigger/whitespace — so ordering only matters if two channels share a
 * trigger char (don't do that). Returns the winning channel index + its match.
 */
export function parseAnyTrigger<T extends MentionTriggerSpec>(
  value: string,
  caret: number,
  channels: readonly T[]
): { channelIndex: number; channel: T; match: MentionTriggerMatch } | null {
  for (let c = 0; c < channels.length; c++) {
    const channel = channels[c];
    const match = parseMentionTrigger(
      value,
      caret,
      channel.trigger,
      channel.position ?? "anywhere",
      channel.allowSpaces ?? false
    );
    if (match) return { channelIndex: c, channel, match };
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
