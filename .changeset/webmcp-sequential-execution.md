---
"@runtypelabs/persona": patch
---

Add `webmcp.execution: "parallel" | "sequential"`. When a turn emits several `webmcp:*` tool calls at once, the widget ran them all concurrently, which interleaves page tools that share mutable state (the Paint demo's strokes each select a tool and color before drawing). `"sequential"` runs the batch one at a time in emission order, waiting for each call to settle (approval included) before starting the next; outputs still return in a single `/resume`. The default stays `"parallel"`.
