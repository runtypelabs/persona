---
"@runtypelabs/persona": minor
---

Align the WebMCP tool surface with Chrome 153's `execute(input, { signal })` change, and add
`@runtypelabs/persona/webmcp-tool` for pages that register WebMCP tools.

`execute`'s second argument is not portable: native Chrome (>= 153.0.8009.0) passes
`{ signal }` per webmachinelearning/webmcp#247, while `@mcp-b/webmcp-polyfill` passes
`{ requestUserInteraction }` — a polyfill-only extension present in neither the spec nor
Chrome — and Chrome < 153 passes nothing. A tool written against either shape breaks on the
other, as a `TypeError` inside a tool call rather than anything a build catches.

The new subpath export normalizes that away:

- `defineWebMcpTool(tool)` / `registerWebMcpTools(tools, { signal })` — `execute` always
  receives both members, so tool bodies are runtime-agnostic. `registerWebMcpTools` also
  catches registration *rejections*, not just synchronous throws (`registerTool` is async in
  both the spec and the polyfill, and rejects on an already-aborted signal).
- `capabilities.cancellation` reports whether the signal can actually fire, since
  normalizing the shape cannot conjure cancellation the runtime does not deliver. It is
  `false` under the polyfill and on Chrome < 153, where the substituted signal is inert.
- `normalizeWebMcpToolContext()` and `getModelContext()` are exported for pages that
  register by hand.

Also in this release:

- `ToolExecute` (theme-editor WebMCP types) accepts the context as a second argument.
- `parseSchema` accepts an object-shaped `inputSchema` from `getTools()` in addition to the
  polyfill's JSON string, so a runtime following the spec IDL literally no longer ships every
  WebMCP tool with its parameter schema silently dropped.
- Docs describing `requestUserInteraction` as part of the WebMCP spec are corrected, and the
  callback is marked `@deprecated`.

The bridge's consumer path is unchanged: it already passed a combined timeout/`cancel()`
signal through `executeTool`.
