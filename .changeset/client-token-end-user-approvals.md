---
"@runtypelabs/persona": minor
---

Client-token widgets can now answer tool approvals: decisions go to `/v1/client/approve` using the chat session, and the continued reply streams into the same conversation. In client-token mode the approval card offers only one-time approval and shows the raw tool name and arguments above the agent's stated reason. If a decision fails (already answered, expired, needs the business's approval, unsupported server), the visitor sees a plain message in the transcript. `/v1/client/chat` requests now declare `capabilities: { endUserApproval: true }`.
