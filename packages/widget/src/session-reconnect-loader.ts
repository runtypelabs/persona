import { createChunkLoader } from "./utils/chunk-loader";
import type { ReconnectController, ReconnectHost } from "./session-reconnect";

/**
 * Loader indirection for the lazy session-reconnect chunk. Stays in the core
 * bundle. `build:client` runs with `--splitting false`, so the previous
 * relative `import("./session-reconnect")` was INLINED into the core bundles
 * (deferred evaluation, zero byte savings); the package subpath is marked
 * `--external` and resolves through the package's own `exports` map at
 * consumer runtime (see `history-view-loader.ts` for the full rationale).
 */
export type SessionReconnectModule = {
  createReconnectController: (host: ReconnectHost) => ReconnectController;
};

const { setLoader, load } = createChunkLoader<SessionReconnectModule>({
  fallbackImport: () => import("@runtypelabs/persona/session-reconnect"),
});

/** Override how the chunk is fetched (the IIFE build registers a sibling-URL loader). */
export const setSessionReconnectLoader = setLoader;

/** Load the reconnect controller factory. Memoized; retries after rejection. */
export const loadSessionReconnect = load;
