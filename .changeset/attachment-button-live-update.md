---
"@runtypelabs/persona": patch
---

Fix the attachment button ignoring live `update()` changes: `buttonIconName` and `buttonTooltipText` were rendered once when the button was created and never re-applied, so updating them at runtime had no effect until a re-mount. The icon, tooltip, and aria-label are now re-rendered from the merged config on every update.
