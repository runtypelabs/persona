---
"@runtypelabs/persona": minor
---

Add opt-in `events: 'unified'` support. When set, the widget requests the API's neutral unified SSE vocabulary (`?events=unified` on dispatch and `/resume`) and bridges each frame back onto the existing event handlers, so rendering is unchanged. Defaults to `'legacy'`; the wire mode is auto-detected from the first stream frame, so an upstream that doesn't support the param falls back to legacy automatically. Also exposed as a top-level `events` option on the script-tag installer.
