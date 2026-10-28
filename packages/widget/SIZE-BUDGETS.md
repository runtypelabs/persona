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
(`scripts/terser-global.mjs`) after the tsdown build. Terser's frequency-ordered
identifier mangling compresses markedly better under Brotli, and the pass
chains the source map. With the ES2022 target, TypeScript `private` members in
the session, client, and voice classes are native `#private` fields, so their
names are mangled too. Together these cut `index.global.js` from 156.32 KiB to
145.69 KiB Brotli (195.57 kB → 184.84 kB gzip) with no behavior change; the
history confirm dialog moved into the lazy `history-view.js` chunk.

## Lazy core chunks

Code that only runs after something happens is split out of
`index.global.js` into sibling chunks. Each one uses the same loader pattern as
`markdown-parsers.js`: a relative fallback import (inlined in the ESM/CJS
builds, which also register the module eagerly), an IIFE external, and a
sibling-URL loader in `index-global.ts`.

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

Handling the server's `session_end` frame adds the end-reason texts and the
one-shot reconnect to `RuntypeVoiceProvider`. Approved
raises (gzip, measured against main 837794ea):

| Output | Before | After | Budget |
| --- | ---: | ---: | ---: |
| `dist/voice-runtime.js` | 11.91 kB | 12.41 kB | 12.25 → 12.75 kB |
| `dist/index.js` | 214.52 kB | 215.12 kB | 215 → 215.25 kB |
| `dist/index.cjs` | 215.35 kB | 215.92 kB | 215.75 → 216 kB |

The npm entries re-export the provider, so they carry the same code as the
lazy chunk. `index.global.js` doesn't inline the provider and grows only by the
status-line hook (163.94 kB gzip, 129.84 KiB Brotli), within its existing budgets.
The after column includes the review fixes (#479 and its follow-up: the
suspended-audio guard on the reconnect, notices that hold the status line for
their full time, and `auth_expired` as a plain end instead of a re-mint).

## Voice across page navigation

Resuming a live call on the next page of a multi-page site adds the live-call
check, the `pagehide` re-stamp and the tap-to-resume fallback to `ui.ts`, the
fail-fast audio start for a restored call to `RuntypeVoiceProvider`, and earlier
calls' captions (minus delegated filler) to the call-start context. Approved
raises (gzip; After measured on the PR rebased onto main 743db1bc, Before is
the session_end After above):

| Output | Before | After | Budget |
| --- | ---: | ---: | ---: |
| `dist/index.js` | 215.12 kB | 215.28 kB | 215.25 → 215.5 kB |
| `dist/index.cjs` | 215.92 kB | 216.06 kB | 216 → 216.25 kB |

`index.global.js` stays within its existing budgets (164.05 kB gzip).

## Operator role

The `operator` message role (a human on the agent's side, with its own bubble
tokens) adds the operator bubble styles to `widget.css`, the operator defaults
to the shared token tables, and the operator branches to the message bubble.
Raises, each to the smallest budget that fits (gzip, decimal kB, and Brotli,
binary KiB; Before is main c2e2bb1e):

| Output | Before | After | Budget |
| --- | ---: | ---: | ---: |
| `dist/index.global.js` | 166.72 kB | 167.54 kB | 167 → 167.6 kB |
| `dist/theme-editor.js` | 40.49 kB | 40.55 kB | 40.5 → 40.6 kB |
| `dist/history-shell.js` | within 13.75 kB | 13.79 kB | 13.75 → 13.8 kB |
| `dist/client-dispatch.js` | within 5.5 kB | 5.63 kB | 5.5 → 5.65 kB |
| `dist/widget.css` (Brotli) | 19.99 KiB | 20.07 KiB | 20 → 20.1 KiB |

The `history-shell.js` and `client-dispatch.js` raises, and most of the
`index.global.js` one, come from operator provenance (`author`,
`copy.operatorLabel`), the `modelMessageTransform` hook and its result
validation, and keeping operator replies through retry and edit.

`widget.css` stays within its 24.5 kB gzip budget (24.23 → 24.32 kB), and
`index.global.js` stays within its 133 KiB Brotli budget (132.91 KiB).

## Approval needed jump control

Naming a pending approval below the fold in the jump-to-latest control (the
approval state, its below-the-fold check, and focusing the approval's primary
action after the jump) adds to the core bundle, net of the anchor-top handoff
code this change removes. Raises the one budget it exceeds, to the smallest
that fits (gzip, decimal kB; Before is main 465d95e, local build):

| Output | Before | After | Budget |
| --- | ---: | ---: | ---: |
| `dist/index.global.js` | 167.49 kB | 167.62 kB | 167.6 → 167.7 kB |

`widget.css` stays within its budgets (24.37 kB gzip of 24.5 kB; 20.10 KiB
Brotli of 20.1 KiB), and `index.global.js` stays within its 133 KiB Brotli
budget (132.91 KiB).
