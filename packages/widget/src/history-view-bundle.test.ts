import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Bundle guard for the lazy history-view chunk (see
 * `docs/visitor-history-implementation-plan.md` D7, Bundle size).
 *
 * The Messages view must NOT land in ANY core bundle shipped to consumers —
 * neither the CDN IIFE (`dist/index.global.js`) nor the ESM/CJS bundles
 * (`dist/index.js` / `dist/index.cjs`). It ships as the sibling chunk
 * `dist/history-view.{js,cjs}`, loaded on demand: the IIFE via a sibling URL,
 * ESM/CJS via the external `@runtypelabs/persona/history-view` subpath. A stray
 * static import would pull the view back in; this fails then.
 *
 * Rejected-load retry (the other half of the transport contract) is covered by
 * `history-view-loader.test.ts`.
 *
 * Skips when `dist/` hasn't been built (e.g. a test-only CI step).
 */
const dist = (f: string) => resolve(__dirname, "..", "dist", f);

// Chunk-only literals. `persona-history-view` is the view's root class and is
// never emitted by core code; the sibling-URL stub in the core bundles is the
// bare filename `history-view.js`, which does not contain these.
const RUNTIME_MARKERS = ["persona-history-view", "persona-history-view-loading"];

const SUBPATH = "@runtypelabs/persona/history-view";

describe("history-view bundle split", () => {
  const iifeBuilt =
    existsSync(dist("index.global.js")) && existsSync(dist("history-view.js"));
  const esmBuilt = existsSync(dist("index.js")) && existsSync(dist("index.cjs"));

  it.runIf(iifeBuilt)("keeps the history view OUT of the core IIFE bundle", () => {
    const core = readFileSync(dist("index.global.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(core.includes(marker), `IIFE bundle unexpectedly contains "${marker}"`).toBe(
        false
      );
    }
    // The loader stub (sibling-URL reference) must remain so the chunk can load.
    expect(core).toContain("history-view.js");
  });

  it.runIf(esmBuilt)("keeps the history view OUT of the ESM/CJS bundles", () => {
    for (const file of ["index.js", "index.cjs"]) {
      const core = readFileSync(dist(file), "utf8");
      for (const marker of RUNTIME_MARKERS) {
        expect(core.includes(marker), `${file} unexpectedly contains "${marker}"`).toBe(
          false
        );
      }
      // TODO(history-ui): the ESM/CJS core only reaches the loader once `ui.ts`
      // mounts the view, so today these bundles carry no history reference at
      // all. The invariant asserted meanwhile — and automatically once the UI
      // lands — is that any reference goes through the external subpath rather
      // than an inlined relative import.
      if (core.includes("history-view")) {
        expect(
          core.includes(SUBPATH),
          `${file} must reach the view via the external subpath`
        ).toBe(true);
      }
    }
  });

  it.runIf(iifeBuilt)("ships the history view in the sibling chunk", () => {
    const chunk = readFileSync(dist("history-view.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(chunk.includes(marker), `chunk is missing "${marker}"`).toBe(true);
    }
    // A CJS twin exists for require()-based consumers.
    expect(existsSync(dist("history-view.cjs"))).toBe(true);
    // Declarations ship with the chunk so the subpath is typed.
    expect(existsSync(dist("history-view.d.ts"))).toBe(true);
  });
});
