---
"@runtypelabs/persona-proxy": patch
---

Forward the widget's replayed client-tool pairs upstream. The proxy rebuilt each message as `{ role, content }`, which stripped `toolCalls` and `toolResults`; it now keeps them on assistant and `tool` messages, and drops a `tool` message that carries no results.
