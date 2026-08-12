---
"@runtypelabs/persona": patch
---

Header icon buttons (close, clear chat, trailing actions, Messages) now share one control chrome sized by `theme.components.header.controlSize` / `controlIconSize` tokens (defaults 40px/24px) with per-control config overrides unchanged; fixes vertical misalignment of the minimal layout close button and unifies icon sizes/stroke weights. Glyph stroke weight is now themeable too via `theme.components.header.controlStrokeWidth` (unitless, default `1.5`, scaled by 0.7 for sparse glyphs such as the close X), and all three control knobs are exposed as live theme-editor fields.
