---
"@runtypelabs/persona": patch
---

Fix `anchor-top` scroll: keep follow-on assistant content pinned instead of yanking the viewport to the bottom. Once a user send has anchored the conversation, the anchor now holds across the whole turn — a multi-part reply, an injected embed (tweet/image), or a tool result no longer re-arms the follow-to-bottom fallback, so a late-loading embed can't pop the scroll down to itself. The fallback now applies only when nothing has anchored the conversation yet (first-load or proactive-first streaming).
