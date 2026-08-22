/**
 * Registers the extra-tier icon data synchronously for the bundled npm build,
 * so `renderLucideIcon` keeps its historical all-sync contract there. Imported
 * ONLY from `index.ts` (side effect) — the IIFE/CDN entry does not import
 * this; it lazy-loads the `icons-extra.js` sibling chunk instead. Mirrors
 * `markdown-parsers-eager.ts`.
 */
import { EXTRA_LUCIDE_ICONS } from "./icons-extra";
import { __eagerlyProvideExtraIcons } from "./utils/icons";

__eagerlyProvideExtraIcons(EXTRA_LUCIDE_ICONS);
