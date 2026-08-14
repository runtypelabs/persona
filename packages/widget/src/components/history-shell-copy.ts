/**
 * History copy the SHELL renders outside the lazy Messages chunk: the header
 * button, the destructive confirmations, the "show earlier messages" pill, and
 * the reset notices.
 *
 * Lives in core so a control can be labelled before the chunk loads. The chunk
 * spreads these defaults into its own resolved table, so every key still has
 * exactly one default. `AgentWidgetHistoryCopy` (types.ts) stays the single
 * authoritative host-facing type.
 *
 * House style: sentence case, no em-dashes, no all-caps.
 */

import type { AgentWidgetHistoryCopy } from "../types";

const SHELL_COPY_KEYS = [
  "viewTitle",
  "openHistoryLabel",
  "openHistoryBusyLabel",
  "newConversationLabel",
  // The rail toggle's pair: the shell renders the overlay trigger before the
  // chunk loads, and relabels the view's toggle while the rail floats.
  "expandLabel",
  "collapseLabel",
  // The rail's resize handle is shell chrome, not part of the view.
  "resizeLabel",
  "showEarlierMessagesLabel",
  "confirmCancelLabel",
  "deleteConversationConfirmTitle",
  "deleteConversationConfirm",
  "deleteConversationConfirmLabel",
  "clearHistoryConfirmTitle",
  "clearHistoryConfirm",
  "clearHistoryVerifiedConfirm",
  "clearHistoryConfirmLabel",
  "resetIdentityConfirmTitle",
  "resetIdentityConfirm",
  "resetIdentityConfirmLabel",
  "conversationDeletedNotice",
  "identityResetNotice",
  "identityResetUnconfirmedNotice",
] as const;

export type HistoryShellCopyKey = (typeof SHELL_COPY_KEYS)[number];

export type ResolvedHistoryShellCopy = Required<
  Pick<AgentWidgetHistoryCopy, HistoryShellCopyKey>
>;

export const HISTORY_SHELL_COPY_DEFAULTS: ResolvedHistoryShellCopy = {
  viewTitle: "Messages",
  openHistoryLabel: "Messages",
  openHistoryBusyLabel: "Messages, available once the reply finishes",
  newConversationLabel: "New conversation",
  expandLabel: "Expand conversation list",
  collapseLabel: "Collapse conversation list",
  resizeLabel: "Resize conversation list",
  showEarlierMessagesLabel: "Show earlier messages",
  confirmCancelLabel: "Cancel",
  deleteConversationConfirmTitle: "Delete conversation",
  deleteConversationConfirm: "Delete this conversation? This cannot be undone.",
  deleteConversationConfirmLabel: "Delete",
  clearHistoryConfirmTitle: "Delete all conversations",
  clearHistoryConfirm:
    "Delete all conversations for this assistant on this browser? This cannot be undone.",
  clearHistoryVerifiedConfirm:
    "Delete all conversations for this assistant and signed-in user? This cannot be undone.",
  clearHistoryConfirmLabel: "Delete all",
  resetIdentityConfirmTitle: "Forget this device",
  resetIdentityConfirm:
    "Forget this device? All Persona data stored in this browser is cleared. Records are not deleted elsewhere.",
  resetIdentityConfirmLabel: "Forget this device",
  conversationDeletedNotice:
    "That conversation was deleted. You are now in a new conversation.",
  identityResetNotice: "This device was forgotten.",
  identityResetUnconfirmedNotice:
    "This device was cleared here, but the server could not confirm it.",
};

/** Empty-string overrides are ignored so a control never loses its label. */
export function resolveHistoryShellCopy(
  copy: AgentWidgetHistoryCopy | undefined
): ResolvedHistoryShellCopy {
  if (!copy) return HISTORY_SHELL_COPY_DEFAULTS;
  const resolved = { ...HISTORY_SHELL_COPY_DEFAULTS };
  for (const key of SHELL_COPY_KEYS) {
    const value = copy[key];
    if (typeof value === "string" && value.length > 0) resolved[key] = value;
  }
  return resolved;
}
