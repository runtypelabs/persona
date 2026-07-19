---
"@runtypelabs/persona": patch
---

Cut per-keystroke rendering churn in the context mention menu: option rows are now reused across renders keyed by source and item id (listeners attached once, dynamic attributes diffed in place), and lucide icons are built once per shape and cloned. Custom renderMentionItem rows still rebuild each render since hosts own their markup.
