---
"@runtypelabs/persona": patch
"@runtypelabs/persona-proxy": patch
---

Consume canonical unified tool and reasoning fields, preserve tool call IDs across continuation streams, apply final tool arguments, and show nonterminal tool failures. Read throughput from canonical output-token fields without treating tool results as usage. Remove obsolete stream aliases, fabricated transcript events, and old init/history response fallbacks while retaining public configuration and extension hooks. Update local-tool documentation to use the supported await event.
