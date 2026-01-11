---
"@runtypelabs/persona": patch
---

Fix llmContent not being sent to server in client token mode

- Add missing `llmContent` to content priority chain in client token dispatch
- Content priority now matches proxy mode: `contentParts > llmContent > rawContent > content`
- Fixes message injection API when using client tokens instead of proxy
