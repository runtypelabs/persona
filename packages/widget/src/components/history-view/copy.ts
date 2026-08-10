/**
 * Resolved copy for the history ("Messages") view.
 *
 * `AgentWidgetHistoryCopy` (types.ts) is the public, host-overridable surface.
 * The view needs a handful of additional labels that the public interface does
 * not carry yet; they live in `HistoryViewExtraCopy` and are accepted through
 * the same `copy` option, so a later types.ts addition is a pure move.
 *
 * House style: sentence case, no em-dashes, no all-caps.
 */

import type { AgentWidgetHistoryCopy } from "../../types";

/** View-local labels not yet present in `AgentWidgetHistoryCopy`. */
export interface HistoryViewExtraCopy {
  /** Panel back control (returns to the invoking surface). */
  backLabel: string;
  /** Rail close control. */
  closeLabel: string;
  loadingLabel: string;
  loadMoreLabel: string;
  loadingMoreLabel: string;
  /** Accessible name of the per-row overflow trigger and its menu. */
  rowActionsLabel: string;
  deleteConversationLabel: string;
  clearHistoryLabel: string;
  resetIdentityLabel: string;
  /** `{count}` placeholder. */
  messageCountLabel: string;
  messageCountLabelOne: string;
  conversationRemovedNotice: string;
  historyClearedNotice: string;
  unavailableTitle: string;
  unavailableDescription: string;
  newConversationRequiredTitle: string;
  newConversationRequiredDescription: string;
  /** `{seconds}` placeholder. */
  rateLimitedWaitDescription: string;
  openFailedLabel: string;
  deleteFailedLabel: string;
  relativeNow: string;
  /** `{value}` placeholder on each relative-time unit. */
  relativeMinutes: string;
  relativeHours: string;
  relativeDays: string;
  relativeWeeks: string;
  relativeYears: string;
}

export type HistoryViewCopyInput = AgentWidgetHistoryCopy &
  Partial<HistoryViewExtraCopy>;

export type ResolvedHistoryViewCopy = Required<AgentWidgetHistoryCopy> &
  HistoryViewExtraCopy;

export const HISTORY_VIEW_COPY_DEFAULTS: ResolvedHistoryViewCopy = {
  viewTitle: "Messages",
  emptyTitle: "No conversations yet",
  emptyDescription: "Start a conversation and it will show up here.",
  errorTitle: "Could not load conversations",
  errorDescription: "Something went wrong. Please try again.",
  retryLabel: "Retry",
  rateLimitedTitle: "Too many requests",
  rateLimitedDescription: "Please wait a moment before trying again.",
  deleteConversationConfirm: "Delete this conversation? This cannot be undone.",
  clearHistoryConfirm:
    "Delete all conversations for this assistant on this browser? This cannot be undone.",
  resetIdentityConfirm:
    "Forget this device? All Persona data stored in this browser is cleared. Records are not deleted elsewhere.",
  newConversationLabel: "New conversation",
  showEarlierMessagesLabel: "Show earlier messages",
  conversationDeletedNotice:
    "That conversation was deleted. You are now in a new conversation.",
  identityResetNotice: "This device was forgotten.",
  identityResetUnconfirmedNotice:
    "This device was cleared here, but the server could not confirm it.",
  groupToday: "Today",
  groupYesterday: "Yesterday",
  groupPrevious7Days: "Previous 7 days",
  groupPrevious30Days: "Previous 30 days",
  groupMonthYear: "{month} {year}",
  browserOnlyTitle: "Messages on this device",
  browserOnlyDescription:
    "Another browser or device keeps its own separate history.",
  verifyingTitle: "Checking your account",
  verifyingDescription: "Looking for messages linked to your account.",
  verifiedTitle: "Available across signed-in devices",
  verifiedDescription:
    "This list refreshes when the chat opens rather than syncing live.",
  authenticationRequiredTitle: "Sign in to see your messages",
  authenticationRequiredDescription:
    "Your session expired. Sign in again to load account history.",
  identityProviderFailedTitle: "Account history is unavailable",
  identityProviderFailedDescription:
    "We could not verify your account, so account history is not shown here.",
  proofNotAdmittedTitle: "Account history is unavailable",
  proofNotAdmittedDescription:
    "This assistant is not set up to accept your account identity.",
  retryIdentityLabel: "Try again",

  backLabel: "Back to conversation",
  closeLabel: "Close conversation list",
  loadingLabel: "Loading conversations",
  loadMoreLabel: "Load more",
  loadingMoreLabel: "Loading more conversations",
  rowActionsLabel: "Conversation options",
  deleteConversationLabel: "Delete",
  clearHistoryLabel: "Delete all conversations",
  resetIdentityLabel: "Forget this device",
  messageCountLabel: "{count} messages",
  messageCountLabelOne: "1 message",
  conversationRemovedNotice: "Conversation deleted.",
  historyClearedNotice: "All conversations were deleted.",
  unavailableTitle: "Conversation history is unavailable",
  unavailableDescription: "Try again later.",
  newConversationRequiredTitle: "Start a new conversation",
  newConversationRequiredDescription:
    "The previous conversation is gone. Start a new one to keep chatting.",
  rateLimitedWaitDescription: "You can try again in {seconds} seconds.",
  openFailedLabel: "Could not open that conversation.",
  deleteFailedLabel: "Could not delete that conversation.",
  relativeNow: "now",
  relativeMinutes: "{value}m",
  relativeHours: "{value}h",
  relativeDays: "{value}d",
  relativeWeeks: "{value}w",
  relativeYears: "{value}y",
};

/** Idempotent: safe to call on an already-resolved copy object. */
export function resolveHistoryViewCopy(
  copy: HistoryViewCopyInput | undefined
): ResolvedHistoryViewCopy {
  if (!copy) return HISTORY_VIEW_COPY_DEFAULTS;
  const resolved = { ...HISTORY_VIEW_COPY_DEFAULTS };
  for (const [key, value] of Object.entries(copy)) {
    if (typeof value === "string" && value.length > 0) {
      (resolved as Record<string, string>)[key] = value;
    }
  }
  return resolved;
}

/** `{name}` substitution. Missing keys are left alone rather than blanked. */
export function fillTemplate(
  template: string,
  values: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );
}
