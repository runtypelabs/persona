---
"@runtypelabs/persona": minor
---

Support unified SSE event names ahead of platform-wide rename

- Accept `step_delta`, `tool_delta`, and `reason_delta` as aliases for `step_chunk`, `tool_chunk`, and `reason_chunk` (aligns with industry-standard `delta` terminology used by Anthropic, Vercel AI SDK, and OpenAI)
- Accept `agent_reflect` as alias for `agent_reflection` (consistent `entity_verb` grammar)
- Enrich `tool_start`, `tool_delta`, and `tool_complete` handlers to carry `agentMetadata` when the payload includes `agentContext` or direct `executionId`/`iteration` fields, supporting the upcoming unification of `agent_tool_*` events into shared `tool_*` events
- Accept `parameters` as alias for `args` and `executionTime` as alias for `duration` in tool event payloads for forward compatibility with the unified format

All existing event names continue to work unchanged. No breaking changes.
