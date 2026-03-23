---
"@runtypelabs/persona": patch
---

`onStateLoaded` can now return `{ state, open: true }` to signal that the widget panel should open after initialization. Useful for post-navigation flows where injecting messages into state should also reveal the panel to the user.
