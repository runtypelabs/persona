---
"@runtypelabs/persona": patch
---

Approval card fixes: long tool names wrap inside the card instead of overflowing, and an older approval request that succeeds late no longer clears a newer request's failure notice. Docs now note that client-token mode always shows the raw tool call, even with `detailsDisplay: "hidden"`.
