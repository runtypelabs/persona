---
"@runtypelabs/persona": patch
---

Fix composer popovers painting the light fallbacks in a dark widget. The `@` mention menu, the popover model picker, the overflow `+` menu and the approval "Allow once" menu mount on `document.body` (or the shadow root), outside `[data-persona-root]`, so they missed the theme variables and color scheme set on the widget root and rendered white with dark text. `createPopover` now copies the root's theme variables and `data-persona-color-scheme` / `data-persona-defaults` onto content it mounts outside the root, and keeps them current while the popover is open, so a live `controller.update()` of the theme or color scheme reaches an open menu too.
