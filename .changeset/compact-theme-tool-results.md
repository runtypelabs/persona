---
"@runtypelabs/persona": patch
---

Theme-editor WebMCP tool results (set_brand_colors, get_theme_overview, etc.) now serialize compact JSON instead of 2-space pretty-print — the text block is consumed by the model, where indentation whitespace is pure token overhead. `structuredContent` is unchanged.
