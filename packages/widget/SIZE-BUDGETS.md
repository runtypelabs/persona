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

The arrow-to-pill morph that followed (a Web Animations width/color morph on
the motion tokens, kept in script so the stylesheet budgets are untouched)
raises both `index.global.js` budgets, again to the smallest that fits (CI
measures gzip slightly above a local build, so the gzip limit leaves that
margin):

| Output | Before | After | Budget |
| --- | ---: | ---: | ---: |
| `dist/index.global.js` (gzip) | 167.62 kB | 167.87 kB | 167.7 → 168 kB |
| `dist/index.global.js` (Brotli) | 132.91 KiB | 133.17 KiB | 133 → 133.2 KiB |

## Long user message collapse

`features.userMessageCollapse` (on under `future.v5Defaults`) adds the collapse
region and toggle to the default user bubble, the post-morph measurement and the
viewport hold to `ui.ts`, and the clip, fade and toggle styles to `widget.css`.
It runs on the first render so a long message never flashes at full height,
so it stays in the core rather than a lazy chunk. Raises, each to the smallest
budget that fits with room for the CI build's few extra bytes (gzip, decimal
kB, and Brotli, binary KiB; Before is main 3120c86, local build):

| Output | Before | After | Budget |
| --- | ---: | ---: | ---: |
| `dist/index.global.js` | 167.88 kB | 169.11 kB | 168 → 169.2 kB |
| `dist/widget.css` | 24.37 kB | 24.58 kB | 24.5 → 24.6 kB |
| `dist/index.global.js` (Brotli) | 133.15 KiB | 134.12 KiB | 133.2 → 134.2 KiB |
| `dist/widget.css` (Brotli) | 20.10 KiB | 20.25 KiB | 20.1 → 20.3 KiB |

`index.js` and `index.cjs` stay within their budgets (209.59 kB and 209.31 kB gzip).

## Stream transports and the client-session socket

`config.transport` (the transport seam), the Runtype client-session socket
(`runtype-client-session-v1`), and MPA navigation recovery. The socket itself
(`createWebSocketTransport`, the Runtype codec and its controller) is the new
lazy `websocket-transport.js` chunk, fetched only when an init response
advertises `realtime` or a host calls `loadWebSocketTransport()`. The
navigation-record helpers ride in `session-actions.js`, which a running page
tool has already loaded. What stays in the core is what must run before any
chunk can load: the intent hooks (launcher hover/focus, open, composer focus,
visibility), the `pagehide` navigation record, the bfcache reattach cursor,
the preconnect hint, and the transport routing in the client and session.
Raises, each to the smallest budget that fits with room for the CI build's
few extra bytes (gzip, decimal kB, and Brotli, binary KiB; Before is main
f81943e3 and After is this change rebased on main 7e4d8a18, local builds):

| Output | Before | After | Budget |
| --- | ---: | ---: | ---: |
| `dist/index.global.js` | 169.69 kB | 171.64 kB | 170 → 171.7 kB |
| `dist/index.cjs` | 228.47 kB | 231.20 kB | 228.5 → 231.25 kB |
| `dist/client-stream.js` | 10.54 kB | 10.62 kB | 10.55 → 10.65 kB |
| `dist/session-actions.js` | 2.87 kB | 3.54 kB | 3.25 → 3.55 kB |
| `dist/client-dispatch.js` | 5.56 kB | 5.69 kB | 5.7 → 5.8 kB |
| `dist/websocket-transport.js` | (new) | 5.45 kB | 5.5 kB |
| `dist/index.global.js` (Brotli) | 134.67 KiB | 136.29 KiB | 134.9 → 136.35 KiB |

`index.js` stays within its budget (214.44 kB gzip of 215.75 kB).

The last steps on `index.global.js` (171.5 → 171.7 kB, 136.2 → 136.35 KiB),
`index.cjs` (230.9 → 231.25 kB) and `session-actions.js` (3.4 → 3.55 kB)
buy the watching tab: a tab that follows a turn started in another tab
never owns, resumes or answers it. It shows that turn's questions and
approvals read-only, with no controls that do nothing, and settles them once
the owning tab answers. Which turns are watched is live session state, marked
on the messages only for rendering, so a stored transcript never makes the
owning tab's own question or approval read-only; and a watched question
settles only when a later stream leg of its turn arrives, never on another
message of the leg that paused (the 171.55 → 171.7 kB and 231.15 → 231.25 kB
part of these steps). The navigated page-tool resume moved into
`session-actions.js` to keep the CDN bundle's share of this small;
`index.cjs` inlines that chunk, so the move does not help it.

