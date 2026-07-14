---
"@runtypelabs/persona": patch
---

Fix content rendered before the CDN build's lazy markdown-parsers chunk resolves staying as escaped plain text. A shared `onMarkdownParsersReady` registry in the parser loader now gives every markdown surface a single self-heal path: chat messages and artifact previews (pane and inline) re-render once when the chunk lands, instead of each surface wiring its own one-off re-render (the artifact surfaces previously had none and stayed escaped until the next update). The artifact preview also no longer double-escapes the degraded fallback through the sanitizer, and the chat subscription is released on widget teardown. A transient chunk-load failure no longer strands surfaces: waiting subscribers survive the failure, so a later successful retry re-renders them too. `loadMarkdownParsers` and `onMarkdownParsersReady` are exported from the public API so hosts that inject content right after init can await or subscribe to parser readiness.
