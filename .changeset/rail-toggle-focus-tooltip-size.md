---
"@runtypelabs/persona": patch
---

Fix three defects in the Messages rail's collapse toggle. A pointer or programmatic rail open no longer moves focus onto the toggle, so it stops inheriting a keyboard focus ring that a later click could not clear; only a keyboard-initiated open focuses the rail, and the panel still takes focus unconditionally. Tooltips now close when their control is activated instead of re-showing mid-animation at a stale position, and the next hover or keyboard focus reopens them with the label the control now has. The rail's toggle is 36px to match the rows beside it, with a 44px target restored under a coarse pointer.
