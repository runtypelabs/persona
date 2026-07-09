---
"@runtypelabs/persona": patch
---

Fix first-render markdown race for content rendered before the lazy `markdown-parsers.js` chunk loads (IIFE/CDN build). Both chat messages and the artifact pane now self-heal through a single shared `onMarkdownParsersReady` registry instead of each render surface wiring its own parser-ready re-render, so an artifact upserted right after `initAgentWidget()` no longer renders as escaped plain text (or double-escaped entities) until a tab switch. Exposes `loadMarkdownParsers` / `onMarkdownParsersReady` on the public API as a host escape hatch.
