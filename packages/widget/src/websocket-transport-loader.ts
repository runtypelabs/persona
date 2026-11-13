import { createChunkLoader } from "./utils/chunk-loader";

/**
 * Loader indirection for the lazy WebSocket transport chunk. The ESM/CJS
 * builds resolve the external `@runtypelabs/persona/websocket-transport`
 * subpath; the IIFE build registers a sibling-URL loader (`index-global.ts`).
 */
export type WebSocketTransportModule = typeof import("./websocket-transport");

const { setLoader, load, getSync } = createChunkLoader<WebSocketTransportModule>({
  fallbackImport: () => import("@runtypelabs/persona/websocket-transport"),
});

export const setWebSocketTransportLoader = setLoader;

/**
 * Load the WebSocket transport module (`createWebSocketTransport` and the
 * Runtype client-session codec). Memoized; retries after a failed fetch.
 */
export const loadWebSocketTransport = load;

export const getWebSocketTransportSync = getSync;
