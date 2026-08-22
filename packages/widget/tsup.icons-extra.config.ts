import { defineConfig } from "tsup";

/**
 * Dedicated config for the standalone icons-extra chunk
 * (`dist/icons-extra.js`): the config-only tail of the icon registry, fetched
 * the first time `renderLucideIcon` is asked for one of its names. Lives in
 * its own file (loaded via `--config`) because:
 *   - the chunk must bundle its dependencies (`noExternal`) so it works
 *     standalone from a CDN with no module resolution;
 *   - a file named `tsup.config.ts` would be auto-loaded by every other
 *     CLI-driven build script in package.json.
 *
 * See `src/icons-extra-loader.ts` and the loader registrations in
 * `src/index-global.ts` + `src/launcher-global.ts` for how this is wired in.
 */
export default defineConfig({
  entry: { "icons-extra": "src/icons-extra.ts" },
  // ESM for the IIFE sibling-URL loaders and bundler consumers; CJS because
  // esbuild lowers the loader's `import()` to `require()` inside `dist/index.cjs`,
  // which then resolves this chunk via the package's `require` export condition.
  format: ["esm", "cjs"],
  dts: true,
  minify: true,
  splitting: false,
  outDir: "dist",
  noExternal: [/.*/],
});
