---
"@runtypelabs/persona": minor
---

Add theme tokens for markdown elements, collapsible widget chrome, and message borders — enabling full dark mode styling via config without CSS overrides.

- Fix inline artifact card background in dark mode (`--persona-surface` instead of nonexistent `--persona-bg`)
- Add `components.markdown.codeBlock` (background, borderColor, textColor)
- Add `components.markdown.table` (headerBackground, borderColor)
- Add `components.markdown.hr` (color)
- Add `components.markdown.blockquote` (borderColor, background, textColor)
- Add `components.collapsibleWidget` (container, surface, border) for tool/reasoning/approval bubble chrome
- Add `components.message.border` for message separator color
