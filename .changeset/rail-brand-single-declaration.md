---
"@runtypelabs/persona": patch
---

Add `features.history.rail.brand`, one identity declaration the Messages rail places in both of its spots: beside the view title in the expanded header, and as the collapse toggle's rest face when the rail is a 52px column, where hover and keyboard focus bring the panel glyph back (a coarse pointer keeps the glyph, having no hover to reveal it with). Takes `icon`, `iconUrl` or `render({ collapsed })`, in that precedence. `rail.renderHeader` still outranks it for the header area, and the view's accessible name still comes from `copy.viewTitle`.
