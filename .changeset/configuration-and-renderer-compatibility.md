---
"@runtypelabs/persona": minor
---

Improve configuration authoring, component theming, and renderer compatibility.

- Add authored configuration exports to the headless theme editor and opt-in code generation that preserves supplied serializable values without filling defaults. Preserve imported values, callbacks in memory, undo/redo, welcome and approval settings, boolean copy values, and escaped text across snippet formats; identify functions that require host JavaScript.
- Document whole-object replacement and reset behavior, modern configuration paths, and existing sparse-patch compatibility. Simplify editor labels while keeping technical update guidance in documentation and exports.
- Add independent header close/clear, send, and idle-microphone theme controls plus scoped approval, question, tool-card, and artifact-pane styling. Preserve explicit legacy precedence and restore theme values when overrides are cleared. Resolve semantic muted/inverse text colors and refresh artifact styles during updates.
- Apply themed control padding while retaining explicit legacy horizontal and vertical overrides.
- Add resolved approval presentations and keyboard controls, with compact V5 decision/execution rows. Managed approval renderers receive linked execution state and an abort signal; configured renderers also handle built-in fallbacks. Retain full cards and legacy traces as options.
- Preserve host intent for legacy styling through defaults and live updates, and keep newly wired voice/approval color consumers opt-in for explicitly supplied theme values. Add debug-only migration hints scoped to each widget lifetime. Protect selection contrast from host-page styling.
- Refresh the generated Runtype public API contract for execution outcomes, tool annotations, steering submission modes, spoken-voice metadata, and prior tool results in voice requests.
- Add opt-in shared height transitions for tool, tool-group, and reasoning disclosures, with coordinated inner-content motion, a default duration of 160ms, instant defaults, reduced-motion support, reversible transitions, streaming-safe rendering, and cleanup across live updates. Prevent grouped child entry effects from flashing during disclosure. Add configurable disclosure chevrons, defaulting to right/down under V5 while retaining V4 directions. Lighten disclosure chevrons and rotate them using the expansion timing, respecting reduced motion.

- Hide automatic tool-row timing by default. Add optional whole-second per-tool or group elapsed timing, preserving authored timers and exact milliseconds in expanded details. Measure groups by known wall-clock timestamps rather than summing overlapping tools.

- Render single-tool groups directly in stack/collapsible modes while preserving iteration boundaries. Add `groupSingletons` for hosts that want a summary header for every group, and preserve open details when a standalone tool gains siblings.

- Apply the existing safe ESM minification pass to the activity runtime to keep disclosure and grouping improvements within its size budget.
