import { defineConfig } from "tsup";

/**
 * Dedicated config for the standalone artifacts-ui chunk
 * (`dist/artifacts-ui.js`): the artifact pane + inline/card components + the
 * shared preview renderer, loaded on demand when the artifacts sidebar is
 * enabled or the first artifact component directive arrives. Lives in its own
 * file (loaded via `--config`) because:
 *   - the chunk must bundle its dependencies (`noExternal`) so it works
 *     standalone from a CDN with no module resolution. Accepted duplication:
 *     the CORE icon registry rides in via `utils/buttons` (~2 kB gzip);
 *     stateful copies (markdown loader, icons-extra loader slot, component
 *     registry) are synchronized/injected at adoption — see
 *     `artifacts-ui-loader.ts`;
 *   - a file named `tsup.config.ts` would be auto-loaded by every other
 *     CLI-driven build script in package.json.
 *
 * Two specifiers must stay EXTERNAL (dead dynamic imports, never invoked at
 * runtime because adoption wires the chunk's loader copies to core's):
 *  - `./markdown-parsers-entry` — inlining it would bundle marked + DOMPurify
 *    (~21 kB gzip) into this chunk;
 *  - `@runtypelabs/persona/icons-extra` — inlining it would bundle the extra
 *    icon data (~4 kB gzip).
 * tsup's `noExternal` OVERRIDES its `external` option, so the exclusions are
 * carved out of the noExternal pattern itself (negative lookahead) AND listed
 * in `external`. Verified by `artifacts-ui-bundle.test.ts`.
 */
export default defineConfig({
  entry: { "artifacts-ui": "src/artifacts-ui.ts" },
  format: ["esm", "cjs"],
  dts: true,
  minify: true,
  splitting: false,
  outDir: "dist",
  noExternal: [
    /^(?!\.\/markdown-parsers-entry$)(?!@runtypelabs\/persona\/icons-extra$).*/,
  ],
  external: ["./markdown-parsers-entry", "@runtypelabs/persona/icons-extra"],
});
