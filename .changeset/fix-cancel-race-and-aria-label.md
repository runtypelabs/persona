---
"@runtypelabs/persona": patch
---

Fix two more context-mention issues: pressing stop while a submit-time mention resolve is still in flight now aborts the turn instead of letting the dispatch proceed, and the inline composer's placeholder updates no longer overwrite an explicit host-provided aria-label.
