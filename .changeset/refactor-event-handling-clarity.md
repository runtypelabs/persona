---
"@runtypelabs/persona": patch
---

Refactor event handling in AgentWidgetClient to clarify alias usage. Updated the conditional check to maintain the order of event types for clarity, with `reason_delta` as the canonical event and `reason_chunk` as a legacy alias.
