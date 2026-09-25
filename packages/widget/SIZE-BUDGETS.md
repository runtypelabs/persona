# Widget bundle budgets

`pnpm --filter @runtypelabs/persona size` enforces gzip budgets in
`.size-limit.json`. `pnpm build:widget` also enforces the Brotli budgets in
`scripts/check-size.mjs`. Both checks must pass; they measure different encodings.

## Opt-in V5 preview

The preview ships both defaults tables, theme tokens, activity rendering, and
Request/Response styles. The flag controls behavior, not which code is downloaded.
The gzip limits below account for that additional functionality. Unaffected
entry points keep their existing limits. The Brotli limits remain 156 KiB for the
browser bundle, strictly below 20 KiB for the launcher, and 20 KiB for CSS.

Measured after the preview compatibility fixes (gzip, decimal kB):

| Output | Measured | Budget |
| --- | ---: | ---: |
| `dist/index.global.js` | 192.65 kB | 194 kB |
| `dist/launcher.global.js` | 20.70 kB | 21.25 kB |
| `dist/widget.css` | 23.39 kB | 24 kB |
| `dist/index.js` | 205.34 kB | 207 kB |
| `dist/index.cjs` | 206.23 kB | 208 kB |
| `dist/theme-editor.js` | 39.46 kB | 40.5 kB |
| `dist/theme-editor-preview.js` | 171.94 kB | 174 kB |

These are explicit budgets, not automatically adjusted thresholds. Future growth
should be investigated before changing them. Shared theme code affects the
launcher and editor as well as the main widget; optional behavior still has a
payload cost when it is statically included.

## Live input joining

The joined-input admission queue and composer controls remain synchronous in the
core; receipt transport and polling load from the optional `live-input` chunk.
Compared with a clean build of `main` at `25812447`, joining adds 2.94 kB gzip to
the browser bundle, 3.01 kB to ESM, and 2.96 kB to CJS. The four core-containing
gzip budgets therefore increase by 3 kB from the preview budgets above:

| Output | Measured | Budget |
| --- | ---: | ---: |
| `dist/index.global.js` | 196.34 kB | 197 kB |
| `dist/index.js` | 209.08 kB | 210 kB |
| `dist/index.cjs` | 209.88 kB | 211 kB |
| `dist/theme-editor-preview.js` | 175.61 kB | 177 kB |
| `dist/live-input.js` | 1.31 kB | 2 kB |

The browser Brotli size rises from 154.42 KiB to 156.64 KiB; its budget increases
from 156 KiB to 158 KiB. Launcher and stylesheet budgets remain unchanged.
