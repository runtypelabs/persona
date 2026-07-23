---
"@runtypelabs/persona": patch
---

Fix the attachment drop overlay ignoring live `update()` changes: the overlay was built once at mount and never rebuilt, so `attachments.dropOverlay` values (background, icon, label, border, blur, inset) applied through `update()` had no effect until a re-mount. The overlay is now rebuilt from the merged config on every update.
