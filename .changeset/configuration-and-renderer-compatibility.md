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

- Hide automatic tool-row and V5 card timing by default. Add optional compact per-tool or group header timing, preserving authored timers and exact timing metadata for custom renderers. Hide raw names above tool details by default with a `features.toolCallDisplay.showToolName` opt-in, and remove the automatic duration footer from expanded details in both versions. Retain V4 card timed default summaries. Measure groups by known wall-clock timestamps rather than summing overlapping tools.

- Render single-tool groups directly in stack/collapsible modes while preserving iteration boundaries. Preserve open details when a standalone tool gains siblings.

- Apply the existing safe ESM minification pass to the activity runtime to keep disclosure and grouping improvements within its size budget.

- Add an opt-in whole-turn activity disclosure with explicitly classified progress and final messages, a synchronous host adapter and custom header hook. Keep final answers outside, preserve manual disclosure and live DOM, support measured timing and historical replay, and settle local run success, cancellation and failure. Load its renderer separately before reveal; retain existing bundle ceilings. Keep its divider square when host pages apply rounded button styles.

- Preserve optional native assistant message phases and provider history metadata. Group explicitly classified commentary with execution activity while keeping partial answers, final answers and unclassified text in transcript order, without late relocation.

- Give whole-turn activity 16px spacing between prose/tool batches and below its divider, with compact nested rows and 2px child spacing, plus progress content without ordinary message action toolbars, while retaining final-answer controls and custom renderers. Add readable default tool labels and counted homogeneous batch headers, natural mixed summaries, and singular child labels for known tool names, with generic fallbacks and preserved custom templates, summaries, and execution status.

- Give completed classified turn tools muted category icons and homogeneous groups matching icons, with a neutral mixed/unknown fallback. Add per-tool registered icon overrides through `toolCall.iconName`, preserving status and visibility controls, ordinary row defaults, and live callback updates.

- Anchor grouped progress to its visible turn header so automatic collapse keeps “Worked for…” readable above the final answer, preserving manual scroll intent.

- Add per-tool descriptive action titles and a synchronous host title resolver independent of turn classification. Use titles on active rows, expose them to card summary renderers without changing card layout, and add current-action or aggregate group summaries across collapsible, summary-only and stack groups. Keep parallel/completed batches aggregate and preserve authored templates, custom renderers, attention states, and disclosure behavior.

- Add canonical tool and reasoning `layout` controls while preserving shipped `variant` aliases, authored precedence, and live resets. Add plain, inset, and panel reasoning details on the existing disclosure body, with collapsed row/inset defaults in V5 and classified turn progress, preserved V4 presentation, theme/editor preferences, and shared expansion motion.

- Align row reasoning panels with tool Request/Response details using shared subtle, borderless surfaces, 8px corners, 10px/12px internal padding, and consistent disclosure spacing. Preserve reasoning prose, structured tool typography, card framing, and authored theme overrides.

- Add shared `activity.panel` background, border color/width, radius, and padding tokens with per-property tool/reasoning panel overrides. Restyle existing details live, retain body-surface and explicit code-block/legacy precedence, and preserve independent plain/inset reasoning, approval details, and outer card frames.

- Make V5 expanded reasoning easier to read with 14px text, a 1.55 line height, and a configurable 240px inner scroll cap across layouts and appearances. Add `features.reasoningDisplay.maxHeight` for custom or unlimited height, keyboard scrolling, and live resets while preserving disclosure motion and V4 uncapped defaults.

- Share expanded activity overflow controls through `activity.overflow` with per-property reasoning/tool overrides, 240px caps and 12px edge-aware fades in V5. Keep labels, copy controls, panel chrome and keyboard focus outside the mask; refresh on streaming, resize and live updates, and preserve V4 defaults and explicit reasoning cap compatibility.
