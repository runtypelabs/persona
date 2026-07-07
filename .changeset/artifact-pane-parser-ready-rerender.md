---
"@runtypelabs/persona": patch
---

Fix artifacts upserted immediately after init rendering as escaped plain text on the CDN build: the artifact pane now re-renders once the lazy markdown-parsers chunk loads (previously it stayed escaped until a tab switch), and no longer double-escapes the fallback through the sanitizer. Also export `loadMarkdownParsers` from the public API so hosts can await parser readiness before injecting content.
