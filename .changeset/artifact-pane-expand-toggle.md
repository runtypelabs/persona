---
"@runtypelabs/persona": minor
---

Add an optional expand/collapse toggle to the artifact pane toolbar via `features.artifacts.layout.showExpandToggle`. When enabled, both toolbar presets show a maximize/minimize button; expanding fills the widget with the artifact pane and hides the chat column (desktop split view only, the mobile drawer already covers the full width). Expanded state is runtime-only, stays sticky while the pane is visible, and resets when the pane is dismissed or the last artifact disappears. Integrators can intercept or mirror the toggle through the new `{ type: "expand", artifactId, expanded }` variant of `features.artifacts.onArtifactAction`.
