import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { defineConfig, type UserConfig } from "tsdown";

/**
 * Every widget bundle, built by one `tsdown` run (Rolldown + Oxc). Replaces the
 * ~30 sequential tsup invocations that used to live in package.json scripts and
 * `tsup.*.config.ts` files; published filenames are unchanged.
 *
 * Bundling vocabulary, translated from tsup:
 *   - tsup `noExternal: [/.*\/]` → `deps.alwaysBundle: [/.*\/]`. Standalone
 *     chunks bundle all of their dependencies so they load from a CDN with no
 *     module resolution.
 *   - tsup's negative-lookahead `noExternal` regexes plus an `external` list →
 *     `alwaysBundle: everything` + `neverBundle: <list>`. An explicit
 *     `neverBundle` entry becomes a Rolldown `external`, which is checked before
 *     tsdown's deps plugin, so it wins over `alwaysBundle` (tsup needed the
 *     lookaheads because its `noExternal` overrode `external`).
 *   - tsup `splitting: false` → `codeSplitting: false`: dynamic imports of
 *     bundled modules are inlined into the single output file.
 */

const SUBPATH_CHUNKS = [
  "@runtypelabs/persona/context-mentions",
  "@runtypelabs/persona/context-mentions-inline",
  "@runtypelabs/persona/history-view",
  "@runtypelabs/persona/event-stream-view",
  "@runtypelabs/persona/animations-extra",
  "@runtypelabs/persona/approval-ui",
  "@runtypelabs/persona/session-reconnect",
  "@runtypelabs/persona/webmcp-runtime",
  "@runtypelabs/persona/icons-extra",
  "@runtypelabs/persona/artifacts-ui",
  "@runtypelabs/persona/voice-runtime",
  "@runtypelabs/persona/forms-ui",
];

const BUNDLE_ALL = [/.*/];

const base = {
  outDir: "dist",
  // Several configs write into the same dist/; the build script wipes it once
  // up front instead.
  clean: false,
  target: "es2022",
  platform: "node",
  minify: true,
  report: false,
  // Dozens of builds run concurrently, so per-build plugin timings are noise.
  checks: { pluginTimings: false },
  outExtensions: ({ format }) => ({
    js: format === "cjs" ? ".cjs" : format === "iife" ? ".global.js" : ".js",
    dts: format === "cjs" ? ".d.cts" : ".d.ts",
  }),
  outputOptions: (options) => ({
    ...options,
    codeSplitting: false,
    // `index.ts` mixes named and default exports; keep tsup's CJS shape
    // (`exports.default` beside the named exports) without Rolldown's warning.
    exports: "named",
    // Hashed chunk names, as tsup emitted them; only theme-editor-preview splits.
    chunkFileNames: "chunk-[hash].js",
  }),
} satisfies UserConfig;

type Entries = Record<string, string>;

/** `from "./x.js"`, bare `import "./x.js"` and `import("./x.js")` in emitted declarations. */
const RELATIVE_JS_SPECIFIER = /((?:from|import)\s*\(?\s*")(\.{1,2}\/[^"]+)\.js"/g;

/**
 * ESM + CJS library entries; deps stay external (tsup's default). Rolldown
 * refuses `codeSplitting: false` for a multi-input build, so each entry gets its
 * own single-input build. Declarations come from the one dts-only build below.
 */
const library = (entries: Entries, extra: UserConfig = {}): UserConfig[] =>
  Object.entries(entries).map(([name, file]) => ({
    ...base,
    entry: { [name]: file },
    format: ["esm", "cjs"],
    ...extra,
  }));

/**
 * Every published `.d.ts` / `.d.cts`, from a single tsgo run. The dts plugin
 * adds a `.d.ts` input to whatever build it runs in (which `codeSplitting:
 * false` rejects), and one run per entry spent ~30 s re-checking the same
 * program. Shared declarations land in hashed `.d.ts` chunks.
 */
