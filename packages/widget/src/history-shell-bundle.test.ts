import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Bundle guard for the lazy visitor-history shell.
 *
 * The CDN IIFE (`dist/index.global.js`) must not carry the shell: it ships as
 * the sibling chunk `dist/history-shell.js`, fetched only when
 * `features.history` is enabled or a history API is called. npm builds inline
 * it (`history-shell-eager.ts`). A stray static import from core would pull
 * it back into the IIFE; this fails then.
 *
 * Skips when `dist/` hasn't been built (e.g. a test-only CI step).
 */
const dist = (f: string) => resolve(__dirname, "..", "dist", f);

// Shell-only literals: rail/overlay chrome and conversation-open classes.
const RUNTIME_MARKERS = [
  "persona-history-rail-shell",
  "persona-history-rail-overlay",
  "persona-conversation-loading-error",
  "data-persona-history-toggle",
];

// Stateful core modules arrive through the shell's ctx, never bundled copies:
// the icon registry's map keys and the tooltip module only exist where bundled.
const NOT_IN_CHUNK = ["shopping-cart", "persona-tooltip"];

describe("history-shell bundle split", () => {
  const iifeBuilt =
    existsSync(dist("index.global.js")) && existsSync(dist("history-shell.js"));

  it.runIf(iifeBuilt)("keeps the history shell OUT of the core IIFE bundle", () => {
    const core = readFileSync(dist("index.global.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(core.includes(marker), `IIFE bundle unexpectedly contains "${marker}"`).toBe(
        false
      );
    }
    // The loader stub (sibling-URL reference) must remain so the chunk can load.
    expect(core).toContain("history-shell.js");
  });

  it.runIf(iifeBuilt)("ships the history shell in the sibling chunk", () => {
    const chunk = readFileSync(dist("history-shell.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(chunk.includes(marker), `chunk is missing "${marker}"`).toBe(true);
    }
    for (const marker of NOT_IN_CHUNK) {
      expect(chunk.includes(marker), `chunk unexpectedly bundles "${marker}"`).toBe(false);
    }
  });
});
