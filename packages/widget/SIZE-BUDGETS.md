# Widget bundle budgets

`pnpm --filter @runtypelabs/persona size` enforces gzip budgets in
`.size-limit.json`. `pnpm build:widget` also enforces the Brotli budgets in
`scripts/check-size.mjs`. Both checks must pass; they measure different encodings.

## Opt-in V5 preview

The preview ships both defaults tables, theme tokens, activity rendering, and
Request/Response styles. The flag controls behavior, not which code is downloaded.
The gzip limits below account for that additional functionality. Unaffected
entry points keep their existing limits. The Brotli limits are 147 KiB for the
browser bundle, strictly below 20 KiB for the launcher, and 20 KiB for CSS.

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
