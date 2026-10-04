import { createChunkLoader } from "./utils/chunk-loader";

/**
 * Loader indirection for the visitor-history REST functions
 * (`client-history.ts`). The
 * ESM/CJS fallback imports the package's own
 * `@runtypelabs/persona/client-history` subpath, which `build:client` marks external so
 * bundlers code-split it out of `dist/index.{js,cjs}`; the IIFE/CDN build marks
 * it external and registers a loader for the sibling `client-history.js`
 * chunk (see `index-global.ts`).
 */
export type ClientHistoryModule = typeof import("./client-history");

const { setLoader, load, provide } = createChunkLoader<ClientHistoryModule>({
  fallbackImport: () => import("@runtypelabs/persona/client-history"),
});

/** Override how the chunk is fetched (the IIFE build registers a sibling-URL loader). */
export const setClientHistoryLoader = setLoader;

/** Load the history REST functions. Memoized; retries after rejection. */
export const loadClientHistory = load;

/** Eagerly supply the module (`client-history-eager.ts`: tests). */
export const provideClientHistory = provide;
