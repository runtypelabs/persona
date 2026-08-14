---
"@runtypelabs/persona": patch
---

Keep a plugin home surface and the transcript from rendering as one column. A `renderWelcome` plugin overlay is an `inset: 0` box inside the scrolling messages body, so any transcript scroll underneath it (autoscroll, an anchor repin, or a wheel, since fill and fullscreen layouts stamp an inline `overflow-y: auto` on the body that the overlay state class cannot outrank) moved its containing block out from under the viewport: the plugin stack and the message bubbles ended up interleaved in one scrolling column with no composer, and scrolling past the overlay left the transcript bare. The transcript now leaves layout while plugin content owns the surface, so there is nothing left to scroll under it.

Also stops the panel chrome pass from resetting a plugin-owned composer footer's inline styles, which turned a plugin's hidden placeholder composer into an empty visible band.
