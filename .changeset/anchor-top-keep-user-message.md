---
"@runtypelabs/persona": patch
---

Anchor-top now keeps the sent user message pinned at the top while the reply streams beneath it, matching ChatGPT, Claude, and Gemini: the sent message stays visible as the header of the streaming response. The handoff to the turn's first unread block (introduced for responses that open with a tall tool-call run) still fires, but only when that block would actually start below the fold — a long user message or a tall tool prelude — instead of on every turn, which was sliding the user's message off the top of the viewport as soon as a text reply began.
