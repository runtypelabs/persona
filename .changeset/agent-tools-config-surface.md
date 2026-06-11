---
"@runtypelabs/persona": minor
---

Model the full dispatch tool-config surface on `AgentToolsConfig`: `toolCallStrategy`, `perToolLimits`, `approval.requestReason`, `subagentConfig` (spawn_subagent orchestration), and `codeModeConfig`. The widget already passed these through verbatim at runtime; consumers no longer need a type cast to configure subagent orchestration.
