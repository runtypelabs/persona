---
"@runtypelabs/persona": minor
---

Bump `@mcp-b/webmcp-polyfill` to 5.1.0 (from 4.0.0).

Persona's own API is unchanged, but the polyfill ships in the `webmcp-polyfill.js`
chunk, so pages that register WebMCP tools see upstream behavior changes:

- **`execute(input, client)` → `execute(input)`.** 5.x removed the second `client`
  argument that carried `requestUserInteraction`. Tools that called it will throw;
  Persona's single confirm gate is unaffected.
- **No argument validation.** 4.x validated agent-supplied args against the tool's
  `inputSchema` before calling `execute`; 5.x does not. Validate in your own tool
  bodies if you relied on this.
- **Void tools stringify differently.** A tool returning `undefined` now yields the
  text `"undefined"` instead of an empty string.
- `unregisterTool()`, the `autoInitialize` option, and the root-entry schema helpers
  are gone; `installTestingShim` now defaults to `false`. Persona already called
  `initializeWebMCPPolyfill()` explicitly and used none of the rest.
