---
"@runtypelabs/persona": patch
---

SSE sequence reordering: refactor stream reorder to an event-level `SequenceReorderBuffer`, replacing per-type chunk buffers (`seqChunkBuffers`, `reasonSeqBuffers`, `insertSeqChunk`) with one buffer that reorders all SSE events by `seq` before dispatch—simpler, covers every event type, and avoids the memory-leak class of bugs that motivated follow-up fixes.

Harden the buffer for edge cases: end-of-stream flush (events waiting on a missing `seq` are no longer dropped when the stream closes; they run through the normal handler before return) and duplicate `seq` handling (earlier event is emitted instead of overwritten, with `console.warn`).

Repair late-arriving sequenced chunks after reorder-buffer gap flushes so streamed text stays in server order, including `reason_delta` after gap-timeout flush.

Hoist the `drainReadyQueue` closure out of the per-event loop so it is created once instead of on every SSE event.

Polish: remove unused `SequenceReorderBuffer.reset()` (and tests), document why both synchronous and microtask drain paths on the dispatch side are intentional, and small cleanups (naming, indentation, unused local).

Message actions: improve vote button feedback (filled icon with pop on vote, outline on un-vote) and simplify the message actions pill (no border, background, or box-shadow).
