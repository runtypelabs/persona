import { defineConfig } from "tsup";

/**
 * Dedicated config for the standalone forms-ui chunk (`dist/forms-ui.js`),
 * loaded on demand by the core bundles when a rendered bubble first contains
 * a `[data-tv-form]` placeholder. Lives in its own file (loaded via
 * `--config`) because:
 *   - the chunk must bundle its dependencies (`noExternal`) so it works
 *     standalone from a CDN with no module resolution;
 *   - a file named `tsup.config.ts` would be auto-loaded by every other
 *     CLI-driven build script in package.json.
 *
 * See `src/forms-ui-loader.ts` and the loader registration in
 * `src/index-global.ts` for how this chunk is wired in.
 */
export default defineConfig({
  entry: { "forms-ui": "src/forms-ui.ts" },
  // ESM for the IIFE sibling-URL loader and bundler consumers; CJS because
  // esbuild lowers the loader's `import()` to `require()` inside `dist/index.cjs`,
  // which then resolves this chunk via the package's `require` export condition.
  format: ["esm", "cjs"],
  dts: true,
  minify: true,
  splitting: false,
  outDir: "dist",
  noExternal: [/.*/],
});
