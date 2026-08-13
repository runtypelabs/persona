---
"@runtypelabs/persona": patch
---

Move the history rail's collapse toggle to the edge facing the conversation, with identity leading, and mirror both when `features.history.rail.side` is `"right"`. Adds `features.history.rail.renderHeader`, a rail-only slot for a host-rendered brand in the rail header; the view keeps its heading for the accessible name.
