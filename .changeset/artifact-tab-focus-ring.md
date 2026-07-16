---
"@runtypelabs/persona": patch
---

Artifact pane tabs now show a themed keyboard focus ring (`.persona-artifact-tab:focus-visible`, matching the artifact cards and icon buttons) instead of the browser default outline, so keyboard focus looks consistent across browsers. Custom `renderTabBar` bars that reuse `.persona-artifact-tab` inherit the same ring.
