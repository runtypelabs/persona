---
"@runtypelabs/persona": patch
---

Fix three more cases where any live `update()` visibly restyled composer and header chrome: the mic icon boldened (updater rendered stroke 2 while the builder uses 1.5), the mic button color flipped from the text token to `currentColor` (updater had an extra fallback the builder does not), and the close and clear-chat icons lost the builder's `display:block`, shifting them off-center. The update path now mirrors the mount-time builders exactly.
