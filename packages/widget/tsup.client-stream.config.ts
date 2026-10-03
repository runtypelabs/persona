import { defineConfig } from "tsup";

/**
 * Dedicated config for the standalone SSE stream-processor chunk
 * (`dist/client-stream.js`), the lazy half of `AgentWidgetClient` in the
 * IIFE/CDN bundle. `tsup.global.config.ts` marks `./client-stream` external and
 * `index-global.ts` registers a sibling-URL loader for this file; the client
 * starts fetching it when a dispatch begins. ESM/CJS builds inline
 * `./client-stream` instead, so only CDN consumers load this file.
 */
export default defineConfig({
  entry: { "client-stream": "src/client-stream.ts" },
  format: ["esm"],
  minify: true,
  splitting: false,
  outDir: "dist",
  noExternal: [/.*/],
});
