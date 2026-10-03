import { defineConfig } from "tsup";

/**
 * Dedicated config for the standalone visitor-history REST chunk
 * (`dist/client-history.js`). `tsup.global.config.ts` marks `./client-history`
 * external and `index-global.ts` registers a sibling-URL loader for this file.
 * ESM/CJS builds inline the module instead, so only CDN consumers load it.
 */
export default defineConfig({
  entry: { "client-history": "src/client-history.ts" },
  format: ["esm"],
  minify: true,
  splitting: false,
  outDir: "dist",
  // Other lazy chunks stay external: any loader copy in here only holds a dead
  // dynamic import (core injects its own loaders), so inlining them would just
  // bloat this chunk with code it never runs.
  noExternal: [/^(?!\.\/markdown-parsers-entry$)(?!@runtypelabs\/persona\/).*/],
  external: ["./markdown-parsers-entry", /^@runtypelabs\/persona\//],
});
