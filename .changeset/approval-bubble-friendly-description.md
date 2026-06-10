---
"@runtypelabs/persona": minor
---

Make tool approval bubbles user-friendly by default. The agent-facing tool description and raw parameters JSON are now collapsed behind a "Show details" toggle, and the bubble leads with a humanized summary line ("The assistant wants to use “Add to cart”."). WebMCP tools that declare a display name via the spec's `ToolDescriptor.title` get that label instead, and custom `webmcp.onConfirm` handlers receive it as `info.title`. New `approval` config options: `detailsDisplay` (`"collapsed"` | `"expanded"` | `"hidden"`), `formatDescription` for custom summary copy (receives `displayTitle`), and `showDetailsLabel`/`hideDetailsLabel`.
