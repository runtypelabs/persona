---
"@runtypelabs/persona": patch
---

Fix scroll-to-bottom indicator appearing when content fits in view and persisting after clearing chat

- Hide indicator when message body has no overflow (scrollHeight <= clientHeight)
- Reset auto-follow state on clear chat so the indicator dismisses immediately
