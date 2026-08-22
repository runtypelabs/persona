import { createChunkLoader } from "./utils/chunk-loader";

/**
 * Loader indirection for the lazy voice-runtime chunk. Stays in the core
 * bundle. The fallback import must be the literal package subpath (see
 * `history-view-loader.ts` for the `--splitting false` rationale).
 */
export type VoiceRuntimeModule = typeof import("./voice-runtime");

const { setLoader, load } = createChunkLoader<VoiceRuntimeModule>({
  fallbackImport: () => import("@runtypelabs/persona/voice-runtime"),
});

/** Override how the chunk is fetched (the IIFE build registers a sibling-URL loader). */
export const setVoiceRuntimeLoader = setLoader;

/** Load the voice provider runtime. Memoized; retries after rejection. */
export const loadVoiceRuntime = load;
