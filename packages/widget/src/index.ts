/**
 * npm package entry (`@runtypelabs/persona`).
 *
 * This is a thin barrel over `index-core.ts` (the shared public API) that adds
 * back the **dev/config-tool-only** helpers: `generateCodeSnippet` and
 * `createDemoCarousel`. Those are kept out of `index-core.ts` so the IIFE/CDN
 * build (`index-global.ts`, which re-exports from `index-core.ts`) doesn't ship
 * them: a running widget never needs them, only build-time/demo tooling does.
 *
 * Net effect: npm consumers get the full API (unchanged), while the script-tag
 * `window.AgentWidget` global no longer exposes `generateCodeSnippet` /
 * `createDemoCarousel`.
 */

// Full public API (everything except the two dev-only helpers below).
export * from "./index-core";
export { default } from "./index-core";

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
