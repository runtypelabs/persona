---
"@runtypelabs/persona": minor
"@runtypelabs/persona-proxy": patch
---

Update dependencies, including `marked` 18, `idiomorph` 0.8, `dompurify` 3.4.17, `lucide` 1.70, and `hono` 4.13.

Markdown now follows `marked` 18's parsing. Most output is unchanged apart from whitespace, but a lone `- ` renders as an empty list item, image alt text is plain text, and numeric entities such as `&#60;` are normalized. `markdown.renderer` overrides keep their token shape and escaping. The one change is that a heading's `raw` keeps entities instead of dropping them, so `a & b` is no longer `a  b`.

Both `marked` and `idiomorph` are now ESM-only upstream, so the CommonJS build inlines them. `require("@runtypelabs/persona")` keeps working on every supported Node version.

Tests that mount the widget in jsdom need a `CSS.escape` stub, which `idiomorph` now calls and jsdom does not provide.
