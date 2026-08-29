---
"@runtypelabs/persona": minor
---

Add `features.reasoningDisplay.completedVisibility: "removed-when-short"` to drop a completed reasoning row only when the trace was short (configurable via `shortThinkThreshold`), and add `features.toolCallDisplay.completedVisibility: "kept" | "removed"` so a completed tool-call row can disappear entirely, matching the existing reasoning removal behavior.
