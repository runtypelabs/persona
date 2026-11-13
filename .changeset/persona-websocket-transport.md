---
"@runtypelabs/persona": minor
---

Add a stream transport seam and an optional WebSocket transport.

- `config.transport` routes every streaming request (send, resume, approval, durable reconnect) through a `PersonaTransport`; without one the widget uses HTTP + SSE as before.
- `createWebSocketTransport` (lazy `@runtypelabs/persona/websocket-transport` chunk, `AgentWidget.loadWebSocketTransport()` on the CDN build) adapts any WebSocket backend through a codec.
- In client-token mode the widget uses the Runtype client-session socket (`runtype-client-session-v1`) when `/v1/client/init` advertises it: connects on intent, renders turns from other tabs, and falls back to SSE on any socket failure. `realtime: false` opts out. `realtime.connect` sets when the socket connects (`'load'`, `'open'`, `'focus'` by default, `'input'`, or a hook); when `realtime` is set explicitly, the trigger also starts the client session.
- A WebMCP page tool that navigates the page is answered on the next page instead of running twice, a turn that pauses on a tool before any text is now recoverable after a reload, and a bfcache restore reattaches from the in-memory cursor.
