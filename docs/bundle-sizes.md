# Bundle sizes and loading boundaries

The size checks retain the existing limits. `packages/widget/.size-limit.json`
measures gzip in decimal kB; `scripts/check-size.mjs` measures Brotli quality 11
in binary KiB. The original Brotli ceilings are 131 KiB for the CDN widget,
20 KiB for its stylesheet, and less than 20 KiB for the deferred launcher.

Measurements from the October 2026 composer optimization and renderer-readiness build:

| File | Gzip kB | Existing limit kB |
| --- | ---: | ---: |
| `index.global.js` | 164.95 | 166 |
| `launcher.global.js` | 17.53 | 19.75 |
| `widget.css` | 22.96 | 24 |
| `install.global.js` | 2.99 | 3 |
| `index.js` | 203.80 | 215.75 |
| `index.cjs` | 203.54 | 216.75 |
| `theme-editor.js` | 40.34 | 40.5 |
| `voice-runtime.js` | 13.48 | 14 |
| `history-shell.js` | 13.63 | 13.75 |

The CDN widget is 130.99 KiB Brotli. Its remaining headroom is small: run both
size checks when changing core code. These are per-file budgets, not a claim
that the complete interaction downloads only the core file.

## Separately loaded code

Each new chunk has an explicit gzip budget in the same size-limit file.

| Chunk | Gzip kB | Loaded when |
| --- | ---: | --- |
| `composer-actions-runtime.js` | 15.24 | Before the widget is revealed; also supplies approval popover helpers |
| `activity-ui.js` | 11.80 | Before reveal when tool or reasoning messages are enabled |
| `dictation-runtime.js` | 4.65 | Before reveal when voice recognition is enabled |
| `client-dispatch.js` | 5.22 | The CDN client initializes a session, sends a message, or submits feedback |
| `config-diagnostics.js` | 1.60 | Debug migration diagnostics are enabled |
| `background-runtime.js` | 0.67 | Background conversation work is enabled |
| `preferences-runtime.js` | 1.91 | The theme editor applies a preset with behavior preferences |

Renderer chunks are separate files, but the configured UI now waits for them
before display. The initial preparation includes composer controls, markdown
parsers, the icon registry, enabled tool/reasoning rendering, enabled dictation,
and configured artifact/mention/history UI. Session voice configurations also
prepare their provider module, without starting capture or connecting a call.
These bytes count toward the complete widget's initial download, not savings
from deferral. For example, core + widget CSS + markdown + icons + composer
controls + activity + dictation total **244.35 kB gzip / 199.51 KiB Brotli**.
Enabling artifacts brings that subtotal to **265.14 kB gzip / 217.85 KiB Brotli**.
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
