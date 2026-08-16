/**
 * Resolved copy for the history ("Messages") view.
 *
 * `AgentWidgetHistoryCopy` (types.ts) is the single authoritative
 * host-overridable type; the defaults live here, in the chunk. The handful of
 * strings the shell must render before this chunk loads come from
 * `components/history-shell-copy.ts` so each key still has one default.
 *
 * House style: sentence case, no em-dashes, no all-caps.
 */

import type { AgentWidgetHistoryCopy } from "../../types";
import { HISTORY_SHELL_COPY_DEFAULTS } from "../history-shell-copy";

export type HistoryViewCopyInput = AgentWidgetHistoryCopy;

export type ResolvedHistoryViewCopy = Required<AgentWidgetHistoryCopy>;

export const HISTORY_VIEW_COPY_DEFAULTS: ResolvedHistoryViewCopy = {
  ...HISTORY_SHELL_COPY_DEFAULTS,
  emptyTitle: "No conversations yet",
  emptyDescription: "Start a conversation and it will show up here.",
  errorTitle: "Could not load conversations",
  errorDescription: "Something went wrong. Please try again.",
  retryLabel: "Retry",
  rateLimitedTitle: "Too many requests",
  rateLimitedDescription: "Please wait a moment before trying again.",
  groupStarred: "Starred",
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
  listOptionsLabel: "Conversation options",
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
