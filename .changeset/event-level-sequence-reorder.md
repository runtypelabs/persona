---
'@runtypelabs/persona': patch
---

Refactor stream reorder to event-level SequenceReorderBuffer

Replace per-type chunk buffers (seqChunkBuffers, reasonSeqBuffers, insertSeqChunk) with a single SequenceReorderBuffer that reorders all SSE events by seq before dispatch. This is simpler, covers all event types, and avoids the memory leak class of bugs that required a follow-up fix.

Also hardens the buffer against two edge cases:

- **End-of-stream flush**: if the SSE stream closed while events were still held waiting for a missing seq number (e.g. a late `step_error` with `seq > 1`), those events were silently dropped. They are now flushed and drained through the normal event handler before the client returns.
- **Duplicate seq collisions**: if two events ever share a seq number, the earlier one was silently overwritten. The buffer now emits the earlier event (out-of-order, but not lost) and logs a `console.warn` so the invariant violation is visible.
