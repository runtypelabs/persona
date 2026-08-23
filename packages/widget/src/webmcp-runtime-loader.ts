import { createChunkLoader } from "./utils/chunk-loader";
import type { WebMcpBridge, WebMcpBridgeDeps } from "./webmcp-runtime-entry";
import type { AgentWidgetWebMcpConfig } from "./types";

/**
 * Loader indirection for the lazy WebMCP bridge runtime. Stays in the core
 * bundle. The fallback import must be the literal package subpath:
 * `build:client` runs with `--splitting false`, so a relative import would be
 * inlined; the subpath is marked `--external` and resolves through the
 * package's own `exports` map at consumer runtime (see
 * `history-view-loader.ts` for the full rationale).
 */
export type WebMcpRuntimeModule = {
  WebMcpBridge: new (
    config: AgentWidgetWebMcpConfig,
    deps: WebMcpBridgeDeps
  ) => WebMcpBridge;
};

const { setLoader, load } = createChunkLoader<WebMcpRuntimeModule>({
  fallbackImport: () => import("@runtypelabs/persona/webmcp-runtime"),
});

/** Override how the chunk is fetched (the IIFE build registers a sibling-URL loader). */
export const setWebMcpRuntimeLoader = setLoader;

/** Load the bridge runtime. Memoized; retries after rejection. */
export const loadWebMcpRuntime = load;
