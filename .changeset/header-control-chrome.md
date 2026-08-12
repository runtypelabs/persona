---
"@runtypelabs/persona": patch
---

Header icon buttons (close, clear chat, trailing actions, Messages) now share one control chrome sized by `theme.components.header.controlSize` / `controlIconSize` tokens (defaults 40px/24px) with per-control config overrides unchanged; fixes vertical misalignment of the minimal layout close button and unifies icon sizes/stroke weights.
