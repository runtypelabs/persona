---
"@runtypelabs/persona": minor
---

Add composer spacing and typography theme tokens. `theme.components.composer` now accepts `padding`, `gap`, `fontSize`, and `lineHeight` alongside the existing `shadow`, exposed as `--persona-composer-padding`, `--persona-composer-gap`, `--persona-composer-font-size`, and `--persona-composer-line-height`. The composer form's inset, the space between its textarea row and actions row, and the textarea type scale were previously hardcoded utility classes. Defaults are unchanged (`0.75rem 1rem`, `0.5rem`, `0.875rem`, `1.25rem`); the composer-bar pill keeps its own single-row padding and gap.
