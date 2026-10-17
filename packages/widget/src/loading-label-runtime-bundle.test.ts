import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const dist = (name: string) => resolve(__dirname, "../dist", name);
const built = existsSync(dist("loading-label-runtime.js"));
const markers = ["persona-tool-char", "Loading label animation failed"];

it.runIf(built)("ships one animation implementation outside core and renderer chunks in every format", () => {
  for (const suffix of ["js", "cjs"]) {
    const runtime = readFileSync(dist(`loading-label-runtime.${suffix}`), "utf8");
    for (const marker of markers) expect(runtime).toContain(marker);
    for (const name of ["index", "activity-ui", "artifacts-ui"]) {
      const code = readFileSync(dist(`${name}.${suffix}`), "utf8");
      for (const marker of markers) expect(code).not.toContain(marker);
    }
    // Renderer adapters are injected, so a failed static dependency cannot
    // poison an activity/artifact module's retry or create a second URL identity.
    for (const name of ["activity-ui", "artifacts-ui"]) {
      expect(readFileSync(dist(`${name}.${suffix}`), "utf8")).not.toMatch(/(?:from|import\(|require\()[^;]*loading-label-runtime/);
    }
  }
  const core = readFileSync(dist("index.global.js"), "utf8");
  expect(core).toContain("loading-label-runtime.js");
  for (const marker of markers) expect(core).not.toContain(marker);
  const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf8"));
  expect(pkg.exports["./loading-label-runtime"]).toEqual({ types: "./dist/loading-label-runtime.d.ts", import: "./dist/loading-label-runtime.js", require: "./dist/loading-label-runtime.cjs" });
  expect(existsSync(dist("loading-label-runtime.d.ts"))).toBe(true);
  expect(existsSync(dist("loading-label-runtime.d.cts"))).toBe(true);
});
