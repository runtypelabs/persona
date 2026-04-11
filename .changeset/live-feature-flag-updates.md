---
"@runtypelabs/persona": patch
---

Re-render messages when feature display flags change via `controller.update()` so toggling `showReasoning`, `showToolCalls`, `toolCallDisplay`, or `reasoningDisplay` takes effect without a full remount
