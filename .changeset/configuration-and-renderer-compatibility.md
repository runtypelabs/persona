---
"@runtypelabs/persona": minor
---

Improve configuration authoring, component theming, and renderer compatibility.

- Add authored configuration exports to the headless theme editor and opt-in code generation that preserves supplied serializable values without filling defaults. Preserve imported values, callbacks in memory, undo/redo, welcome and approval settings, boolean copy values, and escaped text across snippet formats; identify functions that require host JavaScript.
- Document whole-object replacement and reset behavior, modern configuration paths, and existing sparse-patch compatibility. Simplify editor labels while keeping technical update guidance in documentation and exports.
- Add independent header close/clear, send, and idle-microphone theme controls plus scoped approval, question, tool-card, and artifact-pane styling. Preserve explicit legacy precedence and restore theme values when overrides are cleared. Resolve semantic muted/inverse text colors and refresh artifact styles during updates.
- Add resolved approval presentations and keyboard controls, with compact V5 decision/execution rows. Managed approval renderers receive linked execution state and an abort signal; configured renderers also handle built-in fallbacks. Retain full cards and legacy traces as options.
- Preserve host intent for legacy styling through defaults and live updates, and keep newly wired voice/approval color consumers opt-in for explicitly supplied theme values. Add debug-only migration hints scoped to each widget lifetime. Protect selection contrast from host-page styling.
- Refresh the generated Runtype public API contract for execution outcomes, tool annotations, steering submission modes, and spoken-voice metadata.
