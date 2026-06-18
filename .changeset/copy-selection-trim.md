---
"@runtypelabs/persona": patch
---

Fix manual text copy (triple-click + Ctrl/Cmd-C) from message bubbles attaching stray leading/trailing blank lines. The widget now normalizes the clipboard's plain text to match the visible selection, while preserving interior newlines and first-line indentation.
