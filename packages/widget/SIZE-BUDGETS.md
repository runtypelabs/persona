# Widget bundle budgets

`pnpm --filter @runtypelabs/persona size` enforces gzip budgets in
`.size-limit.json`. `pnpm build:widget` also enforces the Brotli budgets in
`scripts/check-size.mjs`. Both checks must pass; they measure different encodings.

## Opt-in V5 preview

The preview ships both defaults tables, theme tokens, activity rendering, and
Request/Response styles. The flag controls behavior, not which code is downloaded.
The gzip limits below account for that additional functionality. Unaffected
entry points keep their existing limits. The Brotli limits are 131 KiB
for the browser bundle, strictly below 20 KiB for the launcher, and 20 KiB for CSS.

Measured after the preview compatibility fixes (gzip, decimal kB):

| Output | Measured | Budget |
| --- | ---: | ---: |
| `dist/index.global.js` | 184.84 kB | 186.5 kB |
| `dist/launcher.global.js` | 19.11 kB | 19.75 kB |
| `dist/widget.css` | 23.39 kB | 24 kB |
| `dist/index.js` | 205.34 kB | 207 kB |
| `dist/index.cjs` | 206.23 kB | 208 kB |
| `dist/theme-editor.js` | 39.46 kB | 40.5 kB |
| `dist/theme-editor-preview.js` | 171.94 kB | 174 kB |

These are explicit budgets, not automatically adjusted thresholds. Future growth
should be investigated before changing them. Shared theme code affects the
launcher and editor as well as the main widget; optional behavior still has a
payload cost when it is statically included.

## Terser pass and ES2022 output

The `*.global.js` bundles get a second minification pass
(`scripts/terser-global.mjs`) after esbuild. Terser's frequency-ordered
identifier mangling compresses markedly better under Brotli, and the pass
chains the source map. With the ES2022 target, TypeScript `private` members in
the session, client, and voice classes are native `#private` fields, so their
names are mangled too. Together these cut `index.global.js` from 156.32 KiB to
145.69 KiB Brotli (195.57 kB → 184.84 kB gzip) with no behavior change; the
history confirm dialog moved into the lazy `history-view.js` chunk.

## Lazy core chunks

Code that only runs after something happens is split out of
`index.global.js` into sibling chunks. Each one uses the same loader pattern as
`markdown-parsers.js`: a fallback import of the package's own
`@runtypelabs/persona/<chunk>` subpath (external in the ESM/CJS builds, see
"npm entry code-splitting" below), an IIFE external, and a sibling-URL loader
in `index-global.ts`.

| Chunk | Contents | Fetched |
| --- | --- | --- |
| `client-stream.js` | SSE stream processor, approval / resume requests | at each dispatch (in parallel with the request) and on first panel render |
| `client-history.js` | visitor-history REST and identity binding | on the first history call |
| `history-shell.js` | history shell (rail, panel host, conversation actions) and the Runtype history provider | at mount when history is enabled, else on first history API use |
| `session-actions.js` | approval, ask-user-question, and WebMCP resolve paths | when an execution pauses for one |
| `ui-extras.js` | ask-user sheet handlers, context-mention orchestrator | when a sheet mounts / at mount with `contextMentions.enabled` |

Chunks that need stateful core modules (chunk loaders, icon registry, tooltip
timing, error classes checked with `instanceof`) receive core's instances
through a context object instead of bundling their own copies. Together with
the voice glue moving into `voice-runtime.js`, this takes `index.global.js`
from 145.69 KiB to 129.53 KiB Brotli (184.84 kB → 163.60 kB gzip). The npm
ESM/CJS bundles grow by about 1.7 kB gzip from the loader indirection.

## Voice `session_end` (Amendment 6)

Handling the server's `session_end` frame adds the end-reason texts, the
one-shot reconnect and the auth refresh to `RuntypeVoiceProvider`. Approved
raises (gzip, measured against main 837794ea):

| Output | Before | After | Budget |
| --- | ---: | ---: | ---: |
| `dist/voice-runtime.js` | 11.91 kB | 12.51 kB | 12.25 → 12.75 kB |
| `dist/index.js` | 214.52 kB | 215.15 kB | 215 → 215.25 kB |
| `dist/index.cjs` | 215.35 kB | 215.95 kB | 215.75 → 216 kB |

The npm entries re-export the provider, so they carry the same code as the
lazy chunk. `index.global.js` doesn't inline the provider and grows only by the
status-line hook (163.94 kB gzip, 129.84 KiB Brotli), within its existing budgets.
The after column includes the review fixes (hang-up and failure guards on the
reconnect, and notices that hold the status line for their full time).

## npm entry code-splitting

The ESM/CJS entries used to inline the lazy core chunks: their loaders fell back
to relative imports, which `--splitting false` bundled, and `index.ts`
registered them eagerly. The loaders now fall back to the package's own
subpaths (`./client-stream`, `./client-history`, `./ui-extras`,
`./session-actions`, `./history-shell`, `./runtype-tts`), which
`build:client` marks external, so consumer bundlers code-split them the way the
CDN fetches sibling chunks. Each chunk now also builds as CJS with declarations.
`markdown-parsers` and `icons-extra` stay eager because `markdownPostprocessor`,
`createDefaultSanitizer` and `renderLucideIcon` are synchronous APIs.

The tool and reasoning bubbles, activity rows and collapsible tool groups moved
into a new `activity-ui.js` chunk (both builds). It is warmed on first panel
render when tool calls or reasoning can show, and a message that renders before
it lands holds an empty row until the chunk re-renders it, as with approvals.

Measured gzip, decimal kB, against main 44901604:

| Output | Before | After | Budget |
| --- | ---: | ---: | ---: |
| `dist/index.js` | 215.17 kB | 180.10 kB | 215.25 → 180.5 kB |
| `dist/index.cjs` | 215.95 kB | 180.96 kB | 216 → 181.25 kB |
| `dist/index.global.js` | 163.94 kB | 158.63 kB | 166 → 159 kB |
| `dist/activity-ui.js` | — | 10.25 kB | 10.5 kB |

`index.global.js` is 125.52 KiB Brotli (was 129.84 KiB).

What remains in the npm entries is core (about 157 kB, the same code the CDN
bundle ships) plus about 23 kB of npm-only barrel exports: `generateCodeSnippet`
(8.4 kB, also at `./codegen`), the voice provider factory (6.8 kB),
`createDemoCarousel` (3.3 kB), `WebMcpBridge` (1.7 kB) and the theme-plugin
factories. These are synchronous exports, so moving them to subpaths would be a
breaking change.
