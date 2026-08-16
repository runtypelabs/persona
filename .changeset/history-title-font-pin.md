---
"@runtypelabs/persona": patch
---

Pin the Messages view title's font-family to the shared header-title token (`components.header.title.fontFamily`, falling back to the widget's inherited font). The title is a real `h2`, and on non-shadow embeds a host page's own heading font rule could previously fill the unset property, making the Messages title render in a different typeface than the widget header.
