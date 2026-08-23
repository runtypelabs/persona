import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Bundle guard for the lazy voice-runtime chunk (provider factory + Runtype/
 * browser providers + audio playback manager).
 *
 * The provider runtime must NOT land in the CDN IIFE: session.ts loads it
 * lazily (prefetched when a provider is configured). The npm bundles DO keep
 * it via the public factory exports in `index.ts`, so only the IIFE is
 * asserted clean. Read-aloud (BrowserSpeechEngine/ReadAloudController) stays
 * eager by design and is not a marker.
 *
 * Skips when `dist/` hasn't been built (e.g. a test-only CI step).
 */
const dist = (f: string) => resolve(__dirname, "..", "dist", f);

// Factory/provider-only literals.
const RUNTIME_MARKERS = [
  "Runtype voice provider requires configuration",
  "Browser speech recognition not supported",
];

describe("voice-runtime bundle split", () => {
  const iifeBuilt =
    existsSync(dist("index.global.js")) && existsSync(dist("voice-runtime.js"));

  it.runIf(iifeBuilt)("keeps the provider runtime OUT of the core IIFE bundle", () => {
    const core = readFileSync(dist("index.global.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(core.includes(marker), `IIFE bundle unexpectedly contains "${marker}"`).toBe(
        false
      );
    }
    // The loader stub (sibling-URL reference) must remain so the chunk can load.
    expect(core).toContain("voice-runtime.js");
  });

  it.runIf(iifeBuilt)("ships the provider runtime in the sibling chunk", () => {
    const chunk = readFileSync(dist("voice-runtime.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(chunk.includes(marker), `chunk is missing "${marker}"`).toBe(true);
    }
    expect(existsSync(dist("voice-runtime.cjs"))).toBe(true);
    expect(existsSync(dist("voice-runtime.d.ts"))).toBe(true);
  });
});
