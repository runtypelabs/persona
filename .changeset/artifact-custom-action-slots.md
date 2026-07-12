---
"@runtypelabs/persona": minor
---

Add declarative custom action slots for artifacts. `features.artifacts.toolbarActions` renders custom buttons in the artifact pane toolbar (between refresh and expand/close, both presets), and `features.artifacts.cardActions` renders them on the reference card before Download (complete artifacts only). Each `PersonaArtifactCustomAction` takes an id, label, an icon (registry name or an element factory for brand SVGs), optional `showLabel` and per-artifact `visible()` gate, and an `onClick` handler that receives the artifact context (id, title, type, markdown, file meta, component payload). Card action clicks are event-delegated, so they survive streaming re-renders and page refresh; both slots re-read live config updates. Buttons inherit the shared icon/label button theming.
