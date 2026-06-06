---
"@runtypelabs/persona": patch
---

Refresh the client session before resuming a paused flow in client-token mode. A WebMCP local-tool approval can sit awaiting user input long enough for the session to expire; `resumeFlow` now awaits `initSession()` (which returns the live session while valid, else re-inits) and threads the refreshed `sessionId` to `POST /v1/client/resume`, instead of trusting a possibly-stale cached session.
