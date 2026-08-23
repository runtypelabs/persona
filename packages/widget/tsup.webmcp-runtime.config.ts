import { defineConfig } from "tsup";

/**
 * Dedicated config for the standalone webmcp-runtime chunk
 * (`dist/webmcp-runtime.js`): the WebMcpBridge class, loaded on demand by
 * `client.ts` when `config.webmcp.enabled === true`. Lives in its own file
 * (loaded via `--config`) because:
 *   - the chunk must bundle its dependencies (`noExternal`) so it works
 *     standalone from a CDN with no module resolution (the title map and the
 *     polyfill loader are injected instead — see WebMcpBridgeDeps);
 *   - a file named `tsup.config.ts` would be auto-loaded by every other
 *     CLI-driven build script in package.json.
 *
 * See `src/webmcp-runtime-loader.ts` and the loader registration in
 * `src/index-global.ts` for how this chunk is wired in.
 */
export default defineConfig({
  entry: { "webmcp-runtime": "src/webmcp-runtime.ts" },
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
