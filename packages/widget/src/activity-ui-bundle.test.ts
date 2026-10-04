import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Bundle guard for the lazy activity-ui chunk (tool / reasoning bubbles,
 * activity rows, collapsible tool groups).
 *
 * None of it may land in a core bundle: neither the CDN IIFE
 * (`dist/index.global.js`) nor the ESM/CJS bundles. It ships as
 * `dist/activity-ui.{js,cjs}`, loaded via a sibling URL (IIFE) or the external
 * `@runtypelabs/persona/activity-ui` subpath (ESM/CJS). The async
 * render-and-heal path is covered by `ui.activity-chunk.test.ts`.
 *
 * Skips when `dist/` hasn't been built (e.g. a test-only CI step).
 */
const dist = (f: string) => resolve(__dirname, "..", "dist", f);

// Chunk-only literals. Core keeps `.persona-activity-row` / `.persona-tool-bubble`
// in its delegated click selectors, so use names only the builders emit.
const RUNTIME_MARKERS = ["persona-tool-detail-copy", "persona-activity-header", "data-persona-tool-error"];

describe("activity-ui bundle split", () => {
  const iifeBuilt = existsSync(dist("index.global.js")) && existsSync(dist("activity-ui.js"));
  const esmBuilt = existsSync(dist("index.js")) && existsSync(dist("index.cjs"));

  it.runIf(iifeBuilt)("keeps the activity UI OUT of the core IIFE bundle", () => {
    const core = readFileSync(dist("index.global.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(core.includes(marker), `IIFE bundle unexpectedly contains "${marker}"`).toBe(false);
    }
    expect(core).toContain("activity-ui.js");
  });

  it.runIf(esmBuilt)("keeps the activity UI OUT of the ESM/CJS bundles", () => {
    for (const file of ["index.js", "index.cjs"]) {
      const core = readFileSync(dist(file), "utf8");
      for (const marker of RUNTIME_MARKERS) {
        expect(core.includes(marker), `${file} unexpectedly contains "${marker}"`).toBe(false);
      }
      expect(core).toContain("@runtypelabs/persona/activity-ui");
    }
  });

  it.runIf(iifeBuilt)("ships the activity UI in the sibling chunk", () => {
    const chunk = readFileSync(dist("activity-ui.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(chunk.includes(marker), `chunk is missing "${marker}"`).toBe(true);
    }
    // String-name icons are injected (components/activity-icon.ts), so the
    // chunk must not carry its own copy of the icon registry.
    expect(chunk.includes("shopping-cart")).toBe(false);
    expect(existsSync(dist("activity-ui.cjs"))).toBe(true);
    expect(existsSync(dist("activity-ui.d.ts"))).toBe(true);
  });
});
