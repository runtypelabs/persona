---
"@runtypelabs/persona": patch
---

Fix the artifact view/source toggle losing its selected-state highlight when a theme sets `toggleGroupGap` or `toggleGroupPadding` to a unitless `0`: the value is now coerced to `0px` before it reaches the selection thumb's width `calc()`, which treats a bare number as invalid length math and collapsed the thumb to zero width. Also adds `documentToolbarToggleActiveColor` so themes can brighten the active segment's icon (defaults to `documentToolbarIconColor`).
