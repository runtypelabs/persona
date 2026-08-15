---
"@runtypelabs/persona": patch
---

Show success feedback on the artifact toolbar copy control: after a copy resolves (built-in clipboard write, or the primary click handled by `onDocumentToolbarCopyMenuSelect`), the copy glyph swaps to a check and the "Copy" label reads "Copied" for 2 seconds, matching the message-level copy action. Failed copies stay unconfirmed. Copy-menu selections routed to a custom handler are left to the integrator, since custom menus can hold non-copy actions.
