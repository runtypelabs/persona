---
"@runtypelabs/persona": minor
---

WebMCP tool-call confirmations now render through Persona's native in-panel approval bubble by default (the same chrome used for server-driven tool approvals), instead of the blunt `window.confirm` fallback. A new `webmcp.autoApprove(info)` predicate lets you skip the gate for specific tools (e.g. auto-allow a read-only catalog search while still confirming mutating calls). Supplying `webmcp.onConfirm` continues to fully override the UI.
