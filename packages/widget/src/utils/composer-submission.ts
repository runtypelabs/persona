/**
 * Composer submission snapshot.
 *
 * Every send builds one internal snapshot. The internal shape may carry mention
 * finalizers and attachment handles; `toPublicSubmissionSnapshot` strips those
 * and freezes what remains, so `onBeforeSend` can never reach live composer
 * internals or mutate the outgoing payload in place.
 */

import type {
  AgentWidgetComposerConfig,
  AgentWidgetContentSegment,
  AgentWidgetContextMentionRef,
  ComposerBeforeSendResult,
  ComposerSubmissionOptions,
  ComposerSubmissionSnapshot,
  ContentPart,
} from "../types";

/** Mention bundle carried through submission; resolved inside `sendMessage`. */
export type SubmissionMentions = {
  refs: AgentWidgetContextMentionRef[];
  finalize: () => Promise<unknown>;
};

export type InternalSubmissionSnapshot = {
  text: string;
  contentParts?: ContentPart[];
  mentionRefs: AgentWidgetContextMentionRef[];
  contentSegments?: AgentWidgetContentSegment[];
  options: ComposerSubmissionOptions;
  viaVoice?: boolean;
  /** Non-public: async mention resolution handed to the session. */
  mentions?: SubmissionMentions | null;
};

/**
 * Freeze the public projection. Arrays are copied so a caller holding the
 * snapshot cannot reach the live payload; nested host-owned payloads (mention
 * refs, content parts) are shared by reference and left unfrozen.
 */
export function toPublicSubmissionSnapshot(
  snapshot: InternalSubmissionSnapshot
): Readonly<ComposerSubmissionSnapshot> {
  return Object.freeze({
    text: snapshot.text,
    contentParts: snapshot.contentParts
      ? Object.freeze([...snapshot.contentParts])
      : undefined,
    mentionRefs: Object.freeze([...snapshot.mentionRefs]),
    contentSegments: snapshot.contentSegments
      ? Object.freeze([...snapshot.contentSegments])
      : undefined,
    options: Object.freeze({ ...snapshot.options }),
    viaVoice: snapshot.viaVoice,
  }) as Readonly<ComposerSubmissionSnapshot>;
}

/**
 * Step 3 of the submission order: composer locks, attachment readiness, then
 * normal send eligibility. A send needs text, a ready attachment, a mention
 * chip, or an inline server command's context bundle.
 *
 * Every submission path funnels through this gate, so `inputDisabled` and
 * `sendDisabled` cannot be bypassed by any caller that skips DOM buttons
 * (suggestions, dictation, plugin actions, the controller).
 */
export function canSubmitComposer(input: {
  text: string;
  hasAttachments: boolean;
  attachmentsReady: boolean;
  hasMentions: boolean;
  hasServerMentions: boolean;
  inputDisabled?: boolean;
  sendDisabled?: boolean;
}): boolean {
  if (input.inputDisabled === true || input.sendDisabled === true) return false;
  if (input.hasAttachments && !input.attachmentsReady) return false;
  return (
    !!input.text ||
    input.hasAttachments ||
    input.hasMentions ||
    input.hasServerMentions
  );
}

export type BeforeSendOutcome =
  | { status: "proceed" }
  | { status: "canceled" }
  | { status: "aborted" }
  | { status: "error"; error: unknown };

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as PromiseLike<unknown> | null)?.then === "function";

/**
 * Apply an `onBeforeSend` result to the outgoing snapshot. Only `text` and
 * `options` are patchable; attachments and mentions keep their own state
 * machines.
 */
export function applyBeforeSendResult(
  snapshot: InternalSubmissionSnapshot,
  result: ComposerBeforeSendResult
): BeforeSendOutcome {
  if (result === false) return { status: "canceled" };
  if (!result || typeof result !== "object") return { status: "proceed" };
  if (typeof result.text === "string") snapshot.text = result.text;
  if (result.options) {
    snapshot.options = { ...snapshot.options, ...result.options };
  }
  return { status: "proceed" };
}

/**
 * Run the hook against a frozen public snapshot. Stays synchronous when the
 * hook is synchronous, so send paths that never awaited before still don't.
 */
export function runBeforeSend(
  hook: NonNullable<AgentWidgetComposerConfig["onBeforeSend"]>,
  snapshot: InternalSubmissionSnapshot,
  signal: AbortSignal
): BeforeSendOutcome | Promise<BeforeSendOutcome> {
  let result: ComposerBeforeSendResult | Promise<ComposerBeforeSendResult>;
  try {
    result = hook(toPublicSubmissionSnapshot(snapshot), { signal });
  } catch (error) {
    return { status: "error", error };
  }
  if (!isThenable(result)) {
    return applyBeforeSendResult(snapshot, result as ComposerBeforeSendResult);
  }
  return Promise.resolve(result).then(
    (settled): BeforeSendOutcome => {
      if (signal.aborted) return { status: "aborted" };
      return applyBeforeSendResult(snapshot, settled);
    },
    (error): BeforeSendOutcome =>
      signal.aborted ? { status: "aborted" } : { status: "error", error }
  );
}
