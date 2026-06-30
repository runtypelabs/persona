import { defineConfig } from "tsup";

/**
 * Dedicated config for the standalone context-mentions chunk
 * (`dist/context-mentions.js`), loaded on demand by the IIFE/CDN build when
 * `contextMentions.enabled` and the user first interacts. Lives in its own file
 * (loaded via `--config`) because:
 *   - the chunk must bundle its dependencies (`noExternal`) — the mention
 *     controller/manager/menu plus the shared DOM/icon/popover helpers they use
 *     — so it works standalone from a CDN with no module resolution (a duplicate
 *     of those shared helpers, which also live in the main bundle, is the
 *     accepted cost of an on-demand chunk, mirroring `runtype-tts`);
 *   - a file named `tsup.config.ts` would be auto-loaded by every other
 *     CLI-driven build script in package.json.
 *
 * See `src/context-mentions-loader.ts` and the loader registration in
 * `src/index-global.ts` for how this chunk is wired in.
 */
export default defineConfig({
  entry: { "context-mentions": "src/context-mentions.ts" },
  format: ["esm"],
  minify: true,
  splitting: false,
  outDir: "dist",
  noExternal: [/.*/],
});
