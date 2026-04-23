/**
 * IIFE entry point — bundled for `<script>` tag consumers.
 *
 * This file re-exports everything from the main entry AND side-imports all
 * built-in subpath animations so they register automatically. Script-tag
 * users who include the global build don't need extra script tags or
 * registration calls — setting `features.streamAnimation.type` to any
 * built-in name just works.
 *
 * npm consumers continue to import from the main entry (`import ... from
 * "@runtypelabs/persona"`) — those animations stay in their subpath
 * modules so bundlers can tree-shake them.
 */

// Re-export the full public API.
export * from "./index";

// Side-import the remaining subpath animations so they're available to
// script-tag consumers without an explicit import. (`letter-rise` and
// `word-fade` are core built-ins and register automatically.)
import "./animations/wipe";
import "./animations/glyph-cycle";

// Expose plugin-registration helpers on the global so custom animations
// can be registered from inline `<script>` blocks or third-party CDN scripts.
export {
  registerStreamAnimationPlugin,
  unregisterStreamAnimationPlugin,
  listRegisteredStreamAnimations,
} from "./utils/stream-animation";
export type { StreamAnimationPlugin, StreamAnimationContext } from "./types";
