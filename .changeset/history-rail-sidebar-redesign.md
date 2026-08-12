---
"@runtypelabs/persona": patch
---

Restyle the Messages rail as a conversation sidebar: 36px title-only rows with rounded hover and selection washes on their own surface, date headings aligned to the row text inset, and a new-conversation row at the top instead of the panel's floating pill. The rail hides the avatar, preview, timestamp, row hairline and selection marker that the panel keeps. Adds `features.history.rail` with `side` ("left" or "right") and `width` (200-400px). The rail now docks on the left at 260px by default, where it previously docked on the right at 320px.
