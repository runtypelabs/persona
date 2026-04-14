---
"@runtypelabs/persona": patch
---

Fix tool call bubbles showing fallback "tool" instead of the actual tool name in active text templates. When `agent_tool_start` arrived before `tool_start`, the name-less first render was cached and preserved by the animation morph guard. The fingerprint now includes `toolCall.name` so the cache invalidates when the name arrives, and the morph callback allows content updates when text has meaningfully changed.
