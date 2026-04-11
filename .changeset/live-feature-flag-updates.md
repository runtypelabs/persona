---
"@runtypelabs/persona": minor
---

Add `expandable` option to `toolCallDisplay` and `reasoningDisplay` feature configs. When set to `false`, tool call and reasoning bubbles show only their collapsed summary with no expand/collapse toggle, giving users tool awareness without exposing full details. Also re-render messages when feature display flags change via `controller.update()` so toggling display settings takes effect without a full remount, and fix collapsed preview padding showing on non-active bubbles after expand/collapse.
