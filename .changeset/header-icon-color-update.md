---
"@runtypelabs/persona": patch
---

Fix the header icon color not persisting after runtime config/theme updates. `controller.update()` re-rendered the header Lucide icon with a hardcoded white stroke, overriding the themed `components.header.iconForeground`. The icon now renders with `currentColor` (matching the initial render), so the configured/themed header icon color sticks across updates (including live changes from the theme editor).
