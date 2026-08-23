import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Bundle guard for the lazy forms-ui chunk.
 *
 * The `[data-tv-form]` demo-forms enhancement (form definitions + builder +
 * submit handler) must NOT land in ANY core bundle shipped to consumers —
 * neither the CDN IIFE (`dist/index.global.js`) nor the ESM/CJS bundles
 * (`dist/index.js` / `dist/index.cjs`). It ships as the sibling chunk
 * `dist/forms-ui.{js,cjs}`, loaded on demand: the IIFE via a sibling URL,
 * ESM/CJS via the external `@runtypelabs/persona/forms-ui` subpath. A stray
 * static import would pull it back in; this fails then.
 *
 * Rejected-load retry is covered by the shared `chunk-loader.test.ts`
 * semantics; the async render-and-heal path by `ui.forms-chunk.test.ts`.
 *
 * Skips when `dist/` hasn't been built (e.g. a test-only CI step).
 */
const dist = (f: string) => resolve(__dirname, "..", "dist", f);

// Chunk-only literals. Core keeps the `[data-tv-form]` selector (shim +
// postprocessor + sanitize allowlist) and the CSS class names ride the inlined
// stylesheet, so use the hardcoded form copy only the chunk carries.
const RUNTIME_MARKERS = ["Schedule a Demo", "Share the basics and we'll follow up"];

const SUBPATH = "@runtypelabs/persona/forms-ui";

describe("forms-ui bundle split", () => {
  const iifeBuilt =
    existsSync(dist("index.global.js")) && existsSync(dist("forms-ui.js"));
  const esmBuilt = existsSync(dist("index.js")) && existsSync(dist("index.cjs"));

  it.runIf(iifeBuilt)("keeps the forms UI OUT of the core IIFE bundle", () => {
    const core = readFileSync(dist("index.global.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(core.includes(marker), `IIFE bundle unexpectedly contains "${marker}"`).toBe(
        false
      );
    }
    // The loader stub (sibling-URL reference) must remain so the chunk can load.
    expect(core).toContain("forms-ui.js");
  });

  it.runIf(esmBuilt)("keeps the forms UI OUT of the ESM/CJS bundles", () => {
    for (const file of ["index.js", "index.cjs"]) {
      const core = readFileSync(dist(file), "utf8");
      for (const marker of RUNTIME_MARKERS) {
        expect(core.includes(marker), `${file} unexpectedly contains "${marker}"`).toBe(
          false
        );
      }
      // Any reference must go through the external subpath rather than an
      // inlined relative import.
      if (core.includes("forms-ui")) {
        expect(
          core.includes(SUBPATH),
          `${file} must reach the forms UI via the external subpath`
        ).toBe(true);
      }
    }
  });

  it.runIf(iifeBuilt)("ships the forms UI in the sibling chunk", () => {
    const chunk = readFileSync(dist("forms-ui.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(chunk.includes(marker), `chunk is missing "${marker}"`).toBe(true);
    }
    // A CJS twin exists for require()-based consumers.
    expect(existsSync(dist("forms-ui.cjs"))).toBe(true);
    // Declarations ship with the chunk so the subpath is typed.
    expect(existsSync(dist("forms-ui.d.ts"))).toBe(true);
  });
});
