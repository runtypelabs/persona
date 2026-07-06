import { defineConfig } from "tsup";

/**
 * Dedicated config for the standalone inline-mention chunk
 * (`dist/context-mentions-inline.js`), loaded on composer mount by the IIFE/CDN
 * build when `contextMentions.display === "inline"`. Sibling of
 * `tsup.context-mentions.config.ts`; carries the contenteditable engine
 * (`composer-document`, `composer-contenteditable`, the inline composer entry)
 * so chip-only sites never download it.
 *
 * Same rationale as the chip chunk: `noExternal` bundles the deps so it works
 * standalone from a CDN, and the config lives in its own file (loaded via
 * `--config`) so a `tsup.config.ts` isn't auto-loaded by other build scripts.
 *
 * See `src/context-mentions-inline-loader.ts` and the loader registration in
 * `src/index-global.ts` for how this chunk is wired in.
 */
export default defineConfig({
  entry: { "context-mentions-inline": "src/context-mentions-inline.ts" },
  format: ["esm", "cjs"],
  dts: true,
  minify: true,
  splitting: false,
  outDir: "dist",
  noExternal: [/.*/],
});
