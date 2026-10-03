import { defineConfig } from "tsup";

/**
 * Dedicated config for the standalone visitor-history shell chunk
 * (`dist/history-shell.js`), the lazy half of `ui.ts`'s history support in the
 * IIFE/CDN bundle. `tsup.global.config.ts` marks `./history-shell` external and
 * `index-global.ts` registers a sibling-URL loader for this file. ESM/CJS
 * builds inline `./history-shell` instead, so only CDN consumers load it.
 *
 * Everything stateful the shell touches (icon registry, tooltips, chunk
 * loaders, provider registry) arrives through its `ctx`, so the copies of
 * pure helpers bundled here never shadow core state.
 */
export default defineConfig({
  entry: { "history-shell": "src/history-shell.ts" },
  format: ["esm"],
  minify: true,
  splitting: false,
  outDir: "dist",
  noExternal: [/.*/],
});
