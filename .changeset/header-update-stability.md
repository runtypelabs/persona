---
"@runtypelabs/persona": patch
---

Fix two header regressions triggered by any live `update()` call: the close button was revealed on non-closeable panels (an unset `layout.header.showCloseButton` was treated as "show" instead of deferring to panel toggleability), and the clear-chat icon boldened because the update path re-rendered it with stroke width 2 while the mount-time builder uses 1.
