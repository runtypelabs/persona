import { createChunkLoader } from "./utils/chunk-loader";
import type { createHistoryShell } from "./history-shell";

/** On-demand visitor-history shell, shared by CDN and npm builds. */
export type HistoryShellModule = { createHistoryShell: typeof createHistoryShell };

const { setLoader, load, provide, getSync } = createChunkLoader<HistoryShellModule>({
  fallbackImport: () => import("@runtypelabs/persona/history-shell"),
});

/** Override how the chunk is fetched (the IIFE build registers a sibling-URL loader). */
export const setHistoryShellLoader = setLoader;

/** Load the history shell. Memoized; retries after rejection. */
export const loadHistoryShell = load;

/** Eagerly supply the module (`history-shell-eager.ts`: tests). */
export const provideHistoryShell = provide;

/** Synchronous access once loaded/provided; null before that. */
export const getHistoryShellSync = getSync;
