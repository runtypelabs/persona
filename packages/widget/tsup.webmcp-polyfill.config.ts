import { defineConfig } from "tsup";

/**
 * Dedicated config for the standalone WebMCP polyfill chunk
 * (`dist/webmcp-polyfill.js`). Lives in its own file (loaded via
 * `--config`) because:
 *   - the chunk must bundle its dependencies (`noExternal`), and tsup's CLI
 *     has no `--no-external` flag;
 *   - a file named `tsup.config.ts` would be auto-loaded by every other
 *     CLI-driven build script in package.json.
 *
 * See `src/webmcp-polyfill.ts` for why this chunk exists.
 */
export default defineConfig({
  entry: ["src/webmcp-polyfill.ts"],
  format: ["esm"],
  minify: true,
  splitting: false,
  outDir: "dist",
  // Self-contained: inline @mcp-b/webmcp-polyfill and its transitive deps so
  // the file works standalone from a CDN with no module resolution.
  noExternal: [/.*/],
});
