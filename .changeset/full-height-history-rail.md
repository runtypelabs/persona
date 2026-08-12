---
"@runtypelabs/persona": patch
---

The Messages rail now runs the full widget height. While the rail is mounted the widget header (and any top-right close / clear chat buttons) moves into the conversation column beside it, so the rail reads as an app sidebar instead of a drawer under the header; panel presentation and the live move across 720px restore the original layout exactly. The rail's own top bar becomes a themeable rail header strip via the new `theme.components.history.railHeader` tokens (`background`, `border`, `minHeight`), and `theme.components.header.minHeight` pins the widget header to a matching height so both strips align into one band. Fixes a live `controller.update()` of `features.history.rail.width` or `rail.side` doing nothing to an open rail, and four header lookups that silently no-oped, leaving the header icon, close, and clear chat placement flips unapplied.
