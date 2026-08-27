---
"@runtypelabs/persona": minor
---

Add `chipVisibility` to `composer.modeGroups` entries: `"auto"` (default) keeps one removable chip per active mode, `"hidden"` suppresses the chips for that group whatever its presentation. It reuses the same chip-eligibility pathway that already suppresses chips for a `"segmented"` group, so a group drawn as pressed bar buttons can now carry its state on the buttons alone. The chip row is derived from its children, so suppressing every chip in it leaves no empty rail behind.
