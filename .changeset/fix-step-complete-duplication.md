---
"@runtypelabs/persona": patch
---

Fix duplicate assistant message bubbles when `step_complete` follows `text_end`. The `step_complete` handler now skips recreating a message with the full response when `text_end` has already sealed the streamed content, preventing identical text from rendering twice.
