---
"@runtypelabs/persona": patch
---

Keep the header band one height across Home, Messages, and Conversation: the shell-hosted Messages bar now sizes its controls, glyphs, and grid tracks from components.header.controlSize and controlIconSize instead of a hardcoded 44px, with the header's own 40px coarse-pointer floor. Themed header controls now apply to every surface.
