---
"@runtypelabs/persona": patch
---

Fix the history confirmation dialog's text color in split layouts: it referenced a never-emitted variable and fell back to inherited color, which is the page's (near-black) rather than the theme's when the dialog mounts at the panel level. It now uses the widget's text token directly.
