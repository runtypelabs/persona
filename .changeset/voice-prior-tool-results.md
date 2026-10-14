---
"@runtypelabs/persona": patch
---

Voice: when the server hands a turn back to the chat with `delegation_started.input.priorToolResults`, the widget records each already-run page tool once as a completed tool row under that turn and never runs it again. Proxy and agent requests replay it to the model as a `toolCalls`/`toolResults` pair with the same `toolCallId`. Client-token requests send it as `voice.priorToolResults`. The widget declares the `prior_tool_results` voice capability.
