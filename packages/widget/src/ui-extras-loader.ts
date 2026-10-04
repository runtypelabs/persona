import { createChunkLoader } from "./utils/chunk-loader";

/**
 * Loader indirection for the `ui-extras` chunk (`ui-extras-entry.ts`): UI glue
 * for opt-in or interaction-only features. The
 * ESM/CJS fallback imports the package's own
 * `@runtypelabs/persona/ui-extras` subpath, which `build:client` marks external so
 * bundlers code-split it out of `dist/index.{js,cjs}`; the IIFE/CDN build marks it
 * external and registers a loader for the sibling `ui-extras.js` chunk (see
 * `index-global.ts`).
 */
export type UiExtrasModule = typeof import("./ui-extras-entry");

const { setLoader, load, provide, getSync } = createChunkLoader<UiExtrasModule>({
  fallbackImport: () => import("@runtypelabs/persona/ui-extras"),
});

/** Override how the chunk is fetched (the IIFE build registers a sibling-URL loader). */
export const setUiExtrasLoader = setLoader;

/** Load the chunk. Memoized; retries after rejection. */
export const loadUiExtras = load;

/** Eagerly supply the module (`ui-extras-eager.ts`: tests). */
export const provideUiExtras = provide;

/** Synchronous access once loaded/provided; null before that. */
export const getUiExtrasSync = getSync;
