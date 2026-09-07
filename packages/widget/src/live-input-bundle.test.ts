import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const dist = (file: string) => resolve(__dirname, "..", "dist", file);
const markers = [
  "Resolve unacknowledged deliveries before sending more messages",
  "Invalid live input receipt",
  "Live input joining is unavailable for this session",
];
describe("live-input bundle split", () => {
  it.runIf(existsSync(dist("live-input.js")))("ships receipt handling only in the optional chunk", () => {
    const chunk = readFileSync(dist("live-input.js"), "utf8");
    for (const marker of markers) expect(chunk).toContain(marker);
    for (const file of ["index.js", "index.cjs", "index.global.js", "theme-editor-preview.js"]) {
      const core = readFileSync(dist(file), "utf8");
      for (const marker of markers) expect(core).not.toContain(marker);
    }
    expect(readFileSync(dist("index.global.js"), "utf8")).toContain("live-input.js");
    expect(existsSync(dist("live-input.cjs"))).toBe(true);
    expect(existsSync(dist("live-input.d.ts"))).toBe(true);
  });
});
