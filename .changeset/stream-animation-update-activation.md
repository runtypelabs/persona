---
"@runtypelabs/persona": patch
---

Fix `controller.update()` not activating plugin-based stream animations. Built-in animations applied live (they carry their CSS in the widget stylesheet), but plugin animations (`wipe`, `glyph-cycle`, and custom plugins registered via `registerStreamAnimationPlugin`) inject their styles through `ensurePluginActive`, which only ran at mount. Switching to a plugin animation via `update()` now injects its CSS so it renders, matching the initial-mount behavior. The call is idempotent, so re-selecting an already-active plugin is a no-op.
