---
"@runtypelabs/persona": patch
---

Fix the `inline` message timestamp position rendering on its own line (identical to `below`). The inline timestamp was a block-level `<div>` that relied on a `persona-inline` class absent from the stylesheet, and even once tucked into the message text it was invalid markup (`<div>` inside `<p>`) that got re-parented onto its own line on every re-render. Inline timestamps now render as an inline `<span>` (`persona-timestamp-inline`, `display: inline-block`) tucked into the last content block, so they trail the final line of the message and survive re-renders — making `layout.messages.timestamp.position: "inline"` visually distinct from `"below"`.
