---
"@runtypelabs/persona": minor
---

WebMCP: complete the local-tool `/resume` round-trip in client-token mode. `resumeFlow` now posts to `POST /v1/client/resume` (the session-authenticated route from runtypelabs/core#3889) with the active `sessionId` in the body and no Bearer key when the widget runs in client-token mode; dispatch/proxy mode is unchanged (`${apiUrl}/resume`). Previously a client-token (browser) page could register and dispatch WebMCP tools but had no endpoint to post tool outputs back, so paused local-tool turns hung unless routed through a proxy.
