import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Bundle guard for the lazy icons-extra chunk (config-only icon data).
 *
 * Core bundles (CDN IIFE and the critical launcher) intentionally carry the
 * extra-tier NAMES (a ~0.8 kB string list, so typos warn without a fetch) but
 * must NOT carry the extra-tier path DATA — that ships only in
 * `dist/icons-extra.js`. The markers below are path-data fragments, which only
 * exist where an icon's data was bundled ("shopping-cart" the STRING is
 * legitimately present in core as a list entry).
 *
 * Skips when `dist/` hasn't been built (e.g. a test-only CI step).
 */
const dist = (f: string) => resolve(__dirname, "..", "dist", f);

// Path-data fragments of extra-tier icons: shopping-cart and bell.
const DATA_MARKERS = [
  "M2.05 2.05h2l2.66 12.42",
  "M10.268 21a2 2 0 0 0 3.464 0",
];

describe("icons-extra bundle split", () => {
  const built =
    existsSync(dist("index.global.js")) &&
    existsSync(dist("launcher.global.js")) &&
    existsSync(dist("icons-extra.js"));

  it.runIf(built)("keeps extra icon DATA out of the core and launcher bundles", () => {
    for (const file of ["index.global.js", "launcher.global.js"]) {
      const bundle = readFileSync(dist(file), "utf8");
      for (const marker of DATA_MARKERS) {
        expect(
          bundle.includes(marker),
          `${file} unexpectedly contains extra icon data "${marker}"`
        ).toBe(false);
      }
      // The sibling-URL loader stub must remain so the chunk can load.
      expect(bundle).toContain("icons-extra.js");
    }
  });

  it.runIf(built)("ships the extra icon data in the sibling chunk", () => {
    const chunk = readFileSync(dist("icons-extra.js"), "utf8");
    for (const marker of DATA_MARKERS) {
      expect(chunk.includes(marker), `chunk is missing "${marker}"`).toBe(true);
    }
    expect(existsSync(dist("icons-extra.cjs"))).toBe(true);
    expect(existsSync(dist("icons-extra.d.ts"))).toBe(true);
  });
});
