---
"@runtypelabs/persona": patch
---

Fix `resolveApproval` re-stamping an approval bubble's `createdAt`/`sequence` to "now" on decision, which could reorder it after messages created later (e.g. a long-pending approval resolved after more conversation, or restored/replayed transcripts). The resolved bubble now stays anchored at the point the agent paused for permission, matching the standard human-in-the-loop convention of updating the approval in place.
