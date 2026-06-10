---
'@runtypelabs/persona': minor
---

Render agent-supplied approval reasons. When an `agent_approval_start` or `step_await` (approval) event carries the new `reason` field, the approval bubble shows an attributed "Agent's stated reason" line between the summary and the technical details. The reason is rendered as plain text (never markdown/HTML) and is explicitly attributed to the agent, since it is the agent's own claim about its intent. New `AgentWidgetApprovalConfig` options: `reasonColor`, `reasonLabel`; `formatDescription` now also receives `reason`.
