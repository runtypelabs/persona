---
"@runtypelabs/persona": patch
---

Line up the conversation-open skeleton bubbles with the real message radii. Leading bubbles now follow `--persona-message-assistant-radius` and trailing ones `--persona-message-user-radius`, both falling back through `--persona-radius-lg`, instead of a hardcoded 16px, so the skeleton matches whatever radius the theme gives the actual bubbles that replace it.
