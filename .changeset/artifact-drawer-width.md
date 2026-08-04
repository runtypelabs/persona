---
"@runtypelabs/persona": patch
---

New `features.artifacts.layout.drawerWidth` option sizes the slide-over artifact drawer (the narrow-host and mobile presentations, which previously hardcoded a 22rem width). Accepts any CSS length; `"100%"` makes the drawer cover the whole panel. The desktop split's `paneWidth`/`paneMaxWidth` are unaffected, and the default drawer width is unchanged.
