---
"@runtypelabs/persona": minor
---

Raise default widget z-index from 50/9999 to 100000 across all modes (floating
panel, launcher button, sidebar, mobile fullscreen, docked mobile fullscreen).

Elevate the host element's stacking context in viewport-covering modes so the
overlay escapes parent stacking traps.

Lock document scroll when the widget is open in viewport-covering modes (iOS-safe,
ref-counted, auto-teardown on destroy).

Add overscroll-behavior: contain on the messages body.
