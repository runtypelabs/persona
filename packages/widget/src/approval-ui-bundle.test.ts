import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Bundle guard for the lazy approval-ui chunk.
 *
 * The approval bubble + built-in approval plugin (and the plugin-kit they pull
 * in) must NOT land in ANY core bundle shipped to consumers — neither the CDN
 * IIFE (`dist/index.global.js`) nor the ESM/CJS bundles (`dist/index.js` /
 * `dist/index.cjs`). They ship as the sibling chunk `dist/approval-ui.{js,cjs}`,
 * loaded on demand: the IIFE via a sibling URL, ESM/CJS via the external
 * `@runtypelabs/persona/approval-ui` subpath. A stray static import would pull
 * the UI back in; this fails then.
 *
 * Rejected-load retry (the other half of the transport contract) is covered by
 * `approval-ui-loader.test.ts`; the async render-and-heal path by
 * `ui.approval-chunk.test.ts`.
 *
 * Skips when `dist/` hasn't been built (e.g. a test-only CI step).
 */
const dist = (f: string) => resolve(__dirname, "..", "dist", f);

// Chunk-only literals. Core keeps `.persona-approval-bubble` in its delegated
// click selectors, so use class names only the chunk emits: the split-button
// card (approval-actions) and the details-toggle label (approval-bubble).
const RUNTIME_MARKERS = ["persona-approval-card", "data-approval-details-label"];

const SUBPATH = "@runtypelabs/persona/approval-ui";

describe("approval-ui bundle split", () => {
  const iifeBuilt =
    existsSync(dist("index.global.js")) && existsSync(dist("approval-ui.js"));
  const esmBuilt = existsSync(dist("index.js")) && existsSync(dist("index.cjs"));

  it.runIf(iifeBuilt)("keeps the approval UI OUT of the core IIFE bundle", () => {
    const core = readFileSync(dist("index.global.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(core.includes(marker), `IIFE bundle unexpectedly contains "${marker}"`).toBe(
        false
      );
    }
    // The loader stub (sibling-URL reference) must remain so the chunk can load.
    expect(core).toContain("approval-ui.js");
  });

  it.runIf(esmBuilt)("keeps the approval UI OUT of the ESM/CJS bundles", () => {
    for (const file of ["index.js", "index.cjs"]) {
      const core = readFileSync(dist(file), "utf8");
      for (const marker of RUNTIME_MARKERS) {
        expect(core.includes(marker), `${file} unexpectedly contains "${marker}"`).toBe(
          false
        );
      }
      // Any reference must go through the external subpath rather than an
      // inlined relative import.
      if (core.includes("approval-ui")) {
        expect(
          core.includes(SUBPATH),
          `${file} must reach the approval UI via the external subpath`
        ).toBe(true);
      }
    }
  });

  it.runIf(iifeBuilt)("ships the approval UI in the sibling chunk", () => {
    const chunk = readFileSync(dist("approval-ui.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(chunk.includes(marker), `chunk is missing "${marker}"`).toBe(true);
    }
    // The chunk must NOT carry its own copy of the icon registry (injected
    // instead — see approval-deps.ts). `LUCIDE_ICONS` keys like
    // "shopping-cart" only exist where the registry was bundled.
    expect(chunk.includes("shopping-cart")).toBe(false);
    // A CJS twin exists for require()-based consumers.
    expect(existsSync(dist("approval-ui.cjs"))).toBe(true);
    // Declarations ship with the chunk so the subpath is typed.
    expect(existsSync(dist("approval-ui.d.ts"))).toBe(true);
  });
});