const declarations = (entries: Entries): UserConfig => ({
  ...base,
  entry: entries,
  // ESM only: `emitDtsOnly` drops the ESM JS output but not a CJS build's, which
  // would overwrite the minified `.cjs` entries. The `.d.cts` twins are derived
  // in onSuccess (tsup's were byte-identical to the `.d.ts`).
  format: ["esm"],
  minify: false,
  outputOptions: undefined,
  dts: { generator: "tsgo", emitDtsOnly: true },
  // Lazy subpaths stay package imports, as in the JS build.
  deps: { dts: { neverBundle: SUBPATH_CHUNKS } },
  // INVARIANT: a module .d.ts without an export list implicitly exports every
  // hoisted internal declaration.
  footer: { dts: "export {}" },
  onSuccess: () => {
    const files = new Map<string, string>();
    for (const file of readdirSync("dist", { recursive: true, encoding: "utf8" })) {
      if (file.endsWith(".d.ts")) files.set(file, readFileSync(join("dist", file), "utf8"));
    }
    // Drop declarations nothing reaches: the dts build also emits one per
    // dynamically imported module (`./client-stream`, ...), which no entry's
    // types reference.
    const reachable = new Set<string>();
    const visit = (file: string) => {
      if (reachable.has(file) || !files.has(file)) return;
      reachable.add(file);
      for (const [, , spec] of files.get(file)!.matchAll(RELATIVE_JS_SPECIFIER)) {
        visit(join(dirname(file), `${spec}.d.ts`));
      }
    };
    for (const name of Object.keys(entries)) visit(`${name}.d.ts`);
    for (const [file, source] of files) {
      if (!reachable.has(file)) {
        rmSync(join("dist", file));
        continue;
      }
      // Point relative chunk imports at the `.d.cts` twins.
      const cts = source.replace(RELATIVE_JS_SPECIFIER, '$1$2.cjs"');
      writeFileSync(join("dist", file.replace(/\.d\.ts$/, ".d.cts")), cts);
    }
  },
});

/**
 * Standalone lazy chunk loaded on demand by the core bundles (ESM for the IIFE
 * sibling-URL loader and bundler consumers; CJS because the loader's `import()`
 * is lowered to `require()` inside `dist/index.cjs`, which resolves the chunk via
 * the package's `require` export condition).
 */
const lazyChunk = (name: string, neverBundle?: string[]): UserConfig[] =>
  library({ [name]: `src/${name}.ts` }, { deps: { alwaysBundle: BUNDLE_ALL, neverBundle } });

const LAZY_CHUNKS = SUBPATH_CHUNKS.map((spec) => spec.replace("@runtypelabs/persona/", ""));

/**
 * ESM-only sibling-URL chunk for the IIFE bundle. Self-references to the
 * package's lazy subpaths and the markdown parsers stay external: they are
 * separate chunks with their own loaders.
 */
