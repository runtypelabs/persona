---
"@runtypelabs/persona": patch
---

Preserve approval context (tool name, description, tool type, agent-stated reason, parameters) when `agent_approval_complete` resolves an approval bubble. The complete event only carries the decision, so the session now merges it field-wise into the existing approval instead of replacing it — resolved bubbles no longer lose their context on a full re-render.
