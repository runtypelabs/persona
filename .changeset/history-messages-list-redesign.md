---
"@runtypelabs/persona": patch
---

Restyle the Messages list to the familiar messenger layout: each conversation row now leads with a 40px avatar, puts the conversation title on the first line with its relative time aligned right, and keeps the preview to a single line beneath it. Rows run edge to edge with a full-bleed hover wash and an inset hairline under each one, the per-row overflow trigger fades in on hover or keyboard focus instead of sitting on every row, and the date headings collapse to one flat list in panel presentation (the rail keeps them; screen readers still get them everywhere). The new conversation action moves from a full-width block above the list to a pill pinned at the bottom of it, and the bar title is centered.

New `features.history.rowAvatar` option: `true` (default) shows the same icon the header uses, a string sets an explicit image URL or glyph, and `false` drops the avatar so the text column runs full width. Two new theming variables come with it, `--persona-history-row-avatar-bg` and `--persona-history-row-divider`.
