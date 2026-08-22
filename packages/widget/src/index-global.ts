/**
 * IIFE entry point: bundled for `<script>` tag consumers.
 *
 * Script-tag users who include the global build don't need extra script tags
 * or registration calls: setting `features.streamAnimation.type` to any
 * built-in name just works. `letter-rise` and `word-fade` are core built-ins;
 * `wipe` and `glyph-cycle` live in the lazy `animations-extra.js` sibling
 * chunk, fetched by the UI the first time config selects one.
 *
 * npm consumers continue to import from the main entry (`import ... from
 * "@runtypelabs/persona"`): those animations stay in their subpath
 * modules so bundlers can tree-shake them.
 */

// Re-export the full public API: from `index-core` (NOT `index`) so the
// dev-only helpers (`generateCodeSnippet`, `createDemoCarousel`) stay out of the
// CDN/IIFE bundle. npm consumers still get them via the `index.ts` barrel.
export * from "./index-core";

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
// loader that imports the self-contained `markdown-parsers.js` chunk from a
// sibling URL. The UI warms it on first panel visibility (see
// `warmMarkdownParsers` in ui.ts), so closed-launcher visitors never fetch it.
// ---------------------------------------------------------------------------

import { setMarkdownParsersLoader } from "./markdown-parsers-loader";

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

// ---------------------------------------------------------------------------
// Deferred Context Mentions loading.
//
// This bundle is built with `./context-mentions-entry` external (see
// `tsup.global.config.ts`): the mention controller/manager/menu runtime is kept
// out of the CDN payload. Register a loader that imports the self-contained
// `context-mentions.js` chunk from a sibling URL; the orchestrator calls it on
// the first `@`/affordance-button interaction (and can prefetch on composer
// focus) only when `contextMentions.enabled`. Same pattern as the chunks above.
// ---------------------------------------------------------------------------

import { setContextMentionsLoader } from "./context-mentions-loader";
import { setContextMentionsInlineLoader } from "./context-mentions-inline-loader";

setContextMentionsLoader(() => {
  const chunkUrl = widgetScriptSrc?.replace(
    /index\.global\.js($|\?)/,
    "context-mentions.js$1",
  );
  if (!chunkUrl || chunkUrl === widgetScriptSrc) {
    return Promise.reject(
      new Error(
        "Could not derive the context-mentions.js URL from the widget script URL " +
          `(${widgetScriptSrc ?? "unavailable"}). Self-hosted deployments that ` +
          "rename index.global.js should host context-mentions.js alongside it.",
      ),
    );
  }
  return import(/* @vite-ignore */ chunkUrl);
});

// Sibling loader for the inline-mention contenteditable chunk, loaded on composer
// mount when `contextMentions.display === "inline"`. Same sibling-URL scheme.
setContextMentionsInlineLoader(() => {
  const chunkUrl = widgetScriptSrc?.replace(
    /index\.global\.js($|\?)/,
    "context-mentions-inline.js$1",
  );
  if (!chunkUrl || chunkUrl === widgetScriptSrc) {
    return Promise.reject(
      new Error(
        "Could not derive the context-mentions-inline.js URL from the widget " +
          `script URL (${widgetScriptSrc ?? "unavailable"}). Self-hosted ` +
          "deployments that rename index.global.js should host " +
          "context-mentions-inline.js alongside it.",
      ),
    );
  }
  return import(/* @vite-ignore */ chunkUrl);
});

// ---------------------------------------------------------------------------
// Deferred history-view loading.
//
// This bundle is built with `@runtypelabs/persona/history-view` external (see
// `tsup.global.config.ts`): the Messages navigation surface is kept out of the
// CDN payload and fetched only when the visitor first opens history. Same
// sibling-URL scheme as the chunks above.
// ---------------------------------------------------------------------------

import { setHistoryViewLoader } from "./history-view-loader";

setHistoryViewLoader(() => {
  const chunkUrl = widgetScriptSrc?.replace(
    /index\.global\.js($|\?)/,
    "history-view.js$1",
  );
  if (!chunkUrl || chunkUrl === widgetScriptSrc) {
    return Promise.reject(
      new Error(
        "Could not derive the history-view.js URL from the widget script URL " +
          `(${widgetScriptSrc ?? "unavailable"}). Self-hosted deployments that ` +
          "rename index.global.js should host history-view.js alongside it.",
      ),
    );
  }
  return import(/* @vite-ignore */ chunkUrl);
});

