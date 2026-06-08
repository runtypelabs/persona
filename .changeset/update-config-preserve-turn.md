---
"@runtypelabs/persona": patch
---

`controller.update()` now refreshes the widget in place when only display config changed (theme, copy, layout, suggestions, …) instead of always recreating the client. Connection/request-shaping changes (apiUrl, clientToken, webmcp, headers, parser, …) still trigger a full client rebuild. This keeps a live stream — and any in-flight WebMCP tool resolve — alive across a mid-turn UI update, so a `webmcp:*` tool that restyles the widget while the agent's turn is still streaming no longer aborts and strands that turn.
