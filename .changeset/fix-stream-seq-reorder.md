---
"@runtypelabs/persona": patch
---

Fix streaming UI freezing when SSE events arrive out of order

`step_delta` and `reason_delta` events can arrive with out-of-order `seq`/`sequenceIndex` values. Previously, text chunks were appended in arrival order, producing garbled content that broke markdown rendering and caused the streaming UI to appear frozen mid-response. Added a sequence-aware reorder buffer that accumulates chunks and rebuilds the full text in correct server-intended order.
