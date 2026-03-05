---
"@runtypelabs/persona": minor
---

Align agent config with Runtype API and add tool support

**Breaking:**
- `AgentLoopConfig.maxIterations` renamed to `maxTurns` to match the Runtype API
- `AgentLoopConfig.stopCondition` removed (API auto-detects completion)
- `AgentExecutionState.maxIterations` renamed to `maxTurns`
- `AgentExecutionState.stopReason` type updated: `'max_iterations'` replaced with `'max_turns'`, added `'end_turn' | 'max_cost' | 'timeout'`

**Features:**
- `AgentConfig` now supports a `tools` field (`AgentToolsConfig`) for configuring built-in tools (e.g., `builtin:exa`, `builtin:dalle`), MCP servers, runtime tools, and approval workflows
- `AgentLoopConfig` now supports `maxCost` (USD budget cap)
- New exported type: `AgentToolsConfig`

**Fixes:**
- Agent loop execution now works correctly — the widget was sending `maxIterations` but the API expects `maxTurns`, causing every agent request to default to a single turn
- SSE event parsing now correctly reads `maxTurns` from `agent_start` events
