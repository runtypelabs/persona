---
"@runtypelabs/persona": patch
---

Add `features.history.rail.resizable` (default false), a drag handle on the docked Messages rail's divider edge. Dragging resizes the rail live within the same 200 to 400 clamp `width` takes, and the handle is a keyboard `separator` too: arrow keys step it by 16px, Home and End jump to the bounds, and it carries `aria-valuenow` throughout. The chosen width is remembered per visitor alongside the other `persistState` keys, outranks a later `width` update the way the collapsed state does, and is inherited by the floating overlay rail, which is never itself resizable. A collapsed icon column ignores resizing until it expands again. Copy override: `features.history.copy.resizeLabel`.
