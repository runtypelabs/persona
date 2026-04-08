---
"@runtypelabs/persona": minor
---

Render assistant text and tool calls in chronological order instead of lumping all text before tools. The widget now handles `text_start`/`text_end` lifecycle events and `partId` on `step_delta` to split assistant messages at tool boundaries, matching the segmentation the Runtype API already emits.
