---
"@runtypelabs/persona": patch
---

Hide the welcome surface while a conversation selected from Messages is loading. The welcome or home screen used to stay painted above the conversation-open skeleton for the whole fetch, then disappear abruptly at hydration, because its visibility was derived from the transcript alone. A pending open now suppresses it instantly, whether it is rendered from config or by a `renderWelcome` plugin, and the same applies while the failed-open error surface is showing. The welcome returns when navigation lands back on an empty transcript, for example through the error surface's "Back to messages" action.
