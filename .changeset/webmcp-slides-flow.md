---
"@runtypelabs/persona-proxy": minor
---

Add WEBMCP_SLIDES_FLOW — a Deck Copilot flow for the new slide-deck editor WebMCP demo (`examples/embedded-app/webmcp-slides.html`). Like the other WebMCP flows it owns no tools of its own; the system prompt teaches the model to work with the page's dynamic tool set (selection-scoped tools, presenter-mode swap) and the live `{{slides_context}}` editor state.
