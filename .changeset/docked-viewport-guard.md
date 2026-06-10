---
"@runtypelabs/persona": minor
---

Docked mode now guards against pages that don't provide a definite height. The dock panel is clamped to the new `launcher.dock.maxHeight` (default `100dvh`, pinned with `position: sticky` for in-flow reveals) so a missing `html, body { height: 100% }` chain degrades to a viewport-sized, internally-scrolling panel instead of a sidebar that grows with the conversation and scrolls off the page. When the height chain is unresolved, a one-time console warning explains the proper fix. Advanced layouts can override the cap with any CSS length or disable the guard entirely with `dock.maxHeight: false`.
