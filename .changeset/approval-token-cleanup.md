---
"@runtypelabs/persona": patch
---

Approval decision tokens (added to stop an older failed decision from reopening a card) are now dropped once their request settles, so a long-lived session no longer keeps one per resolved card.
