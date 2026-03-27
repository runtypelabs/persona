---
'@runtypelabs/persona': patch
---

feat: add partId-based message segmentation for tool call interleaving

When `partId` is provided in `parseSSEEvent` results and changes between text deltas, the current assistant message is sealed and a new one is created. This produces chronological interleaving of text and tool call bubbles during agent execution. Backward compatible — absent `partId` preserves single-message behavior.
