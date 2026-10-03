import { defineConfig } from "tsup";

/**
 * Dedicated config for the standalone `ui-extras` chunk (`dist/ui-extras.js`):
 * UI glue for opt-in / interaction-only features. `tsup.global.config.ts`
 * marks `./ui-extras-entry` external and `index-global.ts` registers a
 * sibling-URL loader for this file. ESM/CJS builds inline the entry instead,
 * so only CDN consumers load it.
 */
export default defineConfig({
  entry: { "ui-extras": "src/ui-extras-entry.ts" },
  format: ["esm"],
  minify: true,
  splitting: false,
  outDir: "dist",
  noExternal: [/.*/],
});
