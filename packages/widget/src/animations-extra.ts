/**
 * Standalone chunk bundling the subpath stream animations (`wipe`,
 * `glyph-cycle`). Importing this module registers both plugins as a side
 * effect (each animation module self-registers on import).
 *
 * npm consumers keep importing the individual
 * `@runtypelabs/persona/animations/*` subpaths; this chunk exists so the
 * IIFE/CDN bundle can drop its eager side-imports and fetch the plugins only
 * when `features.streamAnimation.type` selects one. See
 * `src/animations-extra-loader.ts` and the loader registration in
 * `src/index-global.ts`.
 */
import wipe from "./animations/wipe";
import glyphCycle from "./animations/glyph-cycle";

export { wipe, glyphCycle };
