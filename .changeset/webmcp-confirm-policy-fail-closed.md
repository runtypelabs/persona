---
"@runtypelabs/persona": patch
---

Fail closed on the WebMCP `requireConfirmFor` surface policy. In client-token mode, a page tool call made before the surface policy has loaded now always asks for confirmation, and the last loaded policy survives `clearClientSession()`, so a session cleared mid-call can no longer drop it.
