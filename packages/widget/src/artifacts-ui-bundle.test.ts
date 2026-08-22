import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Bundle guard for the lazy artifacts-ui chunk.
 *
 * The artifact pane, inline/card components, and preview renderer must NOT
 * land in ANY core bundle shipped to consumers — the IIFE nor the ESM/CJS
 * bundles. They ship as the sibling chunk `dist/artifacts-ui.{js,cjs}`,
 * loaded on demand: the IIFE via a sibling URL, ESM/CJS via the external
 * `@runtypelabs/persona/artifacts-ui` subpath.
 *
 * Also guards the chunk itself against two regressions its tsup config
 * carves out of `noExternal` (which OVERRIDES `external` in tsup): inlining
 * marked + DOMPurify via its dead `./markdown-parsers-entry` fallback, and
 * inlining the extra icon data via its icons-extra loader copy.
 *
 * Skips when `dist/` hasn't been built (e.g. a test-only CI step).
 */
const dist = (f: string) => resolve(__dirname, "..", "dist", f);

// Chunk-only literals: the preview's view-transition name prefix and the
// pane's Rendered/Source toggle copy. (Class names like
// `persona-artifact-pane` stay in core as delegation SELECTORS, so they
// cannot be markers.)
const RUNTIME_MARKERS = ["artifact-vt-", "Rendered"];

const SUBPATH = "@runtypelabs/persona/artifacts-ui";

describe("artifacts-ui bundle split", () => {
  const iifeBuilt =
    existsSync(dist("index.global.js")) && existsSync(dist("artifacts-ui.js"));
  const esmBuilt = existsSync(dist("index.js")) && existsSync(dist("index.cjs"));

  it.runIf(iifeBuilt)("keeps the artifacts UI OUT of the core IIFE bundle", () => {
    const core = readFileSync(dist("index.global.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(core.includes(marker), `IIFE bundle unexpectedly contains "${marker}"`).toBe(
        false
      );
    }
    // The loader stub (sibling-URL reference) must remain so the chunk can load.
    expect(core).toContain("artifacts-ui.js");
  });

  it.runIf(esmBuilt)("keeps the artifacts UI OUT of the ESM/CJS bundles", () => {
    for (const file of ["index.js", "index.cjs"]) {
      const core = readFileSync(dist(file), "utf8");
      for (const marker of RUNTIME_MARKERS) {
        expect(core.includes(marker), `${file} unexpectedly contains "${marker}"`).toBe(
          false
        );
      }
      if (core.includes("artifacts-ui")) {
        expect(
          core.includes(SUBPATH),
          `${file} must reach the artifacts UI via the external subpath`
        ).toBe(true);
      }
    }
  });

  it.runIf(iifeBuilt)("ships the artifacts UI in the sibling chunk, externals intact", () => {
    const chunk = readFileSync(dist("artifacts-ui.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(chunk.includes(marker), `chunk is missing "${marker}"`).toBe(true);
    }
    // The dead markdown fallback stayed external (inlining = +21 kB gzip):
    // marked's unmistakable lexer table would appear if bundled.
    expect(chunk.includes("markdown-parsers-entry")).toBe(true);
    expect(chunk.includes("inlineTokens")).toBe(false);
    // The extra icon data stayed external (shopping-cart path fragment).
    expect(chunk.includes("M2.05 2.05h2l2.66 12.42")).toBe(false);
    expect(existsSync(dist("artifacts-ui.cjs"))).toBe(true);
    expect(existsSync(dist("artifacts-ui.d.ts"))).toBe(true);
  });
});
