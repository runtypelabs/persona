---
"@runtypelabs/persona": patch
---

Add a keyboard shortcut registry so one declaration drives the binding, the tooltip hint chip, and the control's aria-keyshortcuts. `features.history.rail.collapseShortcut` (with `collapseShortcutScope`) binds the rail collapse toggle, `layout.header.trailingActions[].shortcut` binds a header action, and plugins can contribute their own via `shortcuts`. Combos are written as "mod+b", where mod is Command on Apple platforms and Control elsewhere. Nothing is bound by default, so an embedded widget never claims a host page's keys.
