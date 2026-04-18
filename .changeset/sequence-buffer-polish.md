---
"@runtypelabs/persona": patch
---

Polish the event-level sequence reorder refactor: drop the unused `SequenceReorderBuffer.reset()` method (and its tests), document why both the synchronous and microtask drain paths on the dispatch side are intentional, and clean up a few cosmetic leftovers from the refactor (loop counter name, indentation, an unused local).
