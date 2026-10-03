---
'@runtypelabs/persona': patch
---

The built-in `suggest_replies` tool now ends the turn after its chips are shown. `ClientToolDefinition` gains an optional `endsTurn` flag, and `SUGGEST_REPLIES_CLIENT_TOOL` sets it. When every call in a resumed batch is an `endsTurn` tool, a server that supports the flag completes the turn without another model call, so the model no longer writes its answer a second time after the "Suggestions shown" result. Older servers ignore the flag and keep the follow-up model call.
