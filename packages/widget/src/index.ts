/**
 * npm package entry (`@runtypelabs/persona`).
 *
 * This is a thin barrel over `index-core.ts` (the shared public API) that adds
 * back the **dev/config-tool-only** helpers: the theme-plugin factories,
 * `generateCodeSnippet`, and `createDemoCarousel`. Those are kept out of
 * `index-core.ts` so the IIFE/CDN build (`index-global.ts`, which re-exports
 * from `index-core.ts`) doesn't ship them: a running widget never needs them,
 * only build-time/demo tooling does.
 *
 * Net effect: npm consumers get the full API (unchanged), while the script-tag
 * `window.AgentWidget` global no longer exposes the theme-plugin factories,
 * `generateCodeSnippet`, or `createDemoCarousel`.
 */

// Register `marked` + `dompurify` synchronously for the bundled npm build so
// the synchronous markdown/sanitize API renders on first paint. The IIFE/CDN
// entry (`index-global.ts`) does NOT import this; it lazy-loads the parsers
// from the `markdown-parsers.js` chunk instead. Must run before any render.
import "./markdown-parsers-eager";

// Same for the extra-tier icon data: bundled npm consumers keep the all-sync
// `renderLucideIcon` contract; the IIFE/CDN build lazy-loads `icons-extra.js`.
import "./icons-extra-eager";

// Full public API (everything except the two dev-only helpers below).
export * from "./index-core";
export { default } from "./index-core";

// Theme-plugin factories: config-time helpers with no runtime caller in the
// widget, so they stay off the CDN global (same rule as the two helpers below).
export {
  accessibilityPlugin,
  animationsPlugin,
  brandPlugin,
  reducedMotionPlugin,
  highContrastPlugin,
  createPlugin
} from "./utils/plugins";

// Dev / config-tool helper: generate install snippets from a widget config.
export { generateCodeSnippet } from "./utils/code-generators";
export type {
  CodeFormat,
  CodeGeneratorHooks,
  CodeGeneratorOptions
} from "./utils/code-generators";

// Demo-only component: the examples' showcase carousel.
export { createDemoCarousel } from "./components/demo-carousel";
export type {
  DemoCarouselItem,
  DemoCarouselOptions,
  DemoCarouselHandle
} from "./components/demo-carousel";

// Voice provider factory (npm-only values). The CDN path reaches the provider
// runtime lazily via the voice-runtime chunk inside session.setupVoice.
export {
  createVoiceProvider,
  createBestAvailableVoiceProvider,
  isVoiceSupported,
} from "./voice";

// WebMCP bridge class (npm-only value; historical one-argument constructor).
// The CDN path reaches the runtime lazily via the webmcp-runtime chunk.
export { WebMcpBridge } from "./webmcp-bridge-public";

// Context mention helpers (for building config.contextMentions.sources).
// npm-only values: kept off `index-core.ts` so the CDN global doesn't carry
// mention-matcher (script-tag hosts pass plain source objects in config).
export {
  defaultMentionFilter,
  createStaticMentionSource,
  createSlashCommandsSource,
} from "./utils/mention-matcher";

// Accessible roving-tabindex tablist helper for custom artifact tab bars
// (features.artifacts.renderTabBar).
export { createRovingTablist } from "./utils/roving-tablist";
export type {
  RovingTablistController,
  RovingTablistOptions
} from "./utils/roving-tablist";
