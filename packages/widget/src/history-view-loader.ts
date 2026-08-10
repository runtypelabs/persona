/**
 * Loader indirection for the lazy history-view chunk (core bundle, tiny).
 *
 * Mirrors `context-mentions-loader.ts`: the IIFE/CDN entry (`index-global.ts`)
 * registers a loader that imports the standalone `history-view.js` chunk from a
 * sibling URL. ESM/CJS consumers fall back to importing the package's
 * `./history-view` subpath — which `build:client` marks external, so the view is
 * NOT inlined into `dist/index.{js,cjs}` and stays out of the core bundle until
 * the history UI is first opened. (A relative `./history-view-entry` import
 * would be inlined by the `--splitting false` build, defeating the split.)
 */

import { createChunkLoader } from "./utils/chunk-loader";
import type {
  HistoryViewOptions,
  HistoryViewHandle,
} from "./history-view-entry";

export type HistoryViewModule = {
  createHistoryView: (options: HistoryViewOptions) => HistoryViewHandle;
};

// IIFE/CDN: sibling-URL chunk via the registered loader.
// ESM/CJS fallback: the package's own `./history-view` subpath (external, so the
// runtime chunk is code-split out of dist/index.{js,cjs} rather than inlined).
// Memoization + rejection-retry semantics live in `createChunkLoader`.
const { setLoader, load } = createChunkLoader<HistoryViewModule>({
  fallbackImport: () => import("@runtypelabs/persona/history-view"),
});

export const setHistoryViewLoader = setLoader;
export const loadHistoryView = load;
