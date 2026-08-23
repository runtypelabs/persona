---
"@runtypelabs/persona": minor
---

Bundle size program: the CDN bundle drops from 191.7 to 161.8 kB gzip (-16%), the critical launcher from 18.9 to 16.4 kB (-13%), and npm's ESM bundle from ~191.5 to ~173.5 kB — with the npm public API surface unchanged. The markdown-parsers chunk (~21.8 kB gzip) additionally no longer downloads at page load for visitors who never open the launcher.

Lazy sibling chunks (fetched on demand from next to `index.global.js`):

- `animations-extra.js` — wipe + glyph-cycle stream animations, fetched when `features.streamAnimation.type` selects one (npm `animations/*` subpaths unchanged).
- `approval-ui.js` — approval bubble + built-in approval plugin + plugin-kit, fetched when the first approval message arrives.
- `session-reconnect.js` — the durable-session reconnect loop (its old dynamic import was silently inlined), fetched when a `reconnectStream` session first resumes.
- `webmcp-runtime.js` — the WebMcpBridge class, fetched when `webmcp.enabled` is true. npm keeps the one-argument `WebMcpBridge` constructor.
- `icons-extra.js` — the config-only tail of the icon registry (63 names). Core keeps the 55 names the widget itself emits plus all config defaults, so nothing the widget renders by default ever waits; an extra-tier configured icon paints a correctly-sized placeholder and fills within one round-trip (both the widget and the launcher register loaders for it). New public `registerIcons()` extends the registry with custom icons; bundled npm consumers keep the historical all-sync `renderLucideIcon` contract.
- `artifacts-ui.js` — the artifact pane, inline/card transcript components, and preview renderer (the largest single cut, -13.2 kB). The split-root layout skeleton still builds synchronously; the pane grafts at chunk adoption, and artifact directives that render mid-flight heal into real blocks.
- `voice-runtime.js` — the voice provider factory + Runtype/browser providers + audio playback manager, prefetched when a voice provider is configured. `setupVoice` keeps its synchronous signature; `toggleVoice` awaits an in-flight setup.
- `forms-ui.js` — the `[data-tv-form]` demo-forms enhancement, fetched when a rendered bubble first contains a form placeholder. While the chunk is in flight the placeholder stays the bare div the postprocessor emitted, then heals into the real form when it lands.
- The event-stream capture runtime (buffer, IndexedDB store, throughput tracker) rides the existing `event-stream-view.js` chunk, and the icon registry is no longer duplicated into the event-stream and context-mentions chunks.

Markdown parsers now warm on first panel visibility instead of at script evaluation (renders that beat the chunk self-heal), and statically-known icons throughout the widget use tree-shaken per-icon lucide data imports.

CDN-global-only surface narrowing (following the existing dev-helpers precedent; npm exports unchanged): `window.AgentWidget` no longer exposes the mention-source helpers (`createStaticMentionSource`, `createSlashCommandsSource`, `defaultMentionFilter`), the `WebMcpBridge` class, or the voice factory values (`createVoiceProvider`, `createBestAvailableVoiceProvider`, `isVoiceSupported`) — script-tag integrations configure these features via config; no shipped demo used them via the global.

Self-hosted deployments that copy `dist/` wholesale get all new chunks automatically; deployments that cherry-pick files should ship every `*.js` sibling next to `index.global.js` (and `icons-extra.js` next to `launcher.global.js`).
