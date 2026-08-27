---
"@runtypelabs/persona": minor
---

Theme the composer overflow menu. The new `components.composer.overflowMenu` group carries `background`, `borderColor`, `borderRadius`, `foreground`, and `shadow` for the `+` menu panel, matching the shape of the existing model picker menu tokens. The panel is portaled outside the themed mount, so the menu forwards the configured values onto it when it opens, the same way the model picker popover already did. Every key is optional and unset ones keep the current surface, border, and shadow fallbacks.

The two composer token seams together add about 25 bytes gzipped to `widget.css`, so its budget moves from 21.5 kB to 21.75 kB and the theme editor preview bundle, which inlines the stylesheet, moves from 163.5 kB to 163.75 kB.
