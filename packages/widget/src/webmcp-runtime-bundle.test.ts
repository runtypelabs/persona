import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Bundle guard for the lazy webmcp-runtime chunk (the WebMcpBridge class).
 *
 * The bridge runtime must NOT land in the CDN IIFE (`dist/index.global.js`):
 * client.ts constructs it lazily from the sibling chunk when
 * `config.webmcp.enabled` is true, and the npm `WebMcpBridge` façade ships
 * from `index.ts` only. The ESM/CJS bundles DO carry it (via the façade's
 * static import — npm surface unchanged), so only the IIFE is asserted clean.
 *
 * Also guards the chunk itself against two regressions: bundling the
 * `@mcp-b/webmcp-polyfill` (a value edge into core webmcp-bridge would inline
 * its bare-specifier fallback) and carrying a duplicated title map (the deps
 * are injected instead).
 *
 * Skips when `dist/` hasn't been built (e.g. a test-only CI step).
 */
const dist = (f: string) => resolve(__dirname, "..", "dist", f);

// Class-only literals: error copy emitted nowhere else in core.
const RUNTIME_MARKERS = [
  "WebMCP tool not registered on this page",
  "User declined the tool call.",
];

describe("webmcp-runtime bundle split", () => {
  const iifeBuilt =
    existsSync(dist("index.global.js")) && existsSync(dist("webmcp-runtime.js"));

  it.runIf(iifeBuilt)("keeps the bridge runtime OUT of the core IIFE bundle", () => {
    const core = readFileSync(dist("index.global.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(core.includes(marker), `IIFE bundle unexpectedly contains "${marker}"`).toBe(
        false
      );
    }
    // The loader stub (sibling-URL reference) must remain so the chunk can load.
    expect(core).toContain("webmcp-runtime.js");
  });

  it.runIf(iifeBuilt)("ships the bridge runtime in the sibling chunk, deps-clean", () => {
    const chunk = readFileSync(dist("webmcp-runtime.js"), "utf8");
    for (const marker of RUNTIME_MARKERS) {
      expect(chunk.includes(marker), `chunk is missing "${marker}"`).toBe(true);
    }
    // No polyfill inlined: `registerTool` / `cfworker` only exist inside
    // @mcp-b/webmcp-polyfill (the class merely CALLS the injected module's
    // initializeWebMCPPolyfill, so that name legitimately appears here).
    expect(chunk.includes("registerTool")).toBe(false);
    expect(chunk.includes("cfworker")).toBe(false);
    // A CJS twin exists for require()-based consumers.
    expect(existsSync(dist("webmcp-runtime.cjs"))).toBe(true);
    // Declarations ship with the chunk so the subpath is typed.
    expect(existsSync(dist("webmcp-runtime.d.ts"))).toBe(true);
  });
});
