# Phase 13: replacement coverage and staged deprecation

Status: implemented, 2026-10-13. Based on the [deprecation audit](phase-13-deprecation-audit.md) and consuming code at `069eb867`. All nine slices are implemented; no API removals are scheduled. See [the migration guide](style-migrations.md) and `/style-migration.html` in the showcase for executable baseline/legacy/theme comparisons.

## Completion evidence

- Full widget suite: 4,934 tests across 293 files. Showcase suite: 267 tests across 36 files.
- Widget/proxy builds, lint, direct TypeScript checks for widget/proxy/showcase, and diff checks pass. The standard root typecheck still stops before TypeScript because the fetched upstream OpenAPI schema differs from the existing generated contract; this unrelated generated contract was not changed.
- Browser computed-style checks verified V4/V5 controls, microphone sizing and states, tool card/row padding, light/dark values, and clearing the comparison overrides. Integration tests cover live patches, explicit-undefined resets, automatic color-scheme changes, approval/question state, artifact pane identity/chrome, and scoped diagnostics through widget rebuilds.
- Main: **162.36 KiB Brotli**, versus the previous 159.32 KiB baseline (about +3.04 KiB). Launcher: **19.16 KiB**, still under 20 KiB. CSS: **20.71 KiB**, versus 20.65 KiB (about +0.06 KiB). Approval UI remains lazy at 8.62 KiB. Shared control recipes removed duplicate construction/update code; no runtime dependencies were added.
- The budget adjustment is explicit: main 160 → **163 KiB**, CSS 20.7 → **20.8 KiB**; the launcher budget is unchanged. The bounded provenance and debug diagnostics are retained rather than weakening compatibility to meet the previous cap.
- Minor/patch changesets cover additive styling, compatibility, export fixes and diagnostics. Existing aliases, callbacks, presets and public builders remain supported. Phase 14 is the broader migration/showcase work; removal requires a separate major-release decision.

## Outcome and scope

Give each useful legacy style a working, independently scoped theme replacement before deprecating it. Existing integrations keep their behavior throughout 4.x, with either value of `future.v5Defaults`. V5 removal is a separate release decision, not the automatic consequence of finishing this work.

Start with the export/demo defects, then narrow verified deprecations, then add replacement coverage in small slices. Every replacement slice includes its consumers, live-update handling, editor/export support, documentation, and parity tests. Do not defer those pieces to Phase 14: otherwise the new API would be incomplete. Phase 14 remains the broader showcase and migration presentation work.

Keep widget presets, the public approval builder, custom renderers, callbacks, icons, labels, accessibility, layout selection, provider settings, and behavioral controls. Theme tokens should style existing capabilities; they should not absorb unrelated behavior.

## Compatibility foundation

### Preserve origin without replacing the config architecture

`defaults.ts` materializes legacy styles; `utils/config-merge.ts` merges patches and restores defaults; `utils/defaults-provenance.ts` already carries versioned-default intent; `utils/panel-config.ts` separately tracks width aliases. Extend these existing patterns with a **bounded style-alias path registry**, not a generic recursive config framework.

Record the origin of only fields involved in this migration before defaults are applied. Preserve that metadata through `mergeWithDefaults`, `mergeConfigUpdate`, runtime rebuilds, and the code paths that intentionally copy resolved config. Leave public legacy values in the resolved config so plugins still receive them. The renderers should ask the bounded helper whether a legacy value was host-supplied instead of treating materialized defaults as host intent.

For newly supported style migrations, resolve each CSS property in this order:

1. Explicit legacy override, using that field's existing normalization and mode restrictions.
2. Explicit component theme value, including the active dark override.
3. Existing shared component/semantic fallback and the current V4/V5 default.

Do not change existing aliases whose precedence differs: welcome's new fields still win over old copy fields, for example. Empty string, `0`, `false`, `none`, and `transparent` are not interchangeable; record intent independently of the renderer's historical value handling.

Live-update contract:

