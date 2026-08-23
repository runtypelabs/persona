import { defineConfig } from "tsup";

/**
 * Dedicated config for the standalone markdown parsers chunk
 * (`dist/markdown-parsers.js`). Lives in its own file (loaded via
 * `--config`) so it bundles marked and dompurify natively without externalizing.
 */
export default defineConfig({
  entry: { "markdown-parsers": "src/markdown-parsers-entry.ts" },
  format: ["esm"],
  minify: true,
  splitting: false,
  outDir: "dist",
  noExternal: [/.*/],
  // `dist/artifacts-ui.{js,cjs}` carries `./markdown-parsers-entry` as a DEAD
  // external import (never invoked at runtime — adoption wires the chunk's
  // loader copy to core's). Bundlers that statically follow the artifacts-ui
  // subpath (e.g. webpack in a Next.js consumer) must still RESOLVE it, so
  // ship a shim re-exporting this chunk, which is built from that same source
  // module. ESM-only like the chunk itself: CJS bundlers resolve the .js file
  // fine, and no runtime ever requires it.
  onSuccess: async () => {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      "dist/markdown-parsers-entry.js",
      'export * from "./markdown-parsers.js";\n'
    );
  },
});
