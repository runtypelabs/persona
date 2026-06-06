---
"@runtypelabs/persona": minor
---

Diff-only / send-once WebMCP `clientTools[]` dispatch for client-token conversations. After the first turn, the widget sends only a `clientToolsFingerprint` when the page's tool registry is unchanged, omitting the full array; it resends the full list on a change, on a fresh session, on `clearMessages()`, or when the server replies `409 client_tools_resend_required` (retried exactly once). The proxy/flow and agent dispatch paths, and the API-key `/v1/dispatch` path, are unchanged and continue to send the full list every turn. Requires the matching core `/v1/client/chat` server support to take effect; older servers simply receive the full list as before.
