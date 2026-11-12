---
"@runtypelabs/persona": major
---

WebMCP: the automatic fallback polyfill is now the official WebMCP polyfill, `@w3c/webmcp-polyfill`, replacing `@mcp-b/webmcp-polyfill` v5. It only affects pages where Persona installs `document.modelContext` itself; pages that install their own runtime (any `@mcp-b/webmcp-polyfill` version, the official polyfill, or a JSON-string facade) keep working unchanged.

Under the new fallback:

- It requires a secure context and Chrome/Firefox 126+ or Safari 18+. Elsewhere it installs nothing and Persona logs that WebMCP is disabled.
- Tool callbacks receive `(input, { signal })` and must return a JSON-serializable value. Returning `undefined` fails the call.
- Thrown callback errors reach the model as a generic "Tool execution failed". Return `{ isError: true, content: [...] }` for an actionable message.
- Arguments are not validated against `inputSchema`; validate them in the callback.
- `navigator.modelContext` is no longer installed; use `document.modelContext`.
- Declarative form tools (`<form toolname>`) are not registered. Pages that rely on them should install `@mcp-b/webmcp-polyfill` themselves, which still adds that layer.

npm consumers now get `@w3c/webmcp-polyfill` as the dependency in place of `@mcp-b/webmcp-polyfill`. The CDN `webmcp-polyfill.js` chunk exports `installWebMCP`, with `initializeWebMCPPolyfill` kept as a deprecated alias. The bundled polyfill is Apache-2.0; its licence ships as `LICENSE.webmcp-polyfill`.

The theme-editor WebMCP tools now return `isError` results instead of throwing, and `withToolErrorResult` is exported from `@runtypelabs/persona/theme-editor` to give other tools the same treatment.

The theme overview reuses the registered tools' descriptions for its catalog hints, keeping the guide consistent with the available tools while reducing bundle size.