// ---------------------------------------------------------------------------
// Deferred stream-animations loading (wipe + glyph-cycle).
//
// This bundle is built with `@runtypelabs/persona/animations-extra` external
// (see `tsup.global.config.ts`): the subpath animation plugins are kept out of
// the CDN payload and fetched only when `features.streamAnimation.type`
// selects one (see the lazy resolver in ui.ts). Same sibling-URL scheme as the
// chunks above.
// ---------------------------------------------------------------------------

import { setAnimationsExtraLoader } from "./animations-extra-loader";

setAnimationsExtraLoader(() => {
  const chunkUrl = widgetScriptSrc?.replace(
    /index\.global\.js($|\?)/,
    "animations-extra.js$1",
  );
  if (!chunkUrl || chunkUrl === widgetScriptSrc) {
    return Promise.reject(
      new Error(
        "Could not derive the animations-extra.js URL from the widget script URL " +
          `(${widgetScriptSrc ?? "unavailable"}). Self-hosted deployments that ` +
          "rename index.global.js should host animations-extra.js alongside it, " +
          "or register the animation plugins themselves via " +
          "registerStreamAnimationPlugin.",
      ),
    );
  }
  return import(/* @vite-ignore */ chunkUrl);
});

// ---------------------------------------------------------------------------
// Deferred approval-ui loading.
//
// This bundle is built with `@runtypelabs/persona/approval-ui` external (see
// `tsup.global.config.ts`): the approval bubble, built-in approval plugin, and
// plugin-kit are kept out of the CDN payload and fetched only when the first
// approval message arrives. Same sibling-URL scheme as the chunks above.
// ---------------------------------------------------------------------------

import { setApprovalUiLoader } from "./approval-ui-loader";

setApprovalUiLoader(() => {
  const chunkUrl = widgetScriptSrc?.replace(
    /index\.global\.js($|\?)/,
    "approval-ui.js$1",
  );
  if (!chunkUrl || chunkUrl === widgetScriptSrc) {
    return Promise.reject(
      new Error(
        "Could not derive the approval-ui.js URL from the widget script URL " +
          `(${widgetScriptSrc ?? "unavailable"}). Self-hosted deployments that ` +
          "rename index.global.js should host approval-ui.js alongside it.",
      ),
    );
  }
  return import(/* @vite-ignore */ chunkUrl);
});

// ---------------------------------------------------------------------------
// Deferred artifacts-ui loading.
//
// This bundle is built with `@runtypelabs/persona/artifacts-ui` external (see
// `tsup.global.config.ts`): the artifact pane, inline/card components, and
// preview renderer are kept out of the CDN payload and fetched when the
// artifacts sidebar is enabled or the first artifact directive arrives. Same
// sibling-URL scheme as the chunks above.
// ---------------------------------------------------------------------------

import { setArtifactsUiLoader } from "./artifacts-ui-loader";

setArtifactsUiLoader(() => {
  const chunkUrl = widgetScriptSrc?.replace(
    /index\.global\.js($|\?)/,
    "artifacts-ui.js$1",
  );
  if (!chunkUrl || chunkUrl === widgetScriptSrc) {
    return Promise.reject(
      new Error(
        "Could not derive the artifacts-ui.js URL from the widget script URL " +
          `(${widgetScriptSrc ?? "unavailable"}). Self-hosted deployments that ` +
          "rename index.global.js should host artifacts-ui.js alongside it.",
      ),
    );
  }
  return import(/* @vite-ignore */ chunkUrl);
});

// ---------------------------------------------------------------------------
// Deferred extra-icons loading.
//
// This bundle is built with `@runtypelabs/persona/icons-extra` external (see
// `tsup.global.config.ts`): the config-only tail of the icon registry is kept
// out of the CDN payload and fetched the first time `renderLucideIcon` is
// asked for one of its names. Same sibling-URL scheme as the chunks above.
// ---------------------------------------------------------------------------

