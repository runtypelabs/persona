---
"@runtypelabs/persona": patch
---

Fix `transcript_insert` SSE messages omitting `variant`: stop defaulting to `"assistant"`, which prevented component-directive rendering for messages with JSON `rawContent`.
