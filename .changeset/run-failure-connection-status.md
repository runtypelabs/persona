---
"@runtypelabs/persona": patch
---

Show terminal execution failures in the transcript while keeping the connection indicator online. Preserve error callbacks, failed run outcomes, and reconnect cleanup. Hosts that render their own failure notice can set `executionErrorDisplay: "host"` to prevent duplicate messages.
