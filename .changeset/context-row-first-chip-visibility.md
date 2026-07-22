---
"@runtypelabs/persona": patch
---

Fix context mention chip row staying hidden after the first mention is added. Visibility was computed before the mention was tracked, so the first chip only appeared once a second mention made the row visible.

Fix custom-rendered mention chips (`renderMentionChip`) not being removable: the status update swapped the chip's DOM node, so remove/clear targeted the detached original instead of the live element.
