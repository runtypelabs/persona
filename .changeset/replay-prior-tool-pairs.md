---
"@runtypelabs/persona": patch
---

Proxy and agent mode now replay earlier client-tool calls and their results on later turns. Each call the browser answered through `/resume` is sent as an assistant message with `toolCalls` followed by a `tool` message with the matching `toolResults`, using model-facing tool names such as `webmcp_search`. The model can then answer follow-ups from a tool result without calling the tool again. A pair keeps replaying after the page stops offering its tool, and a call with no accepted answer is never sent. Client-token mode is unchanged.
