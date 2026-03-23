---
"@runtypelabs/persona": minor
---

Add `launcher.collapsedMaxWidth` to cap the width of the floating launcher pill when the panel is closed. Launcher title and subtitle use single-line ellipsis truncation with full text in the native `title` tooltip; the text column uses `persona-flex-1 persona-min-w-0` so truncation works inside the flex row. Add `persona-break-words` utility (e.g. for artifact pane monospace lines).
