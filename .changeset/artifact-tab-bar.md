---
"@runtypelabs/persona": minor
---

Artifact pane tab bar overhaul. Tabs no longer overflow the panel: the default strip is a single accessible horizontal scroll strip with a directional edge fade, tabs stay on one line and truncate with an ellipsis, file tabs are labelled by basename with the full path in a tooltip, and the selected tab scrolls into view on selection change. The strip is a keyboard-navigable tablist with roving arrow-key focus, and tabs show a themed focus ring (`.persona-artifact-tab:focus-visible`, matching the artifact cards and icon buttons) instead of the browser default outline.

Hosts can replace the bar entirely via the `features.artifacts.renderTabBar` hook, with the exported `createRovingTablist` helper for accessible custom bars. A `renderTabBar` hook may return the same element across invocations and the pane skips remounting it, so a custom bar keeps its internal state (notably roving keyboard focus) across selection changes; custom bars that reuse `.persona-artifact-tab` inherit the same focus ring.
