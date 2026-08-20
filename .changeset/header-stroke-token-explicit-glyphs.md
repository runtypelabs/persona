---
"@runtypelabs/persona": patch
---

`theme.components.header.controlStrokeWidth` now reaches header glyphs rendered at explicit sizes, including the composer-bar close and clear-chat buttons. Explicitly sized glyphs bypass the token-driven stylesheet classes, so the stroke token rides the SVG's inline style instead, keeping the baked attribute as the no-token fallback and preserving the sparse X's 0.7 optical factor. Defaults are unchanged.
