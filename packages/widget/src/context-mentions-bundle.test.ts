import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Bundle guard for the lazy context-mentions chunk (see
 * `docs/context-mentions-plan.md`, Bundle strategy).
 *
 * The mention runtime (controller/manager/menu) must NOT land in the core CDN
 * bundle (`dist/index.global.js`) — it ships as the sibling chunk
 * `dist/context-mentions.js`, loaded on demand. A stray *static* import of
 * `./context-mentions-entry` anywhere on the core path would pull the runtime
 * back into `index.global.js`; this test fails loudly if that happens.
 *
 * Skips when `dist/` hasn't been built (e.g. a test-only CI step).
 */
const dist = (f: string) => resolve(__dirname, "..", "dist", f);

const RUNTIME_MARKERS = [
  "persona-mention-menu", // menu component class — chunk-only
  "persona-mention-group-header", // menu component class — chunk-only
  // Slash-command dispatch lives in the controller (chunk-only); this literal
  // is unique to the command path and must not leak into the core bundle.
  "context-mention prompt resolve failed",
];

describe("context-mentions bundle split", () => {
  const built = existsSync(dist("index.global.js")) && existsSync(dist("context-mentions.js"));

  it.runIf(built)("keeps the mention runtime OUT of the core IIFE bundle", () => {
    const core = readFileSync(dist("index.global.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(core.includes(marker), `core bundle unexpectedly contains "${marker}"`).toBe(false);
    }
    // The loader stub (sibling-URL reference) must remain so the chunk can load.
    expect(core).toContain("context-mentions.js");
  });

  it.runIf(built)("ships the mention + slash-command runtime in the sibling chunk", () => {
    const chunk = readFileSync(dist("context-mentions.js"), "utf8");
    expect(chunk).toContain("persona-mention-menu");
    // Slash-command dispatch ships in the chunk, not the core.
    expect(chunk).toContain("context-mention prompt resolve failed");
  });
});
