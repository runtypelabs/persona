---
"@runtypelabs/persona": patch
---

Mention-bearing user messages now render through the same transform pipeline as every other bubble (markdown, postprocessMessage, sanitize): mention slots ride the pipeline as placeholder sentinels and are swapped back to atomic tokens in the parsed output. If a custom transform drops a slot, the bubble falls back to verbatim segment rendering so a mention is never lost. Default-config output is unchanged.
