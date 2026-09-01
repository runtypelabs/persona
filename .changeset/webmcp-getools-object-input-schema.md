---
"@runtypelabs/persona": patch
---

Accept the object-valued `inputSchema` that `document.modelContext.getTools()` returns since webmcp#241 (`@mcp-b/webmcp-polyfill` 5.x, Chrome 154+). The WebMCP bridge previously assumed the JSON-encoded string that change replaced, so page tools reached the agent with no `parametersSchema`. The legacy string form (polyfill 4.x, Chrome 149–153) is still accepted.
