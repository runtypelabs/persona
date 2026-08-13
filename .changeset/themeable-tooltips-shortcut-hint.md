---
"@runtypelabs/persona": patch
---

Make control tooltips themeable and give them a shortcut hint chip. A new `components.tooltip` token group sets background, foreground, hint foreground, radius, font size, padding, shadow, max width, and whether the arrow renders; unset tokens keep the current look exactly. The tooltip portals outside the mount that carries the theme variables, so it now copies the anchor's resolved values onto itself each time it opens. Tooltips can also carry a muted trailing hint, plumbed through header icon buttons as `tooltipHint`.
