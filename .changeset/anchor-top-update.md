---
"@runtypelabs/persona": patch
---

`anchor-top` now keeps the submitted user message anchored for the whole reply. It no longer hands the anchor off to the assistant's first block when that block starts below the fold (a long message, a tool-heavy prelude), so readers keep their place and use the jump-to-latest control to reach the answer. Jumping to the latest releases the anchor and spacer for the rest of the turn.
