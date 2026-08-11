---
"@runtypelabs/persona": patch
---

Fix the minimal header layout's close button showing the browser's default button fill through its rounded mask (visible as a light circle on themed headers), and honor `launcher.closeButtonBackgroundColor` there with the same precedence as the standard layout. The Messages header button now inserts into the layout's trailing cluster ahead of the close control, so close stays outermost.
