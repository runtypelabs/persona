import { createChunkLoader } from "./utils/chunk-loader";

/**
 * Loader indirection for the `ui-extras` chunk (`ui-extras-entry.ts`): UI glue
 * for opt-in or interaction-only features. The ESM/CJS fallback imports
 * `./ui-extras-entry` directly (inlined by `--splitting false`); the IIFE/CDN
 * build marks it external and registers a loader for the sibling
 * `ui-extras.js` chunk (see `index-global.ts`).
 */
export type UiExtrasModule = typeof import("./ui-extras-entry");

const { setLoader, load, provide, getSync } = createChunkLoader<UiExtrasModule>({
  fallbackImport: () => import("./ui-extras-entry"),
});

/** Override how the chunk is fetched (the IIFE build registers a sibling-URL loader). */
export const setUiExtrasLoader = setLoader;

/** Load the chunk. Memoized; retries after rejection. */
export const loadUiExtras = load;

/** Eagerly supply the module (`ui-extras-eager.ts`: npm builds and tests). */
export const provideUiExtras = provide;

/** Synchronous access once loaded/provided; null before that. */
export const getUiExtrasSync = getSync;
