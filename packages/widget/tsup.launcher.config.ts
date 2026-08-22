import { defineConfig } from "tsup";

/**
 * Config for the critical-path launcher bundle (`dist/launcher.global.js`,
 * built from `src/launcher-global.ts` then renamed by the `build:launcher`
 * script). Previously a plain CLI invocation; lives in a config file because
 * the icons-extra subpath must be marked external and tsup never applies its
 * `external` option to IIFE builds — the exclusion must go through esbuild's
 * native list via `esbuildOptions` (same story as `tsup.global.config.ts`).
 */
export default defineConfig({
  entry: ["src/launcher-global.ts"],
  format: ["iife"],
  globalName: "AgentWidgetLauncher",
  minify: true,
  sourcemap: true,
  splitting: false,
  outDir: "dist",
  esbuildOptions(options) {
    // Keep the extra icon data out of the critical launcher. The loader's
    // fallback `import("@runtypelabs/persona/icons-extra")` is a dead external
    // import here; `launcher-global.ts` registers a sibling-URL loader that
    // derives `icons-extra.js` from the launcher script's own src, so a
    // launcher configured with a non-core icon paints a sized placeholder and
    // fills within one round-trip.
    options.external = [
      ...(options.external ?? []),
      "@runtypelabs/persona/icons-extra",
    ];
  },
});
