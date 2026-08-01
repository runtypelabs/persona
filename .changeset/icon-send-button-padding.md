---
"@runtypelabs/persona": minor
---

Fix icon-mode send button glyph sizing. Icon mode no longer applies `sendButton.paddingX`/`paddingY` (the always-present padding defaults were crushing and distorting the SVG), and the glyph now renders in a box half the button `size`, the closest clean ratio to the previous effective rendering. New `sendButton.iconSize` sets the glyph box explicitly (sparse glyphs like `arrow-up` often want more than half), and `sendButton.iconStrokeWidth` sets the glyph stroke weight (default 2). Text-mode buttons keep their configured padding.
