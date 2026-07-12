---
"@runtypelabs/persona": minor
---

Send a refreshed WebMCP `clientTools[]` snapshot on client-token resume (`POST /v1/client/resume`), using the same diff-only / send-once protocol as the chat path: fingerprint-only when the page's tool registry is unchanged, full array + fingerprint on change or after a `409 client_tools_resend_required` (retried exactly once). Tools registered by a mid-run page navigation now become callable on the next model turn instead of staying frozen at dispatch time. When the registry vanished after a non-empty send, the widget ships an explicit `clientTools: []` so the server replaces the persisted set. Fully backward compatible: older servers strip the unknown fields and keep the frozen-at-dispatch behavior.
