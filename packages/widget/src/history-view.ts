/**
 * Standalone history-view chunk (`dist/history-view.js`).
 *
 * The IIFE/CDN widget bundle marks `@runtypelabs/persona/history-view` external
 * so the Messages surface is excluded from the core payload; this file is built
 * as a self-contained sibling chunk (`tsup.history-view.config.ts`) and loaded on
 * demand by the loader registered in `index-global.ts`. ESM/CJS consumers reach
 * it via this same (external) subpath.
 *
 * Lazy-runtime transport entry only: exports are limited to the mount contract
 * the loader needs, NOT the public history provider/controller seam.
 */

export { createHistoryView } from "./history-view-entry";
export type { HistoryViewOptions, HistoryViewHandle } from "./history-view-entry";
