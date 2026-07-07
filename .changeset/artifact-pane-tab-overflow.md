---
"@runtypelabs/persona": patch
---

Fix artifact pane tabs overflowing the panel: the tab strip now scrolls horizontally (the `persona-overflow-x-auto`/`persona-shrink-0` utility rules were missing), tabs stay on one line and truncate with an ellipsis, file tabs are labelled by basename with the full path in a tooltip, and the selected tab is scrolled into view when the selection changes.
