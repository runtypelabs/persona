---
"@runtypelabs/persona": patch
---

Approval cards: an older approval decision that fails can no longer reopen a card that a newer decision already settled, even when both decisions are made in the same millisecond. Each decision request now carries its own token, and only the card's latest request may restore it after a failure.
