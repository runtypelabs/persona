---
"@runtypelabs/persona": patch
---

Fix the event stream inspector reappearing stacked above the chat messages when the window is resized across the mobile/fullscreen breakpoint. The fullscreen layout reset was wiping the `display: none` that hides the messages body while the stream is open; it's now preserved, so the event panel keeps taking over the full chat area at every width.
