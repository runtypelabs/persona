---
"@runtypelabs/persona": patch
---

Follow-ups to the docked `reveal: 'push'` margin-offset fix (#287): reset the push track's `marginLeft` when entering mobile fullscreen so a stale desktop push offset can't shift the full-width track off-screen, and document that `position: fixed`/`sticky` content inside the wrapped target stays viewport-anchored (offset it with `[data-persona-dock-open="true"]` while the dock is open). Docs updated in README, THEME-CONFIG, and CONFIGURATION-REFERENCE to describe push sliding via margin rather than transform.
