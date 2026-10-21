---
"@runtypelabs/persona": minor
---

Add `controller.revealToolCall(toolCallId, { expand?, highlightMs? })`, which opens any collapsed group holding a tool call, expands its details, centers it in the transcript and briefly marks it with `data-persona-revealed`. Tool bubbles now carry their tool call id as `data-tool-call-id`, so hosts can map transcript clicks back to their own records without observing the DOM.
