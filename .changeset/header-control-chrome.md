---
"@runtypelabs/persona": patch
---

Header icon buttons (close, clear chat, trailing actions, Messages) now share one control chrome sized by `theme.components.header.controlSize` / `controlIconSize` tokens (defaults 32px/20px, matching the sizes previous releases rendered so upgrades see no visual change) with per-control config overrides unchanged; fixes vertical misalignment of the minimal layout close button and unifies icon sizes/stroke weights. Glyph stroke weight is now themeable too via `theme.components.header.controlStrokeWidth` (unitless, default `1.5`, scaled by 0.7 for sparse glyphs such as the close X), and all three control knobs are exposed as live theme-editor fields. Every header control now carries the same styled tooltip, reading its live accessible label; previously only close and clear chat had one. The Messages bar's back and new conversation controls join in, borrowing the shell's tooltip module so the lazy chunk stays lean.
