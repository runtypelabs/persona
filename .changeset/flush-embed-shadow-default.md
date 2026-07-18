---
"@runtypelabs/persona": minor
---

Flush inline embeds (`launcher.enabled: false` without `detachedPanel`) no longer render the default `palette.shadows.xl` panel shadow. The shadow was almost always clipped invisible by the embed's own overflow container, so this mostly formalizes existing rendering; hosts that did see it can restore it with `theme.components.panel.shadow`. Floating panels and detached cards keep their elevation defaults.
