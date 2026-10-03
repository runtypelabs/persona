---
"@runtypelabs/persona": patch
---

After an approval decision, the paused tool bubble now settles instead of spinning forever. The server resumes an approval by re-running the agent, which re-issues the tool call under a new id. On `approval_complete`, a denied or timed-out call now shows as failed ("Denied" / "Approval timed out"), and an approved call is marked complete and `superseded`, with the result on the re-run call. `AgentWidgetApproval` gains `toolCallId` and `AgentWidgetToolCall` gains `superseded`.
