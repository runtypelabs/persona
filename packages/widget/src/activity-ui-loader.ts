import { createChunkLoader } from "./utils/chunk-loader";

/**
 * Loader indirection for the lazy activity-ui chunk (tool / reasoning bubbles,
 * activity rows). Stays in the core bundle. The fallback import must be the
 * literal package subpath: `build:client` runs with `--splitting false`, so a
 * relative import would be inlined; the subpath is marked `--external` and
 * resolves through the package's own `exports` map at consumer runtime (see
 * `history-view-loader.ts` for the full rationale).
 */
export type ActivityUiModule = typeof import("./activity-ui");

const { setLoader, load, provide, getSync } = createChunkLoader<ActivityUiModule>({
  fallbackImport: () => import("@runtypelabs/persona/activity-ui"),
});

/** Override how the chunk is fetched (the IIFE build registers a sibling-URL loader). */
export const setActivityUiLoader = setLoader;

/** Load the activity UI. Memoized; retries after rejection. */
export const loadActivityUi = load;

/** Eagerly supply the module (tests that assert synchronous tool/reasoning renders). */
export const provideActivityUi = provide;

/** Synchronous access once loaded/provided; null before that. */
export const getActivityUiSync = getSync;
