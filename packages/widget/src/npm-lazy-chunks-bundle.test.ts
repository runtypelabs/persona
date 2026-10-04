import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Bundle guard for the lazy core chunks in the npm ESM/CJS entries.
 *
 * These chunks used to be inlined into `dist/index.{js,cjs}` (relative loader
 * fallbacks under `--splitting false`, plus eager registration). The loaders
 * now fall back to the package's own `@runtypelabs/persona/<chunk>` subpaths,
 * which `build:client` marks external, so consumer bundlers code-split them
 * exactly as the CDN build fetches sibling chunks. A stray relative import or
 * eager registration would inline a chunk again; this fails then.
 *
 * Skips when `dist/` hasn't been built (e.g. a test-only CI step).
 */
const dist = (f: string) => resolve(__dirname, "..", "dist", f);

// One literal per chunk that only that chunk's source emits. `null`: no stable
// unique literal, so only the subpath reference is checked.
const CHUNKS: Array<{ subpath: string; marker: string | null }> = [
  { subpath: "client-stream", marker: "Failed to parse chat stream payload" },
  { subpath: "client-history", marker: "The request carried no visitor credential" },
  { subpath: "ui-extras", marker: "data-persona-mention-context-row" },
  { subpath: "session-actions", marker: "WebMCP tool execution failed." },
  { subpath: "history-shell", marker: "persona-rail-resizer" },
  { subpath: "runtype-tts", marker: null },
  { subpath: "activity-ui", marker: "persona-tool-detail-copy" },
];

describe("npm entry lazy-chunk split", () => {
  const esmBuilt = existsSync(dist("index.js")) && existsSync(dist("index.cjs"));

  it.runIf(esmBuilt)("keeps the lazy chunks OUT of the ESM/CJS bundles", () => {
    for (const file of ["index.js", "index.cjs"]) {
      const core = readFileSync(dist(file), "utf8");
      for (const { subpath, marker } of CHUNKS) {
        expect(
          core.includes(`@runtypelabs/persona/${subpath}`),
          `${file} must reach ${subpath} via the external subpath`
        ).toBe(true);
        if (marker) {
          expect(core.includes(marker), `${file} unexpectedly inlines ${subpath}`).toBe(false);
        }
      }
    }
  });

  it.runIf(esmBuilt)("ships every subpath the npm entries import", () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "..", "package.json"), "utf8")) as {
      exports: Record<string, { import?: string; require?: string; types?: string }>;
    };
    for (const { subpath, marker } of CHUNKS) {
      const entry = pkg.exports[`./${subpath}`];
      expect(entry, `package.json exports is missing ./${subpath}`).toBeDefined();
      for (const target of [entry.import, entry.require, entry.types]) {
        expect(target && existsSync(resolve(__dirname, "..", target)), `${target} not built`).toBe(
          true
        );
      }
      if (marker) {
        const chunk = readFileSync(resolve(__dirname, "..", entry.import as string), "utf8");
        expect(chunk.includes(marker), `${subpath} chunk is missing its marker`).toBe(true);
      }
    }
  });
});
