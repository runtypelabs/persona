import { defineConfig } from "tsup";

/**
 * Dedicated config for the standalone activity-ui chunk
 * (`dist/activity-ui.js`): tool and reasoning bubbles, activity rows, and
 * collapsible tool groups, loaded on demand by the core bundles when the first
 * tool or reasoning message renders. Lives in its own file (loaded via
 * `--config`) because:
 *   - the chunk must bundle its dependencies (`noExternal`) so it works
 *     standalone from a CDN with no module resolution (string-name icons are
 *     injected instead — see components/activity-icon.ts);
 *   - a file named `tsup.config.ts` would be auto-loaded by every other
 *     CLI-driven build script in package.json.
 *
 * See `src/activity-ui-loader.ts` and the loader registration in
 * `src/index-global.ts` for how this chunk is wired in.
 */
export default defineConfig({
  entry: { "activity-ui": "src/activity-ui.ts" },
  // ESM for the IIFE sibling-URL loader and bundler consumers; CJS for
  // consumers that resolve the subpath through the `require` export condition.
  format: ["esm", "cjs"],
  dts: true,
  minify: true,
  splitting: false,
  outDir: "dist",
  noExternal: [/.*/],
});
