---
"@runtypelabs/persona": minor
---

Add agent loop execution support. The widget can now operate in agent mode by setting `config.agent` with a model, system prompt, and loop configuration instead of using `flowId`. Handles all agent-specific SSE events including `agent_turn_delta` (text and thinking content), `agent_tool_*`, `agent_reflection`, and `agent_iteration_*`. Added configurable `iterationDisplay` option (`'separate'` or `'merged'`) to control how multiple agent iterations appear in the chat UI. New exported types: `AgentConfig`, `AgentLoopConfig`, `AgentRequestOptions`, `AgentExecutionState`, `AgentMessageMetadata`, `AgentWidgetAgentRequestPayload`.
