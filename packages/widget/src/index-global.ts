/**
 * IIFE entry point: bundled for `<script>` tag consumers.
 *
 * This file re-exports everything from the main entry AND side-imports all
 * built-in subpath animations so they register automatically. Script-tag
 * users who include the global build don't need extra script tags or
 * registration calls: setting `features.streamAnimation.type` to any
 * built-in name just works.
 *
 * npm consumers continue to import from the main entry (`import ... from
 * "@runtypelabs/persona"`): those animations stay in their subpath
 * modules so bundlers can tree-shake them.
 */

// Re-export the full public API: from `index-core` (NOT `index`) so the
// dev-only helpers (`generateCodeSnippet`, `createDemoCarousel`) stay out of the
// CDN/IIFE bundle. npm consumers still get them via the `index.ts` barrel.
export * from "./index-core";

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

// ---------------------------------------------------------------------------
// Deferred WebMCP polyfill loading.
//
// This bundle is built with `@mcp-b/webmcp-polyfill` external: the bridge's
// default `import("@mcp-b/webmcp-polyfill")` is a bare specifier no browser
// can resolve, so register a loader that imports the self-contained
// `webmcp-polyfill.js` chunk from a sibling URL instead. Mirrors how
// `install.ts` derives `launcher.global.js` from a `jsUrl` override.
// ---------------------------------------------------------------------------

import { setWebMcpPolyfillLoader } from "./webmcp-bridge";

// Capture at module-evaluation time: `document.currentScript` is null once
// execution leaves the script's initial synchronous run.
const widgetScriptSrc: string | null =
  typeof document !== "undefined"
    ? ((document.currentScript as HTMLScriptElement | null)?.src ?? null)
    : null;

setWebMcpPolyfillLoader(() => {
  const chunkUrl = widgetScriptSrc?.replace(
    /index\.global\.js($|\?)/,
    "webmcp-polyfill.js$1",
  );
  if (!chunkUrl || chunkUrl === widgetScriptSrc) {
    return Promise.reject(
      new Error(
        "Could not derive the webmcp-polyfill.js URL from the widget script URL " +
          `(${widgetScriptSrc ?? "unavailable"}). Self-hosted deployments that ` +
          "rename index.global.js should install @mcp-b/webmcp-polyfill on the " +
          "page themselves before enabling config.webmcp.",
      ),
    );
  }
  // Runtime-only dynamic import; the specifier is a computed URL, so esbuild
  // leaves it untouched (and must not try to bundle it).
  return import(/* @vite-ignore */ chunkUrl);
});
