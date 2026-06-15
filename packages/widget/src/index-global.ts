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

// ---------------------------------------------------------------------------
// Deferred Markdown Parsers (marked + dompurify) loading.
//
// This bundle is built with `./markdown-parsers-entry` external: the Markdown
// and HTML sanitization libraries are kept out of the CDN payload. Register a
// loader that imports the self-contained `markdown-parsers.js` chunk from a sibling
// URL. The session prefetches it at init so it's warm before the first message.
// ---------------------------------------------------------------------------

import { setMarkdownParsersLoader, loadMarkdownParsers } from "./markdown-parsers-loader";

setMarkdownParsersLoader(() => {
  const chunkUrl = widgetScriptSrc?.replace(
    /index\.global\.js($|\?)/,
    "markdown-parsers.js$1",
  );
  if (!chunkUrl || chunkUrl === widgetScriptSrc) {
    return Promise.reject(
      new Error(
        "Could not derive the markdown-parsers.js URL from the widget script URL " +
          `(${widgetScriptSrc ?? "unavailable"}). Self-hosted deployments that ` +
          "rename index.global.js should host markdown-parsers.js alongside it.",
      ),
    );
  }
  return import(/* @vite-ignore */ chunkUrl);
});

// Kick off the load immediately since it will likely be needed.
loadMarkdownParsers().catch(err => {
  // It's okay if this fails (e.g. ad blocker), it'll just fall back to plain text.
  if (typeof console !== "undefined") {
    console.warn("[Persona] Failed to pre-load markdown parsers", err);
  }
});
// ---------------------------------------------------------------------------
// Deferred Runtype TTS engine loading.
//
// This bundle is built with `./runtype-speech-engine` external (see
// `tsup.global.config.ts`): the hosted read-aloud engine + the
// AudioPlaybackManager it bundles are kept out of the CDN payload. Register a
// loader that imports the self-contained `runtype-tts.js` chunk from a sibling
// URL; the session prefetches it at init when `textToSpeech.provider:'runtype'`
// is set, so it's warm before the first click. Same pattern as the WebMCP
// polyfill above.
// ---------------------------------------------------------------------------

import { setRuntypeTtsLoader } from "./voice/runtype-tts-loader";

setRuntypeTtsLoader(() => {
  const chunkUrl = widgetScriptSrc?.replace(
    /index\.global\.js($|\?)/,
    "runtype-tts.js$1",
  );
  if (!chunkUrl || chunkUrl === widgetScriptSrc) {
    return Promise.reject(
      new Error(
        "Could not derive the runtype-tts.js URL from the widget script URL " +
          `(${widgetScriptSrc ?? "unavailable"}). Self-hosted deployments that ` +
          "rename index.global.js should host runtype-tts.js alongside it, or set " +
          "textToSpeech.createEngine to supply a speech engine directly.",
      ),
    );
  }
  return import(/* @vite-ignore */ chunkUrl);
});
