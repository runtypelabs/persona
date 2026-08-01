---
"@runtypelabs/persona": patch
---

Fix the `layout.slots["body-top"]` slot resolving against a stale class chain.
Both the `defaultContent()` lookup and the insertion path queried utility
classes the intro card no longer carries, so `defaultContent()` returned `null`
and custom welcome content was prepended above the intro card instead of
replacing it. Both sites now query `[data-persona-intro-card]`.