`websocket-transport.js` carries the stream edge cases as well as the happy
path: an `end` or stream `error` that arrives before the stream is claimed is
buffered and applied on claim; a turn the backend hands to the socket after
the socket was disabled, or that the socket refused before any data, is read
over HTTP from its start instead (`recoverStream`); a connect still resolving
its URL or credentials when the page is hidden never opens a socket; and a
request aborted while the socket opened is never sent. Whether a running page
tool caused a navigation is decided in `session-actions.js`, next to the
navigation hold, so the core only stores the answer for `pagehide`.

### `realtime.connect`

`realtime.connect` chooses when the socket connects (`'load'`, `'open'`,
`'focus'`, `'input'` or a host hook) and, when `realtime` is explicit, lets that
trigger start the client session. The default `'focus'` keeps its wiring in the
core; the other triggers and the hook machinery live in
`websocket-transport.js`, which any of them loads at mount because it is about
to open a socket anyway. The core keeps the trigger check, the explicit-session
rule and the loader call. Raises (gzip, decimal kB, and Brotli, binary KiB;
Before is the watching-tab After above, local builds):

| Output | Before | After | Budget |
| --- | ---: | ---: | ---: |
| `dist/index.global.js` | 171.64 kB | 171.89 kB | 171.7 → 171.95 kB |
| `dist/index.cjs` | 231.20 kB | 231.39 kB | 231.25 → 231.45 kB |
| `dist/websocket-transport.js` | 5.47 kB | 5.71 kB | 5.5 → 5.75 kB |
| `dist/index.global.js` (Brotli) | 136.29 KiB | 136.40 KiB | 136.35 → 136.45 KiB |

### Watch-path state across reconnects and tabs

A watched question settles on the stream cursor (a later non-await frame of its
execution past the question's pause), so a reconnect that replays the paused
turn from its start never settles it. The page-tool navigation record moved to
the tab's session storage, so another tab's save or exit can neither drop nor
consume it. A question sheet mounted again while it slides out is kept.
Raises (gzip, decimal kB, and Brotli, binary KiB; Before is the
`realtime.connect` After above, local builds):

| Output | Before | After | Budget |
| --- | ---: | ---: | ---: |
| `dist/index.global.js` | 171.89 kB | 172.08 kB | 171.95 → 172.15 kB |
| `dist/index.cjs` | 231.39 kB | 231.61 kB | 231.45 → 231.65 kB |
| `dist/index.global.js` (Brotli) | 136.40 KiB | 136.61 KiB | 136.45 → 136.65 KiB |

`websocket-transport.js` (5.73 kB of 5.75 kB) also keeps unread frames when a
stream's next leg arrives before anyone claimed it, and drops its buffer on a
claim that an attach replays.

### Turn ownership across tabs, navigation, and replays

A tab keeps a record of the executions it owns (a boot resume handle or
navigation record, and its own requests) and never watches one of them as
another tab's turn. A page-tool call counts as answered once its `/resume` is
sent, so the next page never answers it twice, and reconnects when the old
page already answered. A tab with no resume handle of its own keeps the stored
one when it saves. The
socket transport reads a replay whole: until the backend acknowledges an
attach, frames and ends of the relay it replaces are dropped. A connect
attempt settles only itself. `update()` connects at once when it changes
`realtime.connect` or replaces the client. Raises (Before is the watch-path
After above, local builds):

| Output | Before | After | Budget |
| --- | ---: | ---: | ---: |
| `dist/index.global.js` | 172.08 kB | 172.37 kB | 172.15 → 172.4 kB |
| `dist/index.cjs` | 231.61 kB | 232.04 kB | 231.65 → 232.1 kB |
| `dist/websocket-transport.js` | 5.73 kB | 5.95 kB | 5.75 → 6 kB |
| `dist/session-actions.js` | 3.54 kB | 3.62 kB | 3.55 → 3.65 kB |
| `dist/index.global.js` (Brotli) | 136.61 KiB | 137.03 KiB | 136.65 → 137.1 KiB |

Exact turn ownership (`clientTurnId`, no time window), three-state page-tool
answers carried across a navigation, and a stored transcript that always
travels with its resume cursor. Raises (Before is the After above, local
builds):

| Output | Before | After | Budget |
| --- | ---: | ---: | ---: |
| `dist/index.global.js` | 172.37 kB | 172.47 kB | 172.4 → 172.5 kB |
| `dist/index.cjs` | 232.04 kB | 232.17 kB | 232.1 → 232.2 kB |
| `dist/websocket-transport.js` | 5.95 kB | 5.96 kB | 6 kB (unchanged) |
| `dist/session-actions.js` | 3.62 kB | 3.68 kB | 3.65 → 3.7 kB |
