---
"@runtypelabs/persona": minor
---

With WebMCP enabled, Runtype voice calls now advertise the page's tools, run tool calls the server routes to the page (skipping the confirm gate only for tools annotated `readOnlyHint: true`), and skip delegated turns the server answers itself. Servers that do not negotiate this see no change.
