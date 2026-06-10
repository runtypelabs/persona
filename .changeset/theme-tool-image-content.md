---
"@runtypelabs/persona": patch
---

Theme-editor WebMCP `ToolResult` now accepts MCP image content blocks (`ToolImageContent`), so host-registered tools (like the Theme Editor's `screenshot_preview`) can return rendered screenshots to the agent alongside text. Backwards-compatible: existing text-only results are unchanged.
