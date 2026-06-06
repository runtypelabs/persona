---
"@runtypelabs/persona": patch
---

Minify the subpath build outputs (`theme-editor`, `smart-dom-reader`, `testing`, `animations/*`), which were previously shipped unminified. This cuts `theme-editor.js` from ~1,020 kB to ~538 kB raw (200.8 kB → 143.0 kB gzip) and `smart-dom-reader.js` from ~73 kB to ~37 kB raw, with no API or behavior change.
