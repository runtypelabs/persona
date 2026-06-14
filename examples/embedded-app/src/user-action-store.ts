/**
 * userAction: per-message record of a finalized user interaction with a
 * component the AI rendered into the conversation. Generic across forms,
 * polls, approvals, quizzes, etc.
 *
 * Schema:
 *   {
 *     type: string,         // verb: "submit" | "vote" | "approve" | "deny" | "answer" | …
 *     data: unknown,        // type-specific payload
 *     completedAt: string,  // ISO 8601 of when the user finalized the action
 *   }
 *
 * Demo persistence: window.localStorage, scoped per message id.
 * The key shape is namespaced + versioned so future migrations
 * (e.g. adding conversationId scoping) don't collide with existing entries.
 */

export interface UserAction<T = unknown> {
  type: string;
  data: T;
  completedAt: string;
}

const STORAGE_PREFIX = "persona:userAction:v1:";

function key(messageId: string): string {
  return `${STORAGE_PREFIX}${messageId}`;
}

export function getUserAction<T = unknown>(messageId: string): UserAction<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage?.getItem(key(messageId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserAction<T>;
    if (typeof parsed?.type !== "string" || typeof parsed?.completedAt !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setUserAction<T = unknown>(
  messageId: string,
  action: { type: string; data: T; completedAt?: string }
): void {
  if (typeof window === "undefined") return;
  const record: UserAction<T> = {
    type: action.type,
    data: action.data,
    completedAt: action.completedAt ?? new Date().toISOString(),
  };
  try {
    window.localStorage?.setItem(key(messageId), JSON.stringify(record));
  } catch {
    // ignore quota / disabled storage
  }
}

export function clearUserAction(messageId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.removeItem(key(messageId));
  } catch {
    // ignore
  }
}
