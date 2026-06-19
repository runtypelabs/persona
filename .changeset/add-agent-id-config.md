---
"@runtypelabs/persona": minor
"@runtypelabs/persona-proxy": patch
---

Add agent-first routing config. The widget now accepts a saved-agent `agentId` and a normalized, backend-neutral `target` string (`"agent_…"`/`"flow_…"` Runtype TypeIDs, or `"<provider>:<id>"` resolved via a pluggable `targetProviders` registry). The proxy sends saved-agent dispatches using Runtype's `agent.agentId` payload shape.