- An omitted patch key retains its prior value and origin.
- An own `undefined` clears that override and its origin, exposing the active theme or default again.
- Clearing a parent clears its tracked descendants.
- Theme updates and light/dark or V4/V5 switches must not resurrect an old inline override.
- A config returned by Persona's own merge helper retains origin metadata when reused through supported copying paths.
- A manually default-merged or JSON-round-tripped external config has unknowable origin. Conservatively treat its present values as explicit; do not guess by comparing with defaults. Document that consumers must remove/reset the old fields to allow the theme to win. Test this fallback explicitly.

Preserve field-specific side effects during migration. For example, explicit send colors currently provide an idle microphone fallback. Removing them requires either setting the matching microphone theme value too or consciously choosing independent styling; a send-only migration is not exact parity for that configuration.

### Share small style recipes at existing renderer boundaries

Use narrow pure helpers for header controls, composer controls/voice state, approval styling, and artifact chrome. Share these between initial construction and update paths; do not build a universal renderer or collapse all controls into one global token group. CSS variables remain the theme transport, allowing dark-mode switching without hardcoding resolved colors into DOM styles.

`components/header-parts.ts` already has a common header-button builder; extend it with a close/clear role. `components/composer-parts.ts` builds send and mic controls, but `ui.ts` also changes their styles during state transitions and updates. Both must call the same corresponding recipe. `components/activity-row.ts` reuses tool-card content and changes classes, so style both variants through the existing shared tool path.

New optional tokens emit nothing when absent and use today's fallback. Existing publicly emitted but unused voice/approval tokens require extra care: their materialized defaults must **not** suddenly recolor ordinary widgets. Carry bounded explicit-theme-path intent from the actual host theme inputs (before built-in dark/default layers) into internal consumer aliases for these previously unused paths. Keep existing public variable emission intact. Only an explicit host value activates the new consumption; absent values retain each renderer's current fallback. Hosts already setting an ineffective token will see the requested styling start working; call this out as a wiring fix.

Reuse theme merge/resolution rather than resolving token references inside every renderer. Preserve base-theme versus dark-theme precedence and remove stale consumer aliases when a host resets a token. Do not introduce this explicitness mechanism for tokens that already work normally.

## Proposed public theme surface

Paths below are relative to `theme.components`; the same paths work in `darkTheme.components`. These optional additions are now implemented. Prefer existing component groups and CSS shorthand padding over duplicating every X/Y legacy property. All added leaves are optional. Color leaves accept the normal token references; size/padding/border-width/stroke/timing leaves use strings with the documented units.

### Independent controls and voice

Use one small reusable TypeScript shape for the supported control leaves, without introducing a new global public theme group:

`size`, `iconSize`, `iconStrokeWidth`, `background`, `foreground`, `borderColor`, `borderWidth`, `borderRadius`, `padding`.

Expose only the applicable leaves at:

| Proposed path | Ownership and existing fallback |
| --- | --- |
| `header.close` | Close control only; falls back to existing header control tokens. |
| `header.clear` | Clear-chat control only; does not recolor Messages or trailing actions. |
| `composer.send` | Submit control only; falls back to shared composer sizing and current primary/accent rules. |
| `voice.control` | Idle mic box, glyph, and chrome; falls back to shared composer sizing and the historical idle palette. |

Keep `composer.sendIconSize` and `composer.sendButtonRadius` working as shared/older defaults beneath the new send-specific leaves. Keep existing `button.stop` state tokens; do not introduce a second stop-style tree. Preserve their current precedence against explicit legacy send colors. Document icon-mode sizing and text-mode padding separately: legacy send padding is ignored in icon mode and legacy send background is ignored in text mode. A new send theme background can intentionally style text mode, but that is an opt-in capability, not proof that the formerly ignored legacy field had an effect.

For mic migration, legacy `voiceRecognition.iconSize` sets both box and glyph. Exact migration sets **both** `voice.control.size` and `.iconSize`; the new fields may intentionally separate them. Normalize built-in SVGs to `currentColor` so idle hardcoded SVG strokes cannot defeat state foregrounds. Preserve custom icon/render contracts.

Complete the existing voice state groups instead of renaming them:

- `voice.recording.indicator/background/border`: use the existing keys for recording glyph/fill/border.
- `voice.processing.icon/background`: wire existing keys; add optional `.border`.
- `voice.speaking.icon`: wire existing key; add optional `.background` and `.border`.

