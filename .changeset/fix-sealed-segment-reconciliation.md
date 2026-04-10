---
"@runtypelabs/persona": patch
---

Fix assistant streaming when `text_end` precedes `step_complete`: prevent duplicate bubbles, reconcile the authoritative final response into sealed segments when async parsers lag, and ensure `step_delta` callbacks update the correct message object via closure capture instead of the cleared `assistantMessage` ref.
