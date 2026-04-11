---
"@runtypelabs/persona": patch
---

Fix memory leak where reasonSeqBuffers was not cleaned up when reason_delta completed via done:true without a separate reason_complete event.