Keep historical recording/processing/speaking and barge-in fallbacks when these values are absent. A border color does not imply a new visible border width. Browser dictation and hosted/custom voice paths should use the same state-style helper, while provider lifecycle, animation eligibility, interruption policy, icon identity, and accessibility labels remain unchanged. Verify idle restoration and theme switching during a state, not just entering the state once.

### Tool cards and rows

Extend `toolBubble`, which already owns `shadow` and activity tokens:

- `background`, `borderColor`, `borderWidth`, `borderRadius`.
- `header.background`, `.foreground`, `.padding`.
- `content.background`, `.foreground`, `.padding`.
- `codeBlock.background`, `.foreground`, `.borderColor`.
- `toggleForeground`, `labelForeground`.
- `loading.primary`, `.secondary`, `.duration` (CSS duration; legacy numeric milliseconds convert explicitly).

Do not use shared markdown code tokens or global collapsible colors as substitutes for tool-only styling. Preserve existing `activity.bodyPadding` and `toolBubble.bodyPadding` fallback behavior beneath the new specific content padding. Both card and row variants consume the new values without changing their unconfigured geometry. Legacy one-axis padding overrides must override only that axis, allowing the other axis to use the theme shorthand.

### Approval and question sheets

Keep `approval.requested.background/border/shadow`, `approval.approve`, and `approval.deny`. Wire existing requested text and approve/deny foregrounds with explicitness protection described above. Add:

- `approval.requested.titleColor`, `.descriptionColor`, `.reasonColor`.
- `approval.requested.parameters.background`, `.foreground`.

Specific text colors fall back through the requested text consumer override, then the current element-specific fallback. The built-in plugin and exported `createApprovalBubble` share the mapping/normalization, **not their public integration contracts**. Do not homogenize their current default deny colors: explicit new values should converge; absent values preserve each builder's present appearance. Both paths must support update/restoration where their APIs permit it.

Add `askUserQuestion` to `ComponentTokens` with exactly the existing nine capabilities:

- `sheet.background`, `.border`, `.shadow`.
- `pill.background`, `.foreground`, `.borderRadius`.
- `pill.selectedBackground`, `.selectedForeground`.
- `customInput.background`.

Map these through the existing `--persona-ask-*` consumers in `components/ask-user-question-bubble.ts` and CSS. Existing local `features.askUserQuestion.styles` variables remain highest priority. Layout, grouped navigation, labels, expose/enabled flags, and slide timing stay in feature config. No new theme-level layout API is needed.

### Artifact-specific chrome

Extend the existing artifact tree:

| Proposed path | Replaces the corresponding legacy layout style |
| --- | --- |
| `artifact.pane.padding/borderRadius/shadow/border/borderLeft` | Pane padding/radius/shadow/full border/left border. `border` and `borderLeft` are full CSS shorthands. |
| `artifact.chat.shadow` | Chat-only shadow in a split. |
| `artifact.split.outerRadius` | Welded outer radius, preserving current pane/panel fallback. |
| `artifact.toolbar.iconColor` | Document toolbar base icon color, distinct from hover and copy. |
| `artifact.toolbar.toggleActiveBackground/toggleActiveBorderColor/toggleActiveColor` | Active document view/source toggle. |
| `artifact.tab.fadeSize` | Fade width only. |

Keep existing `artifact.pane.background`. Preserve full-border-over-left-border precedence, detached versus welded behavior, and drawer behavior. Theme values must enter `utils/artifact-gate.ts`'s class/variable decisions and `ui.ts`'s welded-radius computation; emitting a variable alone will not activate the current border classes. Separate theme-owned values from temporary legacy override variables so an artifact disable/reset cannot delete a valid theme value. Clear every owned override on reset, including active toggle foreground.

Keep pane geometry, resizing, appearance mode, chatSurface, toolbar presets, and fade enablement in layout configuration. New chrome tokens do not change artifact loading or move lazy UI code into the main entry.

### Suggestions and known no-ops

Use existing `suggestion.chip.fontWeight` and `.padding`. Fix provenance so inherited legacy `500`/`6px 12px` does not defeat an explicit theme value, while explicit legacy input still wins and unconfigured V4/V5 visuals remain identical. Clearing one axis reveals the theme for that axis; clearing the entire legacy object restores theme control. Test chip/card/list and future-default toggles.

