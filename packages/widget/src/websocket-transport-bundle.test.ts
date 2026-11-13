import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Bundle guard for the lazy websocket-transport chunk: `createWebSocketTransport`,
 * the Runtype client-session codec and its controller. Core bundles reach it
 * only through `loadWebSocketTransport()` (the IIFE via a sibling URL, ESM/CJS
 * via the external `@runtypelabs/persona/websocket-transport` subpath); a stray
 * static import would inline it. Skips when `dist/` hasn't been built.
 */
const dist = (f: string) => resolve(__dirname, "..", "dist", f);

// Chunk-only literals: emitted nowhere else.
const RUNTIME_MARKERS = [
  "The socket could not be re-established.",
  "The realtime socket needs the visitor credential.",
];

const SUBPATH = "@runtypelabs/persona/websocket-transport";

describe("websocket-transport bundle split", () => {
  const iifeBuilt =
    existsSync(dist("index.global.js")) && existsSync(dist("websocket-transport.js"));
  const esmBuilt = existsSync(dist("index.js")) && existsSync(dist("index.cjs"));

  it.runIf(iifeBuilt)("keeps the socket transport OUT of the core IIFE bundle", () => {
    const core = readFileSync(dist("index.global.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(core.includes(marker), `IIFE bundle unexpectedly contains "${marker}"`).toBe(
        false
      );
    }
    // The loader stub (sibling-URL reference) must remain so the chunk can load.
    expect(core).toContain("websocket-transport.js");
  });

  it.runIf(esmBuilt)("keeps the socket transport OUT of the ESM/CJS bundles", () => {
    for (const file of ["index.js", "index.cjs"]) {
      const core = readFileSync(dist(file), "utf8");
      for (const marker of RUNTIME_MARKERS) {
        expect(core.includes(marker), `${file} unexpectedly contains "${marker}"`).toBe(
          false
        );
      }
      if (core.includes("websocket-transport")) {
        expect(
          core.includes(SUBPATH),
          `${file} must reach the socket transport via the external subpath`
        ).toBe(true);
      }
    }
  });

  it.runIf(iifeBuilt)("ships the socket transport in the sibling chunk", () => {
    const chunk = readFileSync(dist("websocket-transport.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(chunk.includes(marker), `chunk is missing "${marker}"`).toBe(true);
    }
    expect(existsSync(dist("websocket-transport.cjs"))).toBe(true);
    expect(existsSync(dist("websocket-transport.d.ts"))).toBe(true);
  });
});