import { setIconsExtraLoader } from "./icons-extra-loader";

setIconsExtraLoader(() => {
  const chunkUrl = widgetScriptSrc?.replace(
    /index\.global\.js($|\?)/,
    "icons-extra.js$1",
  );
  if (!chunkUrl || chunkUrl === widgetScriptSrc) {
    return Promise.reject(
      new Error(
        "Could not derive the icons-extra.js URL from the widget script URL " +
          `(${widgetScriptSrc ?? "unavailable"}). Self-hosted deployments that ` +
          "rename index.global.js should host icons-extra.js alongside it, or " +
          "register the icons they use via registerIcons().",
      ),
    );
  }
  return import(/* @vite-ignore */ chunkUrl);
});

// ---------------------------------------------------------------------------
// Deferred WebMCP bridge runtime loading.
//
// This bundle is built with `@runtypelabs/persona/webmcp-runtime` external
// (see `tsup.global.config.ts`): the WebMcpBridge class is kept out of the
// CDN payload and fetched by client.ts only when `config.webmcp.enabled` is
// true. Same sibling-URL scheme as the chunks above. (The polyfill itself is
// a separate, older chunk: `webmcp-polyfill.js`, registered further up.)
// ---------------------------------------------------------------------------

import { setWebMcpRuntimeLoader } from "./webmcp-runtime-loader";

setWebMcpRuntimeLoader(() => {
  const chunkUrl = widgetScriptSrc?.replace(
    /index\.global\.js($|\?)/,
    "webmcp-runtime.js$1",
  );
  if (!chunkUrl || chunkUrl === widgetScriptSrc) {
    return Promise.reject(
      new Error(
        "Could not derive the webmcp-runtime.js URL from the widget script URL " +
          `(${widgetScriptSrc ?? "unavailable"}). Self-hosted deployments that ` +
          "rename index.global.js should host webmcp-runtime.js alongside it.",
      ),
    );
  }
  return import(/* @vite-ignore */ chunkUrl);
});

// ---------------------------------------------------------------------------
// Deferred session-reconnect loading.
//
// This bundle is built with `@runtypelabs/persona/session-reconnect` external
// (see `tsup.global.config.ts`): the durable-session reconnect loop is kept
// out of the CDN payload and fetched only when a session with a
// `reconnectStream` transport first needs to resume. Same sibling-URL scheme
// as the chunks above.
// ---------------------------------------------------------------------------

import { setSessionReconnectLoader } from "./session-reconnect-loader";

setSessionReconnectLoader(() => {
  const chunkUrl = widgetScriptSrc?.replace(
    /index\.global\.js($|\?)/,
    "session-reconnect.js$1",
  );
  if (!chunkUrl || chunkUrl === widgetScriptSrc) {
    return Promise.reject(
      new Error(
        "Could not derive the session-reconnect.js URL from the widget script URL " +
          `(${widgetScriptSrc ?? "unavailable"}). Self-hosted deployments that ` +
          "rename index.global.js should host session-reconnect.js alongside it.",
      ),
    );
  }
  return import(/* @vite-ignore */ chunkUrl);
});

// ---------------------------------------------------------------------------
// Deferred event-stream-view loading.
//
// Same scheme as history-view: `@runtypelabs/persona/event-stream-view` is
// external here (see `tsup.global.config.ts`), and the observability panel is
// fetched from a sibling URL only when the visitor first opens it.
// ---------------------------------------------------------------------------

import { setEventStreamViewLoader } from "./event-stream-view-loader";

setEventStreamViewLoader(() => {
  const chunkUrl = widgetScriptSrc?.replace(
    /index\.global\.js($|\?)/,
    "event-stream-view.js$1",
  );
  if (!chunkUrl || chunkUrl === widgetScriptSrc) {
    return Promise.reject(
      new Error(
        "Could not derive the event-stream-view.js URL from the widget script URL " +
          `(${widgetScriptSrc ?? "unavailable"}). Self-hosted deployments that ` +
          "rename index.global.js should host event-stream-view.js alongside it.",
      ),
    );
  }
  return import(/* @vite-ignore */ chunkUrl);
});