`suggestionChipsConfig.fontFamily` is currently accepted but unused. Document it as a no-op; do not silently activate it. Add optional `suggestion.chip.fontFamily` only if we want the useful per-chip typography capability, with inheritance as its default and explicit token consumption. Its migration note must state that it enables styling which the old field did not apply; it is not a parity alias.

Also retain/document the existing no-ops (`unifiedSplitChrome`, unsupported layout slots) without pretending there is a style mapping. Correct stale `--cw-md-*` documentation to the actual `--persona-md-*` names. Retain the three emitted collapsible `--cw-*` aliases for compatibility; no stylesheet-usage detector is warranted.

## Independently reviewable delivery slices

Each slice must be complete and reviewable without waiting for all later slices. No runtime changes are authorized by this plan alone.

| Slice | Work | Dependencies and completion evidence |
| --- | --- | --- |
| 13.1 Export/demo correctness | Add serializable welcome/approval to all six snippet formats; preserve boolean/number values; fix the typed client-token demo theme. | First. Evaluate representative generated config, including `false`, empty strings/arrays, nested approval and welcome. Define callback/icon serialization limitations explicitly rather than silently dropping functions. Demo colors must reach rendered CSS. |
| 13.2 Verified migrations and diagnostics | Document/add hints for only the audit's proven registry; scoped debug warnings; fix supported editor paths and internal preset aliases. | After 13.1. Keep runtime precedence and aliases. No warnings on default-filled fields, no runtime removal. |
| 13.3 Intent tracking and suggestion precedence | Extend bounded provenance/merge handling; fix chip padding/weight migration and reset semantics; record theme intent for the currently unused-token paths. | Foundation for defaulted style replacements. Suggestion theme settings must survive live updates and resets in both defaults states. No general config rewrite. |
| 13.4 Independent header/send controls | Add close/clear/send theme leaves, shared initial/update recipes, editor/export examples. | After 13.3. Different values on sibling controls must stay independent; text/icon send modes, stop state, pointer hit areas and focus remain correct. |
| 13.5 Microphone and voice states | Add mic control leaves and wire state tokens through shared state recipes. | After 13.3; coordinate with send fallback from 13.4. Idle/recording/processing/speaking/barge-in work through browser and custom/hosted providers; no idle animation or default recoloring. |
| 13.6 Approval/question surfaces | Shared approval style mapping for plugin and public builder; ask-user-question tokens and tooling. | After 13.3. Explicit migrated appearance matches on both approval paths; stock appearances and all decision behavior remain unchanged. |
| 13.7 Tool chrome | Dedicated card/row/header/body/code/loading tokens and tooling. | After 13.3. Card and row variants honor identical overrides while retaining distinct defaults; no expansion/streaming behavior change. |
| 13.8 Artifact chrome | Add scoped artifact tokens and reconcile appearance/border/reset consumers. | After 13.3. Panel/seamless/detached, drawer and both color schemes work; no eager artifact download. |
| 13.9 Deprecation completion and migration review | Add each newly verified alias to the registry only after its slice passes; finish field-by-field migration examples and retain lists. | Per-slice entries can ship with their verified replacement. Final review checks the complete matrix and hands documentation/showcase work to Phase 14. No removal in this slice. |

The first diagnostic registry is the audit's bounded list: `launcherWidth`, `toolCall.shadow`, approval background/border/shadow/approve-background, artifact pane background, plus the already-deprecated welcome and follow-up aliases. Keep qualified suggestion migrations explicit about chip/composer placement. Do not warn on whole config objects or every field ending in “Color.”

## Diagnostic ownership

Use one per-widget diagnostic context containing a warned-path Set and current raw-input usage, not a module-global Set and not config-object identity. The outer `initAgentWidget` lifecycle owns it through controller rebuilds. Pass it internally to `createAgentExperience`; standalone direct experience creation creates its own context. Process raw host input/patches at the owner boundary exactly once. Inner merging must not re-scan as new host input.

