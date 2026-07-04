import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Bundle guard for the lazy context-mentions chunk (see
 * `docs/context-mentions-plan.md`, Bundle strategy).
 *
 * The mention runtime (controller/manager/menu) must NOT land in ANY core bundle
 * shipped to consumers — neither the CDN IIFE (`dist/index.global.js`) nor the
 * ESM/CJS bundles (`dist/index.js` / `dist/index.cjs`). It ships as the sibling
 * chunk `dist/context-mentions.{js,cjs}`, loaded on demand: the IIFE via a
 * sibling URL, ESM/CJS via the external `@runtypelabs/persona/context-mentions`
 * subpath. A stray static import would pull the runtime back in; this fails then.
 *
 * Skips when `dist/` hasn't been built (e.g. a test-only CI step).
 */
const dist = (f: string) => resolve(__dirname, "..", "dist", f);

const RUNTIME_MARKERS = [
  "persona-mention-menu", // menu component class — chunk-only
  "persona-mention-group-header", // menu component class — chunk-only
  // Slash-command dispatch lives in the controller (chunk-only); this literal
  // is unique to the command path and must not leak into a core bundle.
  "context-mention prompt resolve failed",
];

const SUBPATH = "@runtypelabs/persona/context-mentions";

describe("context-mentions bundle split", () => {
  const iifeBuilt =
    existsSync(dist("index.global.js")) && existsSync(dist("context-mentions.js"));
  const esmBuilt = existsSync(dist("index.js")) && existsSync(dist("index.cjs"));

  it.runIf(iifeBuilt)("keeps the mention runtime OUT of the core IIFE bundle", () => {
    const core = readFileSync(dist("index.global.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(core.includes(marker), `IIFE bundle unexpectedly contains "${marker}"`).toBe(
        false
      );
    }
    // The loader stub (sibling-URL reference) must remain so the chunk can load.
    expect(core).toContain("context-mentions.js");
  });

  it.runIf(esmBuilt)("keeps the mention runtime OUT of the ESM/CJS bundles", () => {
    for (const file of ["index.js", "index.cjs"]) {
      const core = readFileSync(dist(file), "utf8");
      for (const marker of RUNTIME_MARKERS) {
        expect(core.includes(marker), `${file} unexpectedly contains "${marker}"`).toBe(
          false
        );
      }
      // The runtime is reached via the external subpath, not inlined.
      expect(core.includes(SUBPATH), `${file} must import the external subpath`).toBe(
        true
      );
    }
  });

  it.runIf(iifeBuilt)("ships the mention + slash-command runtime in the sibling chunk", () => {
    const chunk = readFileSync(dist("context-mentions.js"), "utf8");
    expect(chunk).toContain("persona-mention-menu");
    // Slash-command dispatch ships in the chunk, not the core.
    expect(chunk).toContain("context-mention prompt resolve failed");
    // The menu CSS rides with the chunk (injected on open), not eager widget.css.
    expect(chunk).toContain(".persona-mention-option[data-active");
    // A CJS twin exists for require()-based consumers.
    expect(existsSync(dist("context-mentions.cjs"))).toBe(true);
  });

  it.runIf(existsSync(dist("widget.css")))(
    "keeps menu CSS out of the eager stylesheet but keeps chip CSS",
    () => {
      const css = readFileSync(dist("widget.css"), "utf8");
      expect(css).toContain(".persona-mention-chip"); // eager chip pieces stay
      expect(css.includes(".persona-mention-menu")).toBe(false); // menu moved to chunk
      expect(css.includes(".persona-mention-option")).toBe(false);
    }
  );

  it.runIf(esmBuilt)("ships no lookbehind regex (Safari < 16.4 parse guard)", () => {
    // A lookbehind literal anywhere in a core bundle is a parse-time SyntaxError
    // on older Safari, breaking the whole widget even with mentions disabled.
    for (const file of ["index.js", "index.cjs", "index.global.js"]) {
      if (!existsSync(dist(file))) continue;
      expect(readFileSync(dist(file), "utf8").includes("(?<="), `${file} has a lookbehind`).toBe(
        false
      );
    }
  });
});
