import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Bundle guard for the lazy voice-client-tools chunk (the voice fast tier).
 * Its session code must stay out of both the core IIFE and the voice-runtime
 * chunk: only calls that negotiate `client_tools` download it.
 * Skips when `dist/` hasn't been built.
 */
const dist = (f: string) => resolve(__dirname, "..", "dist", f);

// Session-only literals, emitted nowhere else.
const MARKERS = ["Page tool exceeded", "Unknown tool: "];

describe("voice-client-tools bundle split", () => {
  // Skip only when nothing was built; a build missing the chunk must fail.
  const built = existsSync(dist("index.global.js"));

  it.runIf(built)("keeps the fast-tier session out of the core IIFE and the voice-runtime chunk", () => {
    for (const file of ["index.global.js", "voice-runtime.js"]) {
      const source = readFileSync(dist(file), "utf8");
      for (const marker of MARKERS) {
        expect(source.includes(marker), `${file} unexpectedly contains "${marker}"`).toBe(false);
      }
    }
    expect(readFileSync(dist("index.global.js"), "utf8")).toContain("voice-client-tools.js");
  });

  it.runIf(built)("ships the session in its own chunk, with CJS and declarations", () => {
    expect(existsSync(dist("voice-client-tools.js")), "dist/voice-client-tools.js is missing").toBe(true);
    const chunk = readFileSync(dist("voice-client-tools.js"), "utf8");
    for (const marker of MARKERS) expect(chunk.includes(marker), `chunk is missing "${marker}"`).toBe(true);
    expect(existsSync(dist("voice-client-tools.cjs"))).toBe(true);
    expect(existsSync(dist("voice-client-tools.d.ts"))).toBe(true);
  });
});
