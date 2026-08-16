---
"@runtypelabs/persona": minor
---

Add focus control to the history controller methods: `showHistory({ focus: false })` skips the entry focus and `hideHistory({ restoreFocus: false })` leaves focus untouched on close. Programmatic opens (the theme editor's Messages preview scene) no longer steal focus or pop the back button's keyboard-focus tooltip. Defaults are unchanged.
