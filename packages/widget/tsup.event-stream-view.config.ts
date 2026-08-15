import { defineConfig } from "tsup";

/**
 * Dedicated config for the standalone event-stream-view chunk
 * (`dist/event-stream-view.js`), loaded on demand by the IIFE/CDN build when
 * the visitor first opens the event-stream observability panel. Lives in its
 * own file (loaded via `--config`) because:
 *   - the chunk must bundle its dependencies (`noExternal`) — the view plus the
 *     shared DOM helpers it uses — so it works standalone from a CDN with no
 *     module resolution (a duplicate of those shared helpers is the accepted
 *     cost of an on-demand chunk, mirroring `history-view`);
 *   - a file named `tsup.config.ts` would be auto-loaded by every other
 *     CLI-driven build script in package.json.
 *
 * See `src/event-stream-view-loader.ts` and the loader registration in
 * `src/index-global.ts` for how this chunk is wired in.
 */
export default defineConfig({
  entry: { "event-stream-view": "src/event-stream-view.ts" },
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
