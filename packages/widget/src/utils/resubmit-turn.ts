/**
 * User-turn boundary for `session.resubmitFrom`.
 *
 * A turn is the user message plus everything the assistant produced for it:
 * assistant text, reasoning, tool, approval, and system variants. It ends at the
 * next user message, which starts the next turn.
 */

export type TurnBoundaryMessage = {
  id: string;
  role: string;
};

export type TurnBoundary = {
  /** Index of the user message that opens the turn. */
  start: number;
  /** Exclusive index where the turn ends (the next user message, or length). */
  end: number;
};

/**
 * Locate the turn opened by `messageId`. Returns null when the id is absent or
 * does not name a user message: retry and edit both anchor on a user turn.
 */
export function findUserTurnBoundary(
  messages: readonly TurnBoundaryMessage[],
  messageId: string
): TurnBoundary | null {
  const start = messages.findIndex((message) => message.id === messageId);
  if (start === -1 || messages[start].role !== "user") return null;
  let end = start + 1;
  while (end < messages.length && messages[end].role !== "user") end += 1;
  return { start, end };
}

/**
 * The user message that a retry of `messageId` (an assistant message) should
 * replay: the nearest preceding user message. Returns null when the assistant
 * message opens the transcript with no user turn behind it.
 */
export function findPrecedingUserMessageId(
  messages: readonly TurnBoundaryMessage[],
  messageId: string
): string | null {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index <= 0) return null;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") return messages[i].id;
  }
  return null;
}

/**
 * Id of the message that carries the retry affordance: the last plain assistant
 * bubble of the final turn, when that turn has a user message behind it and
 * nothing in it is still streaming. Variant bubbles (reasoning, tool, approval)
 * render their own chrome and never host message actions.
 */
export function findRetryableAssistantMessageId(
  messages: readonly (TurnBoundaryMessage & {
    streaming?: boolean;
    variant?: string;
  })[]
): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role === "user") return null;
    if (message.streaming) return null;
    if (message.role !== "assistant" || message.variant) continue;
    return findPrecedingUserMessageId(messages, message.id) ? message.id : null;
  }
  return null;
}

/**
 * Edit eligibility (doc section 10 initial scope): text-only user messages
 * only. Anything carrying hidden context a plain textarea would drop is
 * ineligible, so edit never silently rewrites a richer message.
 */
export function isEditableUserMessage(message: {
  role: string;
  content?: string;
  contentParts?: unknown[];
  contextMentions?: unknown[];
  contentSegments?: unknown[];
  mentionContext?: Record<string, unknown>;
  llmContent?: string;
  rawContent?: string;
  variant?: string;
  streaming?: boolean;
  quote?: unknown;
}): boolean {
  if (message.role !== "user" || message.variant || message.streaming) return false;
  if (message.contentParts?.length) return false;
  if (message.contextMentions?.length) return false;
  if (message.contentSegments?.length) return false;
  if (message.mentionContext && Object.keys(message.mentionContext).length > 0) {
    return false;
  }
  if (message.rawContent !== undefined) return false;
  if (message.llmContent !== undefined && message.llmContent !== message.content) {
    return false;
  }
  if (message.quote) return false;
  return typeof message.content === "string" && message.content.length > 0;
}
