---
"@runtypelabs/persona": patch
---

Fix overlapping line numbers in the artifact source view: an empty source line rendered as a zero-height block, painting its gutter number on top of the next line's. Empty lines now reserve one line box.
