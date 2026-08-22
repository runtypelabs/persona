import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Bundle guard for the lazy event-stream-view chunk.
 *
 * The observability panel must NOT land in ANY core bundle shipped to
 * consumers — neither the CDN IIFE (`dist/index.global.js`) nor the ESM/CJS
 * bundles (`dist/index.js` / `dist/index.cjs`). It ships as the sibling chunk
 * `dist/event-stream-view.{js,cjs}`, loaded on demand: the IIFE via a sibling
 * URL, ESM/CJS via the external `@runtypelabs/persona/event-stream-view`
 * subpath. A stray static import would pull the view back in; this fails then.
 *
 * Skips when `dist/` hasn't been built (e.g. a test-only CI step).
 */
const dist = (f: string) => resolve(__dirname, "..", "dist", f);

// Chunk-only literals: the view's root and list class names are never emitted
// by core code; the sibling-URL stub in the core bundles is the bare filename
// `event-stream-view.js`, which does not contain these.
const RUNTIME_MARKERS = [
  "persona-event-stream-view",
  "persona-event-stream-list",
  // Capture/persistence runtime, moved into this chunk alongside the view:
  // IndexedDB store (createObjectStore) and throughput tracker (flow_run_start).
  "createObjectStore",
  "flow_run_start",
];

const SUBPATH = "@runtypelabs/persona/event-stream-view";

describe("event-stream-view bundle split", () => {
  const iifeBuilt =
    existsSync(dist("index.global.js")) && existsSync(dist("event-stream-view.js"));
  const esmBuilt = existsSync(dist("index.js")) && existsSync(dist("index.cjs"));

  it.runIf(iifeBuilt)("keeps the event-stream view OUT of the core IIFE bundle", () => {
    const core = readFileSync(dist("index.global.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(core.includes(marker), `IIFE bundle unexpectedly contains "${marker}"`).toBe(
        false
      );
    }
    // The loader stub (sibling-URL reference) must remain so the chunk can load.
    expect(core).toContain("event-stream-view.js");
  });

  it.runIf(esmBuilt)("keeps the event-stream view OUT of the ESM/CJS bundles", () => {
    for (const file of ["index.js", "index.cjs"]) {
      const core = readFileSync(dist(file), "utf8");
      for (const marker of RUNTIME_MARKERS) {
        expect(core.includes(marker), `${file} unexpectedly contains "${marker}"`).toBe(
          false
        );
      }
      // Any reference must go through the external subpath, not an inlined
      // relative import.
      expect(
        core.includes(SUBPATH),
        `${file} must reach the view via the external subpath`
      ).toBe(true);
    }
  });

  it.runIf(iifeBuilt)("ships the event-stream view in the sibling chunk", () => {
    const chunk = readFileSync(dist("event-stream-view.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(chunk.includes(marker), `chunk is missing "${marker}"`).toBe(true);
    }
    // A CJS twin exists for require()-based consumers.
    expect(existsSync(dist("event-stream-view.cjs"))).toBe(true);
    // Declarations ship with the chunk so the subpath is typed.
    expect(existsSync(dist("event-stream-view.d.ts"))).toBe(true);
  });
});
