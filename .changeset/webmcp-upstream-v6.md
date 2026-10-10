---
"@runtypelabs/persona": major
---

Migrate to the upstream WebMCP polyfill through `@mcp-b/webmcp-polyfill` v6. Tool execution now uses the current object-input contract; existing native contexts and host-installed polyfills must support that contract. Keep discovery and execution scoped to the current document so tools in related frames cannot collide with name-only dispatch. Update producer examples to `installWebMCP()` and test against the real published runtime.

The fallback polyfill requires a secure context and Chrome/Firefox 126+ or Safari 18+. Tool callbacks must validate inputs and return JSON-serializable values. Non-serializable results now fail instead of being converted to text.
