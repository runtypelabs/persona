---
"@runtypelabs/persona-proxy": patch
---

Move the demo flows and agents to `google/gemini-3.5-flash-lite`. WebMCP Paint runs on `glm-5.2`: its snapshot-and-look loop needs both vision and native tool calls, and glm-5.2 reaches its first stroke fastest while composing a richer scene.
