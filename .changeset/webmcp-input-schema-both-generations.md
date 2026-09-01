---
"@runtypelabs/persona": patch
---

Fix WebMCP page tools being dropped from `dispatch.clientTools[]`, which 400'd every turn on a page with registered tools.

`getTools()` returns each tool's `inputSchema` as a JSON Schema **object** since `webmcp#241` — the shape `@mcp-b/webmcp-polyfill` v5 and Chrome 154+ emit. The widget still assumed the serialized JSON string of the previous generation and `JSON.parse`d it, so every schema was silently discarded, `parametersSchema` was omitted from every tool, and the server rejected the whole dispatch with `INVALID_UNION`.

The snapshot now accepts **both** generations — Chrome 149-153 and 154's same-document tools still emit the string — and always sends a `parametersSchema`, degrading a missing or malformed schema to an empty `{ type: "object" }` rather than omitting the key and failing the entire request.
