import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Bundle guard for the lazy session-reconnect chunk.
 *
 * Under `--splitting false`, the old relative `import("./session-reconnect")`
 * was INLINED into the core bundles as an esbuild `__esm` wrapper — deferred
 * evaluation, zero byte savings. The loop now ships as the sibling chunk
 * `dist/session-reconnect.{js,cjs}`, loaded on demand: the IIFE via a sibling
 * URL, ESM/CJS via the external `@runtypelabs/persona/session-reconnect`
 * subpath. A stray static or relative dynamic import would inline it again;
 * this fails then.
 *
 * Skips when `dist/` hasn't been built (e.g. a test-only CI step).
 */
const dist = (f: string) => resolve(__dirname, "..", "dist", f);

// Chunk-only literals: user-facing reconnect failure copy emitted nowhere else.
const RUNTIME_MARKERS = [
  "Connection lost and the response could not be resumed.",
  "Durable session reconnect failed.",
];

const SUBPATH = "@runtypelabs/persona/session-reconnect";

describe("session-reconnect bundle split", () => {
  const iifeBuilt =
    existsSync(dist("index.global.js")) && existsSync(dist("session-reconnect.js"));
  const esmBuilt = existsSync(dist("index.js")) && existsSync(dist("index.cjs"));

  it.runIf(iifeBuilt)("keeps the reconnect loop OUT of the core IIFE bundle", () => {
    const core = readFileSync(dist("index.global.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(core.includes(marker), `IIFE bundle unexpectedly contains "${marker}"`).toBe(
        false
      );
    }
    // The loader stub (sibling-URL reference) must remain so the chunk can load.
    expect(core).toContain("session-reconnect.js");
  });

  it.runIf(esmBuilt)("keeps the reconnect loop OUT of the ESM/CJS bundles", () => {
    for (const file of ["index.js", "index.cjs"]) {
      const core = readFileSync(dist(file), "utf8");
      for (const marker of RUNTIME_MARKERS) {
        expect(core.includes(marker), `${file} unexpectedly contains "${marker}"`).toBe(
          false
        );
      }
      if (core.includes("session-reconnect")) {
        expect(
          core.includes(SUBPATH),
          `${file} must reach the reconnect loop via the external subpath`
        ).toBe(true);
      }
    }
  });

  it.runIf(iifeBuilt)("ships the reconnect loop in the sibling chunk", () => {
    const chunk = readFileSync(dist("session-reconnect.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(chunk.includes(marker), `chunk is missing "${marker}"`).toBe(true);
    }
    expect(existsSync(dist("session-reconnect.cjs"))).toBe(true);
    expect(existsSync(dist("session-reconnect.d.ts"))).toBe(true);
  });
});
