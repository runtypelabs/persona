# Bundle sizes and loading boundaries

The size checks retain the existing limits. `packages/widget/.size-limit.json`
measures gzip in decimal kB; `scripts/check-size.mjs` measures Brotli quality 11
in binary KiB. The original Brotli ceilings are 131 KiB for the CDN widget,
20 KiB for its stylesheet, and less than 20 KiB for the deferred launcher.

Measurements from the October 18, 2026 whole-turn activity build (gzip level 9 and Brotli quality 11):

| File | Gzip kB | Existing limit kB |
| --- | ---: | ---: |
| `index.global.js` | 165.04 | 166 |
| `launcher.global.js` | 17.45 | 19.75 |
| `widget.css` | 23.05 | 24 |
| `install.global.js` | 3.00 | 3 |
| `index.js` | 203.91 | 215.75 |
| `index.cjs` | 203.66 | 216.75 |
| `theme-editor.js` | 40.43 | 40.5 |
| `voice-runtime.js` | 13.48 | 14 |
| `history-shell.js` | 13.63 | 13.75 |

The installer is 2,998 bytes gzip; the table rounds to two decimal places.
The CDN widget is 130.91 KiB Brotli (134,052 bytes, with 92 bytes of headroom).
Its remaining headroom is small: run both
size checks when changing core code. These are per-file budgets, not a claim
that the complete interaction downloads only the core file.

## Separately loaded code

Each new chunk has an explicit gzip budget in the same size-limit file.

| Chunk | Gzip kB | Loaded when |
| --- | ---: | --- |
| `composer-actions-runtime.js` | 15.26 | Before the widget is revealed; also supplies approval popover helpers |
| `activity-ui.js` | 12.23 | Before reveal when tool/reasoning messages or whole-turn activity are enabled |
| `turn-activity-ui.js` | 2.37 | Before reveal only for `turnActivity.enabled`; 2.5 kB gzip budget |
| `loading-label-runtime.js` | 2.70 | Before reveal for animated waiting labels, enabled tool/reasoning/turn UI, or artifact UI; 2.75 kB gzip budget |
| `dictation-runtime.js` | 4.66 | Before reveal when voice recognition is enabled |
| `client-dispatch.js` | 5.28 | The CDN client initializes a session, sends a message, or submits feedback |
| `config-diagnostics.js` | 1.60 | Debug migration diagnostics are enabled |
| `background-runtime.js` | 0.67 | Background conversation work is enabled |
| `preferences-runtime.js` | 1.96 | The theme editor applies a preset with behavior preferences |

The activity chunk owns per-widget disclosure timers, grouped rendering, and the opt-in `expansion.animation: "height"` implementation. Disclosure motion stays out of the core and the shared loading-label chunk. The activity entry uses safe Terser function hoisting while retaining repeated expressions and separate statements for better gzip compression. It measures 12,230 bytes gzip, with 20 bytes of headroom under its unchanged 12,250-byte ceiling.
The stream parser is 10,496 bytes gzip under its unchanged 10,500-byte ceiling. Phase support shares existing text parsing and block bookkeeping; disabling conditional folding in its safe minification pass preserves compression. The opt-in turn view is 2,369 bytes gzip / 2,102 bytes Brotli.

The shared loading-label module owns builtin effects, configuration resolution,
and custom-hook lifecycle factories. With tools, reasoning, and artifacts disabled,
animated waiting labels fetch **2,704 bytes gzip / 2,399 bytes Brotli**. Before
the October 2026 loading-label split, that path downloaded the 11,185-byte gzip /
10,075-byte Brotli activity module. The split saved 8,481 bytes gzip / 7,676 bytes
Brotli with the same single optional request; disclosure motion does not change
the waiting-only download.
Plain `loadingLabel.animation: "none"` and V4 dots-only text configurations avoid
both modules. Enabled tool/reasoning renderers require the shared module even
when their configured labels use `none`, because their internal builders receive
that renderer at initialization.

Tool-enabled paths fetch two files: activity + loading-label currently total
**14,934 bytes gzip / 13,417 bytes Brotli**. For comparison, the October 2026 build
before disclosure motion totaled 12,756 / 11,453 after the loading-label split,
and 11,185 / 10,075 before that split. The current activity file includes the
opt-in disclosure implementation even when motion is configured as instant.
Separate compression, injection adapters, and stateless style/provenance helpers
also contribute to the two-file cost; loading animation implementations and
handle state are not duplicated. Artifact UI receives the same runtime:
artifacts + loading-label currently total **23,475 bytes gzip / 21,171 bytes
Brotli**, unchanged by disclosure motion (20,881 / 18,842 before the label split).
If tool or waiting UI already prepared the runtime, artifacts reuse that download.
Artifact animation settings remain independent of `loadingLabel`.

