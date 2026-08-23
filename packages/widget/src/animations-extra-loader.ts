import { createChunkLoader } from "./utils/chunk-loader";
import type { StreamAnimationPlugin } from "./types";

/**
 * Loader indirection for the `animations-extra` chunk (wipe + glyph-cycle).
 * Stays in the core bundle. The fallback import must be the literal package
 * subpath: `build:client` runs with `--splitting false`, so a relative import
 * would be inlined; the subpath is marked `--external` and resolves through
 * the package's own `exports` map at consumer runtime (see
 * `history-view-loader.ts` for the full rationale).
 */
export type AnimationsExtraModule = {
  wipe: StreamAnimationPlugin;
  glyphCycle: StreamAnimationPlugin;
};

const { setLoader, load } = createChunkLoader<AnimationsExtraModule>({
  fallbackImport: () => import("@runtypelabs/persona/animations-extra"),
});

/** Override how the chunk is fetched (the IIFE build registers a sibling-URL loader). */
export const setAnimationsExtraLoader = setLoader;

/** Load (and thereby register) the wipe + glyph-cycle plugins. Memoized; retries after rejection. */
export const loadAnimationsExtra = load;
