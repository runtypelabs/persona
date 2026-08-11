/**
 * History-view runtime entry — the module that assembles the lazily loaded
 * Messages surface. It is NEVER statically imported on the core path: the
 * IIFE/CDN build marks `@runtypelabs/persona/history-view` external
 * (`tsup.global.config.ts`) and loads the standalone `history-view.js` chunk
 * from a sibling URL on first open of the history UI. The core reaches it
 * through `history-view-loader.ts`.
 *
 * Mirrors `context-mentions-entry.ts`; see
 * `docs/visitor-history-implementation-plan.md` D7 (Bundle size).
 */

export { createHistoryView } from "./components/history-view";
export type {
  HistoryViewOptions,
  HistoryViewHandle,
  HistoryViewPresentation,
  HistoryHeaderPlacement,
  HistoryViewPendingAction,
  HistoryViewModel,
  HistoryViewOperations,
  HistoryViewSlotRenderers,
  HistoryHeaderSlotContext,
  HistoryConversationSlotContext,
  HistoryStateSlotContext,
} from "./components/history-view";
export {
  HISTORY_VIEW_COPY_DEFAULTS,
  resolveHistoryViewCopy,
} from "./components/history-view/copy";
export type {
  HistoryViewCopyInput,
  ResolvedHistoryViewCopy,
} from "./components/history-view/copy";
export type {
  HistoryListState,
  HistoryListErrorReason,
} from "./components/history-view/state";
