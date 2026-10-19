---
"@runtypelabs/persona": minor
---

Improve configuration authoring, component theming, and renderer compatibility.

- Describe tool-call and output-token limits without incorrectly claiming the entire run stopped or requiring a follow-up when a final answer can still arrive.

- Add authored configuration exports to the headless theme editor and opt-in code generation that preserves supplied serializable values without filling defaults. Preserve imported values, callbacks in memory, undo/redo, welcome and approval settings, boolean copy values, and escaped text across snippet formats; identify functions that require host JavaScript.
- Document whole-object replacement and reset behavior, modern configuration paths, and existing sparse-patch compatibility. Simplify editor labels while keeping technical update guidance in documentation and exports.
- Add independent header close/clear, send, and idle-microphone theme controls plus scoped approval, question, tool-card, and artifact-pane styling. Preserve explicit legacy precedence and restore theme values when overrides are cleared. Resolve semantic muted/inverse text colors and refresh artifact styles during updates.
- Apply themed control padding while retaining explicit legacy horizontal and vertical overrides.
- Add resolved approval presentations and keyboard controls, with compact V5 decision/execution rows. Managed approval renderers receive linked execution state and an abort signal; configured renderers also handle built-in fallbacks. Retain full cards and legacy traces as options.
- Preserve host intent for legacy styling through defaults and live updates, and keep newly wired voice/approval color consumers opt-in for explicitly supplied theme values. Add debug-only migration hints scoped to each widget lifetime. Protect selection contrast from host-page styling.
- Refresh the generated Runtype public API contract for execution outcomes, tool annotations, steering submission modes, spoken-voice metadata, and prior tool results in voice requests.
- Add opt-in shared height transitions for tool, tool-group, and reasoning disclosures, with coordinated inner-content motion, a default duration of 160ms, instant defaults, reduced-motion support, reversible transitions, streaming-safe rendering, and cleanup across live updates. Prevent grouped child entry effects from flashing during disclosure. Add configurable disclosure chevrons, defaulting to right/down under V5 while retaining V4 directions. Lighten disclosure chevrons and rotate them using the expansion timing, respecting reduced motion.

- Hide automatic tool-row timing by default. Add optional whole-second per-tool or group elapsed timing, preserving authored timers and exact milliseconds in expanded details. Measure groups by known wall-clock timestamps rather than summing overlapping tools.

- Render single-tool groups directly in stack/collapsible modes while preserving iteration boundaries. Preserve open details when a standalone tool gains siblings.

- Apply the existing safe ESM minification pass to the activity runtime to keep disclosure and grouping improvements within its size budget.

- Add an opt-in whole-turn activity disclosure with explicitly classified progress and final messages, a synchronous host adapter and custom header hook. Keep final answers outside, preserve manual disclosure and live DOM, support measured timing and historical replay, and settle local run success, cancellation and failure. Load its renderer separately before reveal; retain existing bundle ceilings. Keep its divider square when host pages apply rounded button styles.

- Preserve optional native assistant message phases and provider history metadata. Group explicitly classified commentary with execution activity while keeping partial answers, final answers and unclassified text in transcript order, without late relocation.

- Give whole-turn activity 16px spacing between prose/tool batches and below its divider, with compact nested rows and 2px child spacing, plus progress content without ordinary message action toolbars, while retaining final-answer controls and custom renderers. Add readable default tool labels and counted homogeneous batch headers, natural mixed summaries, and singular child labels for known tool names, with generic fallbacks and preserved custom templates, summaries, and execution status.

- Give completed classified turn tools muted category icons and homogeneous groups matching icons, with a neutral mixed/unknown fallback. Add per-tool registered icon overrides through `toolCall.iconName`, preserving status and visibility controls, ordinary row defaults, and live callback updates.

- Anchor grouped progress to its visible turn header so automatic collapse keeps “Worked for…” readable above the final answer, preserving manual scroll intent.

- Add per-tool descriptive action titles and a synchronous host title resolver independent of turn classification. Use titles on active rows, expose them to card summary renderers without changing card layout, and add current-action or aggregate group summaries across collapsible, summary-only and stack groups. Keep parallel/completed batches aggregate and preserve authored templates, custom renderers, attention states, and disclosure behavior.
