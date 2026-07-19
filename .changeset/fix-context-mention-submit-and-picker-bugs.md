---
"@runtypelabs/persona": patch
---

Fix context-mention edge cases: line-start slash commands that lead any line (not just the first) now dispatch at submit; switching between two channel picker buttons no longer leaves the first button's aria-expanded stuck open; a first-time async mention source no longer double-fetches on its first search; a throwing host llmFormat or onMentionResolveError now drops only that item instead of rejecting the whole submit bundle; and a transient runtime-chunk load failure no longer disables mentions for the rest of the session.
