---
"@runtypelabs/persona": patch
---

Fix two WebSocket transport cases.

- A reply handed to the socket that is lost before its first frame is now read over HTTP from its start, instead of ending with no reply.
- A tab that is showing another tab's turn no longer repeats earlier reply text when its socket reconnects while that turn is paused.