For the deferred installer, prefer diagnostics when the full runtime mounts: the critical launcher emits none, does not import the registry, and does not force the full bundle to load. Thus a closed deferred launcher has no new deprecation warning until opened; document this timing. Preserve raw config intent through the handoff. Eager mounting diagnoses immediately. If public standalone builders need warnings later, explicitly design their ownership rather than emitting on module import; parity support does not require warnings from every renderer.

Warn only with `debug === true`; mark a path warned only after actual emission. Enabling debug later should diagnose currently active legacy input once. Explicit-undefined resets should not warn. Two widgets must each get their own warning; unrelated updates and layout rebuilds must not repeat it. Keep existing validation/conflict diagnostics distinct unless separately tested and intentionally consolidated.

## Validation and release criteria

Every replacement has a small mapping fixture: legacy-only, equivalent theme-only, both supplied, neither supplied, sparse update, reset, light/dark, V4/V5. Include contradictory sibling values so an accidentally shared token cannot pass. Record exceptional migrations (mic dual sizing, send-to-mic fallback, CSS units, empty-string normalization, suggestion placement) instead of claiming one-to-one equivalence.

Focused tests live next to existing `config-merge`, `tokens`, `header-parts`, `composer-parts`, `suggestions`, `approval-actions`, `approval-bubble`, `ask-user-question-bubble`, `tool-bubble`, `artifact-gate`, code-generator and runtime tests. Use provider fakes for voice state transitions. Test host patches, internally merged config, external default-filled config, layout rebuilds, standalone builders, and plugin visibility of supported legacy fields.

Use browser computed-style and screenshot checks for actual colors, padding, radii, borders, hover/focus, theme switching and state transitions. An emitted variable assertion alone cannot establish renderer support. A compact migration comparison demo can render legacy and equivalent theme configs side by side; retain an unconfigured baseline to catch accidental default changes. Cover shadow and light DOM where inheritance is relevant.

Each replacement slice also updates `types/theme.ts`, public JSDoc, `THEME-CONFIG.md`, theme-reference metadata, editor sections, and generated snippets. Keep controls on legacy paths until their replacement actually works. Function-valued hooks remain supported and are documented separately from serializable theme export. No docs should say a renderer consumes a token until that has been checked.

Run relevant tests while developing, then required lint/typecheck/build/widget checks at integration. Use widget minor changesets for additive capabilities and patch changesets for fixes/diagnostic-only changes; docs/demo-only edits need none. Track compressed main/CSS/launcher and lazy-chunk deltas per slice. Current gates are main `<=160 KiB`, launcher `<20 KiB`, CSS `<=20.7 KiB` Brotli, with little remaining headroom. Do not silently raise gates: keep mappings compact, share actual duplicate code, preserve lazy imports, and report any unavoidable increase for review. No new runtime dependency is justified here.

## What could eventually be removed

A field is a candidate for a future major only after a released replacement reproduces its supported behavior, precedence and live-update semantics; all first-party editor/export/docs examples use that replacement; migration examples are executable; the deprecation has been communicated; and compatibility costs/benefits justify removal. Presets and the exported approval builder do not qualify simply because newer interfaces exist.

We have no reliable inventory of external configs, custom CSS, plugin consumers, or private applications. Repository searches and zero internal references cannot establish that a public API is unused. Seek release feedback and migration reports; do not invent adoption telemetry. Some inexpensive aliases may be worth retaining into V5. Removal dates, unsupported edge-value policy, and any intentional default redesign require an explicit major-release decision after this work, not an assumption in the implementation.

## Source grounding

Beyond the audit, this plan inspected `types/theme.ts` component shapes; `utils/tokens.ts` generic flattening, defaults and alias emission; `utils/theme.ts` brand/light/dark layering; `defaults.ts`; `utils/defaults-provenance.ts`; `utils/config-merge.ts`; `runtime/init.ts` raw update/rebuild boundaries; `components/header-parts.ts`; `components/composer-parts.ts`; `ui.ts` voice-state mutations; `components/suggestions.ts`; `components/tool-bubble.ts`; `components/activity-row.ts`; both approval renderers; `components/ask-user-question-bubble.ts`; `utils/artifact-gate.ts`; and `scripts/check-size.mjs`. No implementation tests were run for this planning-only document.
