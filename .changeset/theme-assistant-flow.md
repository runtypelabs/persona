---
"@runtypelabs/persona-proxy": minor
---

Add `THEME_ASSISTANT_FLOW` — the tool-calling flow behind the Theme Editor's docked **Theme Copilot**. It drives the page's WebMCP theme tools (`webmcp:*`) to restyle the editor's live preview from chat, and supports an image-matching loop: paste a screenshot of another chat widget and the copilot extracts a style spec, applies it, then verifies the result via the page's `screenshot_preview` capture tool.
