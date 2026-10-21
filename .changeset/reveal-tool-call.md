---
"@runtypelabs/persona": minor
---

Add `controller.revealToolCall(toolCallId, { expand?, highlightMs? })`, which opens any collapsed group holding a tool call, expands its details, centers it in the transcript and briefly marks it with `data-persona-revealed`. Tool bubbles now carry their tool call id as `data-tool-call-id`, so hosts can map transcript clicks back to their own records without observing the DOM.

Reveal highlights survive streaming updates for their configured duration, and revealing the same tool again restarts the highlight timer.

Revealing keeps automatic following paused even when centering reaches the bottom, and a newer reveal cancels any pending centering from the previous call.

Reader input cancels reveal scrolling and its pending centering pass without removing the highlight.
