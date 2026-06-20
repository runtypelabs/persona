---
"@runtypelabs/persona": patch
---

Wrap long unbreakable tokens (URLs, package names) inside message bubbles instead of overflowing horizontally. Adds `overflow-wrap: break-word` to `.persona-message-bubble` so links and prose stay within the bubble's max-width.
