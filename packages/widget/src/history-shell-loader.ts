import { createChunkLoader } from "./utils/chunk-loader";
import type { createHistoryShell } from "./history-shell";

/**
 * Loader indirection for the visitor-history shell (`history-shell.ts`). The
 * ESM/CJS fallback imports `./history-shell` directly (inlined by
 * `--splitting false`, and provided eagerly by `history-shell-eager.ts`); the
 * IIFE/CDN build marks it external and registers a loader for the sibling
 * `history-shell.js` chunk (see `index-global.ts`).
 */
export type HistoryShellModule = { createHistoryShell: typeof createHistoryShell };

const { setLoader, load, provide, getSync } = createChunkLoader<HistoryShellModule>({
  fallbackImport: () => import("./history-shell"),
});

/** Override how the chunk is fetched (the IIFE build registers a sibling-URL loader). */
export const setHistoryShellLoader = setLoader;

/** Load the history shell. Memoized; retries after rejection. */
export const loadHistoryShell = load;

/** Eagerly supply the module (`history-shell-eager.ts`: npm builds and tests). */
export const provideHistoryShell = provide;

/** Synchronous access once loaded/provided; null before that. */
export const getHistoryShellSync = getSync;
