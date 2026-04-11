---
'@runtypelabs/persona': patch
---

Refactor stream reorder to event-level SequenceReorderBuffer

Replace per-type chunk buffers (seqChunkBuffers, reasonSeqBuffers, insertSeqChunk) with a single SequenceReorderBuffer that reorders all SSE events by seq before dispatch. This is simpler, covers all event types, and avoids the memory leak class of bugs that required a follow-up fix.
