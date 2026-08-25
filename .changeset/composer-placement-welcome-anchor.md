---
"@runtypelabs/persona": minor
---

Add `composer.placement: "block" | "overlay"` and `welcome.anchor: "bottom" | "center"`.

`placement: "overlay"` overlays the composer footer on the transcript so content
scrolls behind it, reserving the footer's live height on the scroll body, on a
`renderWelcome` plugin overlay, on the scroll-to-bottom affordance, and on the
composer sheet slot. `anchor: "center"` floats the greeting and composer together
in the empty conversation, with `welcome.anchorComposerTop` (default `"44%"`) and
`welcome.composerGap` (default `"24px"`), and drops them to the bottom on the
first message. The two compose freely.

New tokens: `components.composer.overlayBand` (any CSS background, gradients
included) and `components.input.backdropFilter`. New host-readable contracts on
`[data-persona-root]`: `data-persona-conversation-state`,
`data-persona-composer-placement`, `--persona-composer-overlay-height`, and
`--persona-composer-lift`.
