import { createChunkLoader } from "./utils/chunk-loader";

/**
 * Loader indirection for the SSE stream processor (`client-stream.ts`). The
 * ESM/CJS fallback imports `./client-stream` directly (inlined by
 * `--splitting false`); the IIFE/CDN build marks it external and registers a
 * loader for the sibling `client-stream.js` chunk (see `index-global.ts`).
 */
export type ClientStreamModule = typeof import("./client-stream");

const { setLoader, load, provide, getSync } = createChunkLoader<ClientStreamModule>({
  fallbackImport: () => import("./client-stream"),
});

/** Override how the chunk is fetched (the IIFE build registers a sibling-URL loader). */
export const setClientStreamLoader = setLoader;

/** Load the stream processor. Memoized; retries after rejection. */
export const loadClientStream = load;

/** Eagerly supply the module (`client-stream-eager.ts`: npm builds and tests). */
export const provideClientStream = provide;

/** Synchronous access once loaded/provided; null before that. */
export const getClientStreamSync = getSync;
