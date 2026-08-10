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
} from "./components/history-view";
