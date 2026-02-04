---
"@runtypelabs/persona": minor
"@runtypelabs/persona-proxy": minor
---

Add agent loop execution support. The widget can now operate in agent mode by setting `config.agent` with a model, system prompt, and loop configuration instead of using `flowId`. Handles all agent-specific SSE events including `agent_turn_delta` (text and thinking content), `agent_tool_*`, `agent_reflection`, and `agent_iteration_*`. Added configurable `iterationDisplay` option (`'separate'` or `'merged'`) to control how multiple agent iterations appear in the chat UI. New exported types: `AgentConfig`, `AgentLoopConfig`, `AgentRequestOptions`, `AgentExecutionState`, `AgentMessageMetadata`, `AgentWidgetAgentRequestPayload`.

The proxy now detects agent payloads (requests containing an `agent` field) and forwards them as-is to the upstream API instead of converting them into flow dispatch payloads.
