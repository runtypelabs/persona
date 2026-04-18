---
"@runtypelabs/persona": patch
---

Hoist drainReadyQueue closure out of the per-event loop so it is created once instead of on every SSE event.
