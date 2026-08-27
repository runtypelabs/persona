---
"@runtypelabs/persona": minor
---

Theme the model picker's closed control. `components.composer.modelPicker` gains `background`, `hoverBackground`, `borderColor`, and `borderRadius`, and `labelColor` now colors the closed control's text and chevron as well as the popover rows. The native `<select>` and the `presentation: "popover"` trigger read the same keys, so a page that deliberately stays on the native select can finally give it a surface without reaching past the config into widget CSS. `borderColor` draws as a 1px inset ring, so setting it never resizes the control, and every key stays optional with the stylesheet's fallbacks unchanged.
