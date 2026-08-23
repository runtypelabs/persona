import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Bundle guard for the lazy animations-extra chunk (wipe + glyph-cycle).
 *
 * The subpath animation plugins must NOT land in ANY core bundle shipped to
 * consumers — neither the CDN IIFE (`dist/index.global.js`) nor the ESM/CJS
 * bundles (`dist/index.js` / `dist/index.cjs`). They ship as the sibling
 * chunk `dist/animations-extra.{js,cjs}` (and, for npm consumers, the
 * long-standing `dist/animations/*` subpaths), loaded on demand: the IIFE via
 * a sibling URL, ESM/CJS via the external `@runtypelabs/persona/animations-extra`
 * subpath. A stray static import would pull the plugins back in; this fails then.
 *
 * Rejected-load retry (the other half of the transport contract) is covered by
 * `animations-extra-loader.test.ts`.
 *
 * Skips when `dist/` hasn't been built (e.g. a test-only CI step).
 */
const dist = (f: string) => resolve(__dirname, "..", "dist", f);

// Chunk-only literals: the plugins' containerClass values. Core code (widget.css,
// wrapStreamAnimation) only emits the shared `persona-stream-word` /
// `persona-stream-char` classes, never these.
const RUNTIME_MARKERS = ["persona-stream-wipe", "persona-stream-glyph-cycle"];

const SUBPATH = "@runtypelabs/persona/animations-extra";

describe("animations-extra bundle split", () => {
  const iifeBuilt =
    existsSync(dist("index.global.js")) && existsSync(dist("animations-extra.js"));
  const esmBuilt = existsSync(dist("index.js")) && existsSync(dist("index.cjs"));

  it.runIf(iifeBuilt)("keeps wipe + glyph-cycle OUT of the core IIFE bundle", () => {
    const core = readFileSync(dist("index.global.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(core.includes(marker), `IIFE bundle unexpectedly contains "${marker}"`).toBe(
        false
      );
    }
    // The loader stub (sibling-URL reference) must remain so the chunk can load.
    expect(core).toContain("animations-extra.js");
  });

  it.runIf(esmBuilt)("keeps wipe + glyph-cycle OUT of the ESM/CJS bundles", () => {
    for (const file of ["index.js", "index.cjs"]) {
      const core = readFileSync(dist(file), "utf8");
      for (const marker of RUNTIME_MARKERS) {
        expect(core.includes(marker), `${file} unexpectedly contains "${marker}"`).toBe(
          false
        );
      }
      // Any reference must go through the external subpath rather than an
      // inlined relative import.
      if (core.includes("animations-extra")) {
        expect(
          core.includes(SUBPATH),
          `${file} must reach the plugins via the external subpath`
        ).toBe(true);
      }
    }
  });

  it.runIf(iifeBuilt)("ships wipe + glyph-cycle in the sibling chunk", () => {
    const chunk = readFileSync(dist("animations-extra.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(chunk.includes(marker), `chunk is missing "${marker}"`).toBe(true);
    }
    // A CJS twin exists for require()-based consumers.
    expect(existsSync(dist("animations-extra.cjs"))).toBe(true);
    // Declarations ship with the chunk so the subpath is typed.
    expect(existsSync(dist("animations-extra.d.ts"))).toBe(true);
  });
});
