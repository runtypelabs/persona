import { defineConfig } from "tsup";

/**
 * Dedicated config for the standalone voice-runtime chunk
 * (`dist/voice-runtime.js`): the voice provider factory + Runtype/browser
 * providers + audio playback manager, loaded on demand when a session with a
 * configured voice provider first sets up voice. Lives in its own file
 * (loaded via `--config`) because:
 *   - the chunk must bundle its dependencies (`noExternal`) so it works
 *     standalone from a CDN with no module resolution;
 *   - a file named `tsup.config.ts` would be auto-loaded by every other
 *     CLI-driven build script in package.json.
 *
 * See `src/voice-runtime-loader.ts` and the loader registration in
 * `src/index-global.ts` for how this chunk is wired in.
 */
export default defineConfig({
  entry: { "voice-runtime": "src/voice-runtime.ts" },
  format: ["esm", "cjs"],
  dts: true,
  minify: true,
  splitting: false,
  outDir: "dist",
  noExternal: [/.*/],
});
