---
"@runtypelabs/persona": patch
---

Hide the Messages view's destructive footer (Delete all conversations, Forget this device) while the first list load is unresolved. The actions reveal with the data they act on instead of rendering interactive over an empty loading surface; refresh and load-more keep the footer since rows already anchor it.
