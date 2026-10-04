---
"@runtypelabs/persona": patch
---

Don't add an empty assistant bubble for a buffered `step_complete` that carries no response and a natural stop reason (`end_turn` / `unknown`). A resumed leg that ends the turn after `suggest_replies` streams no text, and since a natural stop has no notice, the empty bubble just sat behind the answer. Empty responses with a notice-worthy stop reason (`max_tool_calls`, `length`, `content_filter`, `error`) still surface their bubble.
