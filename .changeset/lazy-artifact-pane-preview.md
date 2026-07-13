---
"@runtypelabs/persona": patch
---

Artifact pane no longer renders its preview while hidden. In the "inline" and "card" display modes the pane surface is not shown, but its `update()` used to build the preview body anyway, creating a second sandboxed `srcdoc` iframe alongside the inline/card preview. That executed artifact scripts twice (duplicate analytics/fetch side effects, duplicate CPU) and ran the preview loading machinery twice. The pane now records state while hidden and renders lazily on the next reveal, so an artifact's scripts run exactly once.
