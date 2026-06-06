---
"@runtypelabs/persona": minor
---

Add WebMCP consumption. Persona now snapshots page-registered tools per turn via `@mcp-b/webmcp-polyfill`, ships them on `dispatch.clientTools[]`, and executes returned `webmcp:*` tool calls with confirm-by-default gating.

Opt in via `config.webmcp = { enabled: true }`. When enabled, the widget lazily installs the polyfill, reads `document.modelContext.getTools()` before each dispatch, and routes any `webmcp:*` tool call returned by the agent through the bridge — confirming with the user, executing the page tool via `document.modelContext.executeTool()` with a 30s timeout, normalizing the return into MCP `{ content: [...] }` shape, and posting to `/v1/dispatch/resume`. Wire a custom confirm UI through `config.webmcp.onConfirm`; the default falls back to `window.confirm()`.

The polyfill is loaded only when WebMCP is enabled, so widgets that don't opt in never install `document.modelContext`. Consumption also works on browsers that ship WebMCP natively.

When a single turn produces multiple `webmcp:*` tool awaits, each resolve now uses its own per-call `AbortController` (tracked for teardown by `cancel()`/`clearMessages()`/`hydrateMessages()`/`sendMessage()`), so resolving one local tool no longer aborts the in-flight resume stream that delivers the next — fixing a hang on chained/parallel local tool calls.
