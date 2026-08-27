---
"@runtypelabs/persona-proxy": patch
---

Move the demo flows and agents to `google/gemini-3.5-flash-lite`. WebMCP Paint runs on `gemini-3.7-flash`: its snapshot-and-look loop needs both vision and native tool calls, and the lite tier was slower to its first stroke.
