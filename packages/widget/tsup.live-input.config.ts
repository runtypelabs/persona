import { defineConfig } from "tsup";
export default defineConfig({
  entry: { "live-input": "src/live-input.ts" },
  format: ["esm", "cjs"], dts: true, minify: true,
  splitting: false, outDir: "dist", noExternal: [/.*/],
});
