import { defineConfig } from "tsup";

/**
 * Dedicated config for the standalone visitor-history REST chunk
 * (`dist/client-history.js`). `tsup.global.config.ts` marks the subpath
 * external and `index-global.ts` registers a sibling-URL loader for this file.
 * The ESM/CJS main entry loads the same chunk through
 * the `@runtypelabs/persona/client-history` subpath.
 */
export default defineConfig({
  entry: { "client-history": "src/client-history.ts" },
  // ESM for the IIFE sibling-URL loader and bundler consumers; CJS because
  // esbuild lowers the npm loader's self-referencing `import()` to `require()`
  // inside `dist/index.cjs`, which resolves this chunk via the `require` condition.
  format: ["esm", "cjs"],
  dts: true,
  minify: true,
  splitting: false,
  outDir: "dist",
  // Other lazy chunks stay external: any loader copy in here only holds a dead
  // dynamic import (core injects its own loaders), so inlining them would just
  // bloat this chunk with code it never runs.
  noExternal: [/^(?!\.\/markdown-parsers-entry$)(?!@runtypelabs\/persona\/).*/],
  external: ["./markdown-parsers-entry", /^@runtypelabs\/persona\//],
});
