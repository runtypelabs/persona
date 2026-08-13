---
"@runtypelabs/persona": patch
---

Add `features.history.rail.collapsedBehavior: "overlay"`, a second shape for the collapsed Messages rail. Instead of the 52px icon column, the rail leaves a trigger at the leading edge of the conversation header (wearing `rail.brand` at rest and the sidebar glyph on hover or keyboard focus), floats the expanded rail over the conversation after a short hover dwell, and pins it into the full-height column on click. The floating rail is transient: leaving it, Escape, a click outside, or selecting a conversation all dismiss it, while its own header toggle docks it and collapses it again once docked. A collapsed rail restored this way renders the trigger alone, so the lazy history chunk is not fetched until the first hover or focus warms it. Default stays `"icon-rail"`, so existing rails are unchanged.
