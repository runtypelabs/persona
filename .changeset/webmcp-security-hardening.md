---
"@runtypelabs/persona": minor
---

Harden WebMCP consumption against same-origin tool-injection attacks. Because `document.modelContext` is page-global, any same-origin script can register a tool, so the bridge now: sanitizes tool names and descriptions before they reach the agent (neutralizing prompt-injection delimiters and control characters, capping length); tags page-tool output with `untrustedContentHint` so the agent treats it as data; surfaces the registering page origin in the approval gate; and detects when a tool's contract changed since it was offered (or was never offered), flagging the call as `suspicious` — which renders a prominent warning and bypasses the `autoApprove` fast path. See `WEBMCP-SECURITY.md` for the threat model.
