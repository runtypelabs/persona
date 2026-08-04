---
"@runtypelabs/persona": minor
---

Move minimal-header `trailingActions` from beside the title to the trailing edge, clustered with the close button. The buttons now share the close button's chrome (32px round hit area, hover fill) and use the header zone's action-icon color token instead of the muted body-text token, so they stay visible on themed headers. Action dropdown menus now open right-aligned to match the new position. Use `titleMenu` for a menu affordance next to the title.
