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
});
