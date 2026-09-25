---
"@runtypelabs/persona": patch
---

Proxy and agent mode now replay earlier client-tool calls and their results on later turns. Each call the browser answered through `/resume` is sent as an assistant message with `toolCalls` followed by a `tool` message with the matching `toolResults` (the `/v1/dispatch` shape, with model-facing tool names such as `webmcp_search`), so the model can answer follow-ups from a tool result without calling the tool again. A pair is sent only while the page still offers that tool, and a call with no accepted answer is never sent. Client-token mode is unchanged: the server replays from its stored transcript there. Replay needs a Runtype API that accepts tool turns on `/v1/dispatch`.
