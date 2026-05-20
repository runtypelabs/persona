---
"@runtypelabs/persona": patch
---

Fix agent-turn text/tool interleaving so a `text → tool → text → tool → text` sequence within a single `agent_turn` renders as separate, chronologically ordered bubbles instead of one merged text bubble below all the tool cards.

Previously, all `agent_turn_delta` (text) events within a turn accumulated into a single `assistantMessage` that was only finalized at iteration/step boundaries. Because each `agent_tool_start` created a tool message with an earlier `createdAt` than the still-growing text message, the timeline sorted tools before the consolidated narration — so an assistant that said *"Let me scrape a few more pages"* before kicking off a Firecrawl tool would appear to "explain itself" below the tool card it triggered.

The widget now seals the in-flight assistant text bubble at every `agent_tool_start`, so the next text delta in that turn creates a new bubble. `agent_turn_complete.stopReason` continues to attach to the final visible text segment (whether it was sealed by a tool boundary or by turn-complete itself).

No wire-protocol changes; relies on existing `seq`-ordered events and treats `agent_tool_start` as the natural segment boundary.
