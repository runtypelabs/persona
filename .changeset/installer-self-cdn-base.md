---
"@runtypelabs/persona": minor
---

The script-tag installer now loads its sibling assets (`widget.css`, `index.global.js`, `launcher.global.js`, `markdown-parsers.js`) from the directory it was itself served from, instead of always from jsDelivr. Self-hosted and first-party CDN installs (e.g. `cdn.runtype.com`) now work under a strict CSP with no extra config, and npm-CDN installs pinned to a range (`@4`) no longer skew siblings to `@latest`. Explicit `cdn` / `version` options keep the documented npm-CDN behavior, and jsDelivr `@latest` remains the fallback when the installer's own URL can't be determined. Also: `generateCodeSnippet()` accepts a new `cdnBase` option so generated script snippets can point at a first-party CDN, and `cdn: "unpkg"` now produces correct unpkg URLs (they previously 404'd due to a stray `/npm/` path prefix).
