import { defineConfig } from "tsup";

/**
 * Config for the IIFE/CDN widget bundle (`dist/index.global.js`, built from
 * `src/index-global.ts` then renamed by the `build:client` script).
 *
 * Lives in a config file rather than CLI flags because of the external
 * `@mcp-b/webmcp-polyfill`: tsup never applies its `external` option to IIFE
 * builds (its external plugin is gated on `format !== "iife"`), so the
 * exclusion must go through esbuild's native `external` list via
 * `esbuildOptions`. Named distinctly so the other CLI-driven build scripts
 * don't auto-load it the way they would a `tsup.config.ts`.
 */
export default defineConfig({
  entry: ["src/index-global.ts"],
  format: ["iife"],
  globalName: "AgentWidget",
  minify: true,
  sourcemap: true,
  splitting: false,
  outDir: "dist",
  loader: { ".css": "text" },
  esbuildOptions(options) {
    // Keep the WebMCP polyfill (and its ~22 kB transitive
    // @cfworker/json-schema) out of the CDN bundle. esbuild leaves the
    // bridge's bare `import("@mcp-b/webmcp-polyfill")` in place as a runtime
    // dynamic import; it is never invoked in this bundle because
    // `index-global.ts` registers a loader that imports the standalone
    // `webmcp-polyfill.js` chunk instead.
    options.external = [...(options.external ?? []), "@mcp-b/webmcp-polyfill"];
    // Keep the hosted Runtype TTS read-aloud engine + browser-fallback wrapper
    // (and the AudioPlaybackManager they bundle) out of the CDN payload. esbuild
    // leaves the loader's default `import("./runtype-tts-entry")` in place as a
    // dead relative import; it is never invoked here because `index-global.ts`
    // registers a loader that imports the standalone `runtype-tts.js` chunk from
    // a sibling URL instead.
    // `provider: 'runtype'` is opt-in, so most pages never fetch it.
    options.external.push("./runtype-tts-entry");

    // Keep the markdown parsers (marked and dompurify) out of the CDN payload. esbuild
    // leaves the loader's default import in place; it is never invoked here because
    // `index-global.ts` registers a loader that imports the standalone
    // `markdown-parsers.js` chunk from a sibling URL instead.
    options.external.push("./markdown-parsers-entry");

    // Keep the context-mentions runtime (controller/manager/menu) out of the CDN
    // payload. The loader's fallback `import("@runtypelabs/persona/context-mentions")`
    // is left as a dead external import; it is never invoked here because
    // `index-global.ts` registers a loader that imports the standalone
    // `context-mentions.js` chunk from a sibling URL instead. The core
    // orchestrator only references the runtime via that dynamic import, so the
    // heavy modules never enter this bundle (verified by the bundle test).
    options.external.push("@runtypelabs/persona/context-mentions");

    // Keep the inline-mention contenteditable engine (composer-document +
    // composer-contenteditable + inline entry) out of the CDN payload. Same
    // scheme: the loader's fallback
    // `import("@runtypelabs/persona/context-mentions-inline")` is a dead external
    // import here; `index-global.ts` registers a sibling-URL loader for the
    // standalone `context-mentions-inline.js` chunk. Only loaded on composer mount
    // when `display: "inline"`, so chip-only pages never fetch it.
    options.external.push("@runtypelabs/persona/context-mentions-inline");
  },
});
