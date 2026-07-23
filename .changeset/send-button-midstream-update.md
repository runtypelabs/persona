---
"@runtypelabs/persona": patch
---

Fix the send button reverting from the stop icon to the send icon when a live `update()` lands during an active stream. The button showed the send arrow mid-stream while its aria-label still read "stop"; the icon content is now left untouched while streaming, so the stop glyph set by the composer survives an update and heals to the send icon on completion.
