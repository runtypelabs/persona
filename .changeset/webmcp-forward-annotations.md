---
"@runtypelabs/persona": minor
---

Forward WebMCP `Tool.annotations` on `dispatch.clientTools[]` and hoist `annotations.untrustedContentHint` to the top-level field the server acts on, so pages that flag a tool's output as untrusted (reviews, comments, third-party content) get server-side spotlighting before the model reads it. Annotations are returned by `@mcp-b/webmcp-polyfill` v5 and Chrome's native implementation; only the spec's two boolean hints (`readOnlyHint`, `untrustedContentHint`) are forwarded.