The named internal `LoadingLabelRuntime` contract supplies fresh-label rendering,
per-widget lifecycle creation, and builtin artifact effects. Activity/artifact
transport entries receive it through their initialization contracts; direct
internal builders must initialize those dependencies too. This is an internal
replacement boundary, with no public provider-registration API. There are no
static module imports between these three chunks: failed dependencies can retry
independently, concurrent requests share the core loader, and CDN URL version
queries remain intact. Handles are initialized once per widget and automatic
collapse updates the affected bubble without rerendering the transcript.

Renderer chunks are separate files, but the configured UI now waits for them
before display. The initial preparation includes composer controls, markdown
parsers, the icon registry, enabled tool/reasoning/turn rendering, enabled dictation,
and configured artifact/mention/history UI. Session voice configurations also
prepare their provider module, without starting capture or connecting a call.
These bytes count toward the complete widget's initial download, not savings
from deferral. For example, core + widget CSS + markdown + icons + composer
controls + loading labels + dictation total **235.70 kB gzip / 191.71 KiB Brotli**
for an animated text-only configuration. Enabling tools/reasoning adds activity,
bringing the subtotal to **247.93 kB gzip / 202.45 KiB Brotli**. Enabling artifacts
as well brings that subtotal to **268.70 kB gzip / 220.79 KiB Brotli**. Before the
October loading-label split and disclosure motion, the corresponding tool and
artifact subtotals were 243.76 kB / 198.95 KiB and 264.64 kB / 217.35 KiB.
The opt-in turn view requires the activity builders even when tools/reasoning are hidden. Adding its separately compressed chunk to the tool subtotal gives **250.30 kB gzip / 204.50 KiB Brotli**.
These are sums of separately compressed files, excluding installer/launcher,
request handling, history, and any other configured features; they are not a
measurement of the complete network transfer. Diagnostics, background work, and request handling retain their
separate triggers above.

`controller.ready` resolves after module preparation, style installation, and
rendering. The synchronous controller API remains available during preparation.
A deferred script-tag install keeps its critical launcher until the full UI is
ready. An update that needs a new renderer retains the existing UI while that
renderer loads. Failed preparation rejects `ready`; `update({})` retries missing
modules, and the installer retains its launcher for a click to retry. Destroying
the widget cancels its readiness wait, without cancelling shared module downloads.

The script installer shows a small loading ring after 300ms when an embedded
widget (`launcher.enabled: false`) or a clicked deferred launcher is still
loading. Fast loads never insert the indicator. It uses absolute positioning
without replacing content, respects reduced motion, and clears on success or
failure. This feedback lives in the installer so it can appear before the main
bundle or stylesheet arrives; direct SDK hosts can provide their own loading
surface while awaiting `controller.ready`.
The optional installer `renderLoading` hook replaces the ring's appearance while
retaining its timing and lifecycle, without adding runtime code to the main bundle.

The preparation selector is separate from the rendering barrier and reuses the
existing cached chunk loaders. It is an internal foundation, not a new public
renderer replacement API. External assets fetched by custom renderers are not
part of this barrier.

Artifact styles travel with `artifacts-ui.js`; menu, model-picker, and mode-chip
styles travel with the composer controls. Renderers install them in the owning
document or shadow root, including after a host move. Shadow roots also wait for the cloned widget
stylesheet before reveal. Stateful icon registries,
tooltip behavior, and core helpers are injected where needed to avoid duplicate
copies with independent state.

The CDN build resolves chunks beside its script URL. Package consumers resolve
external lazy subpaths through the exports map. Request handling stays bundled
in the npm entries, while the CDN entry defers it. Public method signatures are
unchanged. Loaders share pending requests and retry rejected imports; widgets
ignore results that arrive after teardown or a superseding operation.

## Verification

```sh
pnpm build:widget
pnpm --filter @runtypelabs/persona size
pnpm --filter @runtypelabs/persona test:run
pnpm exec playwright test --config e2e/playwright.dist.config.ts
```

The build runs groups of entry points in separate processes so completed
Rolldown module graphs are released without increasing Node's heap limit.

The optional whole-turn activity view has its own `turn-activity-ui.js` chunk,
loaded only for `turnActivity.enabled`. It measures 2,369 bytes gzip / 2,102 bytes Brotli. Its gzip ceiling is 2.5 kB: it composes the
already loaded activity builders and contains only explicit-metadata grouping and
run ownership. It bundles no markdown parser, tool renderer, or icon registry.
The existing core, activity, and stylesheet ceilings are unchanged.