const siblingChunk = (name: string, entry = `src/${name}.ts`): UserConfig => ({
  ...base,
  entry: { [name]: entry },
  format: ["esm"],
  deps: {
    alwaysBundle: BUNDLE_ALL,
    neverBundle: ["./markdown-parsers-entry", /^@runtypelabs\/persona\//],
  },
});

/** IIFE script-tag bundle; tsup bundled every dependency into IIFE output. */
const iife = (name: string, entry: string, globalName: string | undefined, neverBundle: string[] = []): UserConfig => ({
  ...base,
  entry: { [name]: entry },
  format: ["iife"],
  globalName,
  sourcemap: true,
  deps: { alwaysBundle: BUNDLE_ALL, neverBundle },
  outputOptions: (options) => ({
    ...base.outputOptions(options),
    // tsdown would otherwise name IIFE entries `<name>.iife.global.js`.
    entryFileNames: "[name].global.js",
    // Rolldown tags the exports object with `Symbol.toStringTag`; for an IIFE
    // whose entry exports nothing (the installer) it writes that tag to an
    // undeclared `exports` and throws at load. tsup never emitted the tag.
    generatedCode: { ...options.generatedCode, symbols: false },
  }),
});

export default defineConfig([
  {
    ...base,
    entry: { "markdown-parsers": "src/markdown-parsers-entry.ts" },
    format: ["esm"],
    deps: { alwaysBundle: BUNDLE_ALL },
    // The ESM build's `import("./markdown-parsers-entry")` is left external;
    // this shim makes that relative specifier resolve to the parsers chunk.
    onSuccess: () => writeFileSync("dist/markdown-parsers-entry.js", 'export * from "./markdown-parsers.js";\n'),
  },
  siblingChunk("client-stream"),
  siblingChunk("client-history"),
  siblingChunk("ui-extras", "src/ui-extras-entry.ts"),
  siblingChunk("session-actions"),
  siblingChunk("history-shell"),

  library({ index: "src/index.ts" }, { sourcemap: true, deps: { neverBundle: SUBPATH_CHUNKS } }),

  // CDN bundle. Every sibling-URL chunk and lazy subpath stays out of it: the
  // loaders' default imports are left in place as dead externals, never invoked
  // because `index-global.ts` registers loaders that fetch the standalone chunk
  // from a sibling URL instead. The WebMCP polyfill (and its ~22 kB transitive
  // @cfworker/json-schema) likewise loads from `webmcp-polyfill.js`.
  iife("index", "src/index-global.ts", "AgentWidget", [
    "@mcp-b/webmcp-polyfill",
    "./runtype-tts-entry",
    "./markdown-parsers-entry",
    "./client-stream",
    "./client-history",
    "./ui-extras-entry",
    "./session-actions",
    "./history-shell",
    ...SUBPATH_CHUNKS,
  ]),
  iife("install", "src/install.ts", "SiteAgentInstaller"),
  // Critical-path launcher: the extra icon data loads from a sibling
  // `icons-extra.js` derived from the launcher script's own src.
  iife("launcher", "src/launcher-global.ts", "AgentWidgetLauncher", ["@runtypelabs/persona/icons-extra"]),

  {
    ...base,
    entry: ["src/webmcp-polyfill.ts"],
    format: ["esm"],
    deps: { alwaysBundle: BUNDLE_ALL },
  },
  lazyChunk("context-mentions"),
  lazyChunk("context-mentions-inline"),
  lazyChunk("history-view"),
  lazyChunk("event-stream-view"),
  {
    ...base,
    entry: { "runtype-tts": "src/voice/runtype-tts-entry.ts" },
    format: ["esm"],
    deps: { alwaysBundle: BUNDLE_ALL },
  },
  library({ "theme-reference": "src/theme-reference.ts" }),
  library({ codegen: "src/codegen.ts" }),
  library({ "theme-editor": "src/theme-editor.ts" }),
  library(
    { "theme-editor-preview": "src/theme-editor-preview.ts" },
    {
      // The one entry tsup built with ESM code splitting on.
      outputOptions: (options, format) => ({
        ...base.outputOptions(options),
        codeSplitting: format !== "cjs",
      }),
    },
  ),
  library({ testing: "src/testing.ts" }),
  library({ "smart-dom-reader": "src/smart-dom-reader.ts" }),
  library({ "voice-worklet-player": "src/voice-worklet-player.ts" }),
  library({ "plugin-kit": "src/plugin-kit.ts" }),
  library({ "animations/glyph-cycle": "src/animations/glyph-cycle.ts", "animations/wipe": "src/animations/wipe.ts" }),
  lazyChunk("animations-extra"),
  lazyChunk("approval-ui"),
  lazyChunk("session-reconnect"),
  lazyChunk("webmcp-runtime"),
  lazyChunk("icons-extra"),
  // The markdown parsers load through their own sibling chunk; the icons-extra
  // registry tail through its subpath.
  lazyChunk("artifacts-ui", ["./markdown-parsers-entry", "@runtypelabs/persona/icons-extra"]),
  lazyChunk("voice-runtime"),
  lazyChunk("forms-ui"),

  declarations({
    index: "src/index.ts",
    "theme-reference": "src/theme-reference.ts",
    codegen: "src/codegen.ts",
    "theme-editor": "src/theme-editor.ts",
    "theme-editor-preview": "src/theme-editor-preview.ts",
    testing: "src/testing.ts",
    "smart-dom-reader": "src/smart-dom-reader.ts",
    "voice-worklet-player": "src/voice-worklet-player.ts",
    "plugin-kit": "src/plugin-kit.ts",
    "animations/glyph-cycle": "src/animations/glyph-cycle.ts",
    "animations/wipe": "src/animations/wipe.ts",
    ...Object.fromEntries(LAZY_CHUNKS.map((name) => [name, `src/${name}.ts`])),
  }),
].flat());
