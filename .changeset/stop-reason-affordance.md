---
"@runtypelabs/persona": minor
---

Surface the runtime's new `stopReason` field on `agent_turn_complete` and `step_complete` SSE events. Assistant messages now carry an optional `stopReason` (`'end_turn' | 'max_tool_calls' | 'length' | 'content_filter' | 'error' | 'unknown'`); when the value is non-natural, the bubble renders a small inline notice instead of leaving an empty space. Notably, when the agent loop trips its tool-call ceiling and emits no follow-up text, the bubble now reads "Stopped after calling a tool. Send a follow-up to continue." rather than rendering an empty bubble. Copy is overridable per-reason via the new `config.copy.stopReasonNotice` option. Older API streams that omit `stopReason` render exactly as before.
