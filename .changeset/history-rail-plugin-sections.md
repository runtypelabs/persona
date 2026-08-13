---
"@runtypelabs/persona": patch
---

Let plugins contribute history rail sections with custom-rendered content through the new `railSections` capability. Sections render only in the rail, after any `features.history.rail.sections` in the same placement bucket, and their render runs again with the new collapsed value whenever the rail collapses or expands.
