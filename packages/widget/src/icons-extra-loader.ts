import { createChunkLoader } from "./utils/chunk-loader";
import type { IconNode } from "lucide";

/**
 * Loader indirection for the lazy icons-extra chunk (the config-only tail of
 * the icon registry). Stays in the core bundle AND the critical launcher
 * bundle — both register sibling-URL loaders in their IIFE entries, so a
 * launcher configured with a non-core icon paints a sized placeholder and
 * fills within one round-trip instead of shipping the whole registry.
 *
 * The fallback import must be the literal package subpath: `build:client` and
 * the launcher build run without splitting, so a relative import would be
 * inlined; the subpath is marked external in both builds and resolves through
 * the package's own `exports` map at consumer runtime (see
 * `history-view-loader.ts` for the full rationale).
 */
export type IconsExtraModule = {
  EXTRA_LUCIDE_ICONS: Record<string, IconNode>;
};

const { setLoader, load } = createChunkLoader<IconsExtraModule>({
  fallbackImport: () => import("@runtypelabs/persona/icons-extra"),
});

/** Override how the chunk is fetched (each IIFE registers a sibling-URL loader). */
export const setIconsExtraLoader = setLoader;

/** Load the extra icon data. Memoized; retries after rejection. */
export const loadIconsExtra = load;
