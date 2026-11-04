---
"@runtypelabs/persona": patch
---

Remove the model picker's and overflow menu's own theme-token forwarding. Both menus are popovers, and popovers mounted outside the widget root now carry the root's theme variables and color scheme themselves, so the per-menu copy of their tokens on every open was redundant.
