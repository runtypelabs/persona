---
"@runtypelabs/persona": patch
---

Align the default welcome state with the conversation column. The card-variant welcome now shares the transcript's content width (`layout.contentMaxWidth`) instead of its own narrower 640px column, the flat default drops the invisible card's horizontal padding so the title lines up with messages and composer, and the greeting bubble follows the same width cap. Themed intro cards (`components.introCard.background`/`.shadow`) keep their full interior padding, and the centered hero variant keeps the 640px column.
