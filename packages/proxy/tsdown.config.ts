import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  // tsup took the target from tsconfig.json.
  target: "es2019",
  platform: "node",
  sourcemap: true,
  clean: true,
  report: false,
  dts: { generator: "tsgo", tsgo: { moduleUrl: import.meta.resolve("typescript-next") } },
  // Keep tsup's published names: `.js` / `.cjs` with `.d.ts` / `.d.cts`.
  outExtensions: ({ format }) => ({
    js: format === "cjs" ? ".cjs" : ".js",
    dts: format === "cjs" ? ".d.cts" : ".d.ts",
  }),
  // INVARIANT: a module .d.ts without an export list implicitly exports every
  // hoisted internal declaration.
  footer: { dts: "export {}" },
  outputOptions: {
    exports: "named",
    // Unminified output: drop JSDoc as esbuild did (Rolldown keeps it by
    // default), keeping legal and `/* @__PURE__ */` annotation comments.
    comments: { legal: true, annotation: true, jsdoc: false },
  },
});
