---
"@runtypelabs/persona": patch
---

Shrink the CDN bundle (`index.global.js`) by 10.6 KiB Brotli (156.3 → 145.7 KiB; 195.6 → 184.8 kB gzip) with no behavior change. The `*.global.js` bundles get a second terser minification pass (frequency-ordered identifier mangling compresses better), TypeScript `private` class members are now native `#private` fields so their names minify too, and the history confirm dialog now loads with the lazy `history-view.js` chunk. Build output now targets ES2022 (native private fields: Chrome 84+, Firefox 90+, Safari 15+).
