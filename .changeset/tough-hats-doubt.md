---
"@runtypelabs/persona": patch
---

When attachments are enabled, pasted clipboard images are now added to the composer as attachments in addition to files selected from the file picker.

Messages that include attached images now attempt to render bounded image previews directly in the chat bubble. If preview rendering fails, the existing `[Image]` fallback text is shown.
