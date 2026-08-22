import { defineConfig } from "tsup";

/**
 * Dedicated config for the standalone session-reconnect chunk
 * (`dist/session-reconnect.js`): the durable-session bounded-backoff loop,
 * loaded on demand when a session with a `reconnectStream` transport first
 * needs to resume. Lives in its own file (loaded via `--config`) because:
 *   - the chunk must bundle its dependencies (`noExternal`) so it works
 *     standalone from a CDN with no module resolution;
 *   - a file named `tsup.config.ts` would be auto-loaded by every other
 *     CLI-driven build script in package.json.
 *
 * See `src/session-reconnect-loader.ts` and the loader registration in
 * `src/index-global.ts` for how this chunk is wired in.
 */
export default defineConfig({
  entry: { "session-reconnect": "src/session-reconnect.ts" },
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
