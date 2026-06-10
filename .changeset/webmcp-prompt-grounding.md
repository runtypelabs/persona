---
"@runtypelabs/persona-proxy": patch
---

Add "Acting vs. claiming" grounding rules to all WebMCP demo flow system prompts (calendar, storefront, slides, docked) so the model never confirms a calendar/cart/deck/workspace change without a same-turn tool call, and handles bare follow-ups like "do it" by executing or verifying instead of re-announcing a past action.
