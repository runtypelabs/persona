import { defineConfig } from "tsup";

/**
 * Config for the IIFE/CDN widget bundle (`dist/index.global.js`, built from
 * `src/index-global.ts` then renamed by the `build:client` script).
 *
 * Lives in a config file rather than CLI flags because of the external
 * `@mcp-b/webmcp-polyfill`: tsup never applies its `external` option to IIFE
 * builds (its external plugin is gated on `format !== "iife"`), so the
 * exclusion must go through esbuild's native `external` list via
 * `esbuildOptions`. Named distinctly so the other CLI-driven build scripts
 * don't auto-load it the way they would a `tsup.config.ts`.
 */
export default defineConfig({
  entry: ["src/index-global.ts"],
  format: ["iife"],
  globalName: "AgentWidget",
  minify: true,
  sourcemap: true,
  splitting: false,
  outDir: "dist",
  loader: { ".css": "text" },
  esbuildOptions(options) {
    // Keep the WebMCP polyfill (and its ~22 kB transitive
    // @cfworker/json-schema) out of the CDN bundle. esbuild leaves the
    // bridge's bare `import("@mcp-b/webmcp-polyfill")` in place as a runtime
    // dynamic import; it is never invoked in this bundle because
    // `index-global.ts` registers a loader that imports the standalone
    // `webmcp-polyfill.js` chunk instead.
    options.external = [...(options.external ?? []), "@mcp-b/webmcp-polyfill"];
  },
});
