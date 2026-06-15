import { defineConfig } from "tsup";

/**
 * Dedicated config for the standalone Runtype TTS engine chunk
 * (`dist/runtype-tts.js`), loaded on demand by the IIFE/CDN build for
 * `textToSpeech.provider: 'runtype'`. Lives in its own file (loaded via
 * `--config`) because:
 *   - the chunk must bundle its dependencies (`noExternal`) — chiefly
 *     `AudioPlaybackManager` — so it works standalone from a CDN with no module
 *     resolution (a duplicate of AudioPlaybackManager, which also lives in the
 *     main bundle for the realtime path, is the accepted cost of an on-demand
 *     chunk);
 *   - a file named `tsup.config.ts` would be auto-loaded by every other
 *     CLI-driven build script in package.json.
 *
 * See `src/voice/runtype-tts-loader.ts` for how this chunk is wired in.
 */
export default defineConfig({
  entry: { "runtype-tts": "src/voice/runtype-tts-entry.ts" },
  format: ["esm"],
  minify: true,
  splitting: false,
  outDir: "dist",
  noExternal: [/.*/],
});
