---
"@runtypelabs/persona": patch
---

Fix header layout shift when `showHistory()` docks an overlay rail on page load. While the lazy history chunk loads, the widget now takes the docked geometry up front: the collapsed-rail trigger no longer paints at the header's leading edge (the sidebar glyph used to flash on the left, then jump to the mounted rail's own collapse toggle), and the rail column's space is reserved by a placeholder shell (the conversation header used to paint at the widget edge and get pushed over when the rail landed). When the chunk arrives, the view takes the placeholder's slot in the same shell with no reflow; if it fails to load, the trigger and the borrowed column are restored.
