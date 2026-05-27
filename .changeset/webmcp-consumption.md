---
"@runtypelabs/persona": minor
---

Add WebMCP consumption. Persona now snapshots page-registered tools per turn via `@runtypelabs/webmcp-polyfill`, ships them on `dispatch.clientTools[]`, and executes returned `webmcp:*` tool calls with confirm-by-default gating.

Opt in via `config.webmcp = { enabled: true }`. When enabled, the widget installs the polyfill, calls `document.modelContext.__getRegisteredTools()` before each dispatch, and routes any `webmcp:*` tool call returned by the agent through the bridge — confirming with the user, executing the page's `execute()` function with a 30s timeout, normalizing the return into MCP `{ content: [...] }` shape, and posting to `/v1/dispatch/resume`. Wire a custom confirm UI through `config.webmcp.onConfirm`; the default falls back to `window.confirm()`.
