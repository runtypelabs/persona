import { createChunkLoader } from "./utils/chunk-loader";
import type { VoiceClientTools, VoiceClientToolsChannel, VoiceClientToolsSession } from "./types";

/**
 * Loader indirection for the lazy voice fast-tier chunk. Stays in the core
 * bundle; the fallback import must be the literal package subpath (see
 * `webmcp-runtime-loader.ts`).
 */
export type VoiceClientToolsModule = {
  createVoiceClientToolsSession: (
    surface: VoiceClientTools,
    channel: VoiceClientToolsChannel
  ) => VoiceClientToolsSession;
};

const { setLoader, load } = createChunkLoader<VoiceClientToolsModule>({
  fallbackImport: () => import("@runtypelabs/persona/voice-client-tools"),
});

/** Override how the chunk is fetched (the IIFE build registers a sibling-URL loader). */
export const setVoiceClientToolsLoader = setLoader;

/** Load the fast-tier chunk. Memoized; retries after rejection. */
export const loadVoiceClientTools = load;
