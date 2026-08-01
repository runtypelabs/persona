---
"@runtypelabs/persona": patch
---

Composer auto-resize now caps the textarea at 3 lines of the rendered line height instead of a hardcoded 20px, so a themed `theme.components.composer.lineHeight` no longer clips the input below 3 visible lines. Post-construction max-height overrides (pill composer) still win.
