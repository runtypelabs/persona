---
"@runtypelabs/persona": minor
---

Client-token embeds can now answer server-side approval gates. In client-token mode, the approval card posts the decision to `POST /v1/client/approve` with the current session (runtypelabs/core#9518) and streams the continued run into the same conversation. Runtype answers only gates the agent marks `tools.approval.approver: 'end-user'`. Proxy and API-key mode still post to `/v1/agents/{agentId}/approve`, and a Runtype API without the new route falls back to that route.

When an approval request fails (for example `403 APPROVAL_APPROVER_NOT_END_USER` or `409 APPROVAL_ALREADY_RESOLVED`), the widget now adds an assistant message with the server's reason instead of leaving the card with no reply. An expired or unknown pause (404) shows the card as `timeout`.
