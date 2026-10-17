# Config schema developer-experience plan

Status: stages 1–3 implemented, 2026-10-13. Stages 4–5 remain optional proposals and are outside this implementation. Builds on [Phase 13](phase-13-replacement-plan.md) and the bounded [Phase 14 showcase audit](phase-14-showcase-audit.md). Existing integrations, aliases, precedence, and V4/V5 behavior remain the compatibility baseline.

## Recommendation

Make the existing schema easier to learn before changing its shape. Deliver stage 1 first: a short task-based entry guide, consistent modern reference/AI help, and searchable editor labels that show the actual config paths. Then improve editor exports and explain patch policy. Token diagnostics and a JSON reset adapter are separate optional projects, justified by observed authoring failures rather than required to finish the documentation work.

Do not add a second shallow styling API, rename existing component fields, or introduce normalization aliases for every inconsistency. `brand` already supplies the compact path for coordinated styling; semantic tokens supply shared design intent; component tokens provide precise exceptions. Keep those three levels and teach when to stop at each.

The recommended work is small-to-medium overall, principally documentation/editor work with modest compatibility risk. Implementing every optional stage would become medium-to-large work because validation, serialization, provenance and public types need coordinated review. These are independently reviewable stages, not one schema rewrite.

## Existing behavior and concrete evidence

| Finding | Current code/evidence | Implication |
| --- | --- | --- |
| An easy path already exists | [BrandConfig](../packages/widget/src/types/theme.ts), [brand derivation](../packages/widget/src/utils/brand.ts), and the [reference quick start](../packages/widget/THEME-CONFIG.md). [Active theme resolution](../packages/widget/src/utils/theme.ts) layers brand beneath explicit theme/dark overrides. | Lead with a few brand inputs; add semantic or component overrides only for the task. Brand is not a complete bespoke layout API. |
| Modern ownership is more scoped, but deeper | `ControlTokens`, `VoiceTokens`, `ApprovalTokens`, `AskUserQuestionTokens`, and artifact groups in [theme types](../packages/widget/src/types/theme.ts). | Organize learning around tasks and surfaces; expose paths in editor search. Depth alone does not justify another alias tree. |
| Naming conventions differ | `foreground`, approval `titleColor`, artifact toolbar `iconColor`; voice `recording.indicator` versus `processing.icon`; nested voice states versus `pill.selectedBackground`; `composer.send` versus `button.stop`. `ComponentTokenSet.border` is a color, while intro/artifact border fields accept full CSS shorthands. | Document actual value kinds and exceptions. A generic “all border fields are colors” or “all states nest” rule would be wrong. |
| Guidance is inconsistent | [theme-reference.ts](../packages/widget/src/theme-reference.ts) overview still recommends non-theme appearance options. The README, package reference, migration guide, editor metadata and AI/WebMCP help provide different entry routes. | Align their introductory guidance and bounded examples, without turning historical migration fixtures into fresh authoring examples. |
| Precedence intentionally differs | [style migration guide](style-migrations.md): explicit legacy style wins over modern component style; modern `welcome.*` wins over old welcome copy. [Style provenance](../packages/widget/src/utils/style-provenance.ts) tracks only a bounded registry. | Publish two explicit rules. Changing precedence for symmetry would break integrations. Provenance must never be inferred from equality with a default. |
| Live updates differ from fresh config | [config-merge.ts](../packages/widget/src/utils/config-merge.ts) recursively merges ordinary objects; arrays/functions replace; ten designated object paths replace. Own `undefined` resets and omitted keys retain values. [defaults-provenance.ts](../packages/widget/src/utils/defaults-provenance.ts) handles inherited defaults. | Teach fresh config, mounted patch and editor snapshot as distinct operations. JSON drops undefined and symbols; it cannot preserve the current reset/origin contract. |
| Types do not fully encode update policy | [AgentWidgetConfigPatch](../packages/widget/src/types.ts) comment explicitly acknowledges that runtime replace-object exceptions are not encoded in its recursive type. | Improve guidance first; stricter types need compatibility review and compile-time consumer fixtures. |
| Editor snapshots are not sparse authoring exports | [ThemeEditorState](../packages/widget/src/theme-editor/state.ts) keeps authored inputs privately, but `exportSnapshot()` returns resolved config/theme. History intent also uses an in-memory WeakMap. [Showcase state](../apps/web/src/theme-configurator/state.ts) serializes selected runtime fields; [code generation](../packages/widget/src/utils/code-generators.ts) has format-specific hook handling. | Preserve snapshot/undo contracts. Any sparse export must use recorded author input and handle imported configs conservatively. |
| Token references remain permissive strings | `TokenReference<T> = string` in [theme types](../packages/widget/src/types/theme.ts). [resolveTokenValue](../packages/widget/src/utils/tokens.ts) interprets `palette.`, `semantic.` and `components.` prefixes; `validateTheme` currently checks top-level sections, not every reference. | Better hints and optional validation can catch mistakes without rejecting raw CSS, custom palette keys, or plugin tokens. |

## Stage 1 — one clear authoring entry point (do first)

**Deliverable:** a concise configuration guide linked from the README, package reference, migration guide and theme configurator. Use the existing APIs; no new helpers, aliases, renderer behavior or defaults. Update published reference/editor help so AI consumers receive the same advice.

Present three progressively scoped recipes:

1. A minimal fresh widget: endpoint, welcome title, starter items and two brand inputs. Clearly label whether defaults are current or V5; do not silently opt users into future defaults.
2. A shared design adjustment through `theme.semantic`, with a light/dark example and explicit inheritance explanation.
3. One exact control override through `theme.components`, including `composer.send` and the existing `button.stop` path together. Link advanced surface recipes instead of expanding this into an exhaustive object.

Add a “where does this setting belong?” map: welcome/copy for content and labels; suggestions for items/presentation/action; features/provider groups for behavior; layout/launcher for composition/mount geometry; brand/theme/darkTheme for visual styling; render hooks/slots for custom UI. Describe actual exceptions rather than claiming every visual value already lives under theme. Pair difficult ownership cases: suggestion placement versus chip styling, microphone provider versus state color, artifact layout/resizing versus pane chrome.

Add one small update table: omitted retains; own undefined resets; arrays/functions replace; ordinary objects merge; designated objects replace. Name all current replacement paths: `headers`, `agent`, `storageAdapter`, top-level `components`, `targetProviders`, `voiceRecognition.provider.custom`, `features.artifacts.display`, `features.streamAnimation.plugins`, `preferences`, and `welcome.icon`. Distinguish top-level custom-renderer `components` from recursively merged `theme.components`.

Link the existing migration guide for full precedence/reset examples. Explain both welcome and legacy style precedence, JSON limitations, intentional `[]`/`false` values, and unknown-origin imports. Label minimal recipes “fresh configuration”; label exhaustive objects “reference” or “resolved preview,” never “minimal setup.” Fewer supplied inputs are safe; removing inputs because they equal today's defaults is unsafe.

**Files:** proposed `docs/configuration.md`; `README.md`; `packages/widget/THEME-CONFIG.md`; `docs/style-migrations.md`; `packages/widget/src/theme-reference.ts`; descriptions/help in `packages/widget/src/theme-editor/sections.ts` and `theme-editor/webmcp/tools.ts`; showcase linking/search in `apps/web/src/theme-configurator/`. Preserve the uncommitted Phase 14 changes and build on their migration links.

**Acceptance:** a developer can find “change brand,” “style send/stop,” “hide welcome,” “move starters,” and “clear an old style” from the README or editor; every recipe uses real typed paths; fresh examples prefer modern fields; compatibility tables still explain supported legacy behavior. AI overview no longer directs new styling to migrated legacy fields. Editor labels show human names and their real paths, including value kind for ambiguous border fields. No new paths or silent runtime changes.

**Checks/release:** compile the small recipe fixtures against exported types; focused theme-reference/editor metadata tests verify paths and V4/V5 hints; exercise the existing migration lab for mixed/cleared overrides. Reuse existing runtime coverage rather than adding tests that merely snapshot prose. Build/typecheck the touched packages/showcase and run applicable lint. Docs/showcase alone need no changeset; published reference/editor source or type comments require a widget patch changeset. Size: small-to-medium; risk: low. This is the first implementation slice to authorize.

## Stage 2 — make copied editor config explainable (after stage 1)

**Deliverable:** distinguish “copy authored overrides” from existing editor backup/resolved-preview exports. Keep snapshot version 2, undo/redo, preset application and existing `generateCodeSnippet` signatures stable. First audit which showcase export paths retain authored input; do not assume the resolved `getConfig()` has recoverable origin.

For fresh editing, copy only genuinely supplied inputs, then edits, in both theme groups, including brand, future-defaults choice, content, explicit false/empty values and behavior. Do not use a value-equals-default pruning algorithm. For an imported resolved/unknown-origin snapshot, keep its supplied fields explicit; mark the result as imported configuration and explain that minimization requires a deliberate re-authoring choice. Do not automatically clear legacy overrides or translate every imported alias. Removing a legacy override is a separate visible migration action.

Provide format-specific notes when functions/renderers are omitted. Existing JavaScript hook generation can retain supported self-contained hooks; JSON cannot carry closures or functions. A copied fresh config is not a live reset patch. Avoid exporting origin symbols or private history metadata.

**Files:** `theme-editor/state.ts`, `theme-editor/types.ts`, `theme-editor/index.ts` only if an additive authored-export method is necessary; showcase state/output modules; code-generators only where verified format omissions need correction. Use the existing entry points, not a new package or serialization framework.

**Acceptance/tests:** export/reimport a fresh brand plus one component edit in V4/V5 and light/dark; retain explicit default-equal values, `[]`, `false`, callbacks in memory and unknown-origin legacy imports; verify undo/redo and backup snapshots remain compatible; confirm export does not turn default-filled legacy styles into fresh explicit opinions. Generated snippets are parsed/compiled and representative output is mounted, rather than tested solely by string containment.

**Release/size/risk:** showcase UI-only work has no changeset; package behavior fixes are patch; a new public authored-export method is minor. Medium effort/risk because materialized defaults and authored intent coexist. Do not promise sparse output for provenance that was already lost.

## Stage 3 — expose patch replacement policy without breaking callers (implemented)

**Deliverable:** make the stage 1 policy table authoritative and add path-specific JSDoc/editor hints to the replacement-object fields. In particular, `agent`/custom provider implementations must be complete replacements; sparse `preferences` is the host's complete opinion; `welcome.icon` cannot splice discriminated variants. Add a bounded shared internal policy list only if it removes verified duplication; avoid a universal runtime schema registry.

Assess path-aware types against real consumer fixtures before changing `AgentWidgetConfigPatch`. Tightening today's type can reject source that currently compiles, even though runtime semantics stay the same. Prefer an optional stricter authoring type only if consumers need it; do not add one by default merely to make the types look uniform. No runtime merge-policy changes are proposed.

**Files/tests:** `types.ts`, `utils/config-merge.ts`, associated tests and editor field help. Compile positive/negative examples for full agent/provider/icon replacements; verify all ten paths replace without stale keys while `theme.components` and normal feature objects retain siblings. Test parent reset and boolean/object transitions in both defaults modes. Existing `config-merge.test.ts` already covers much of this; add only gaps.

**Release/size/risk:** JSDoc/internal alignment is patch with widget changeset; any additive public strict type is minor; reject an unannounced narrowing of the existing patch type. Small effort for guidance, medium if types change. Depends on stage 1's exact semantics, not stage 2 exports.

Stage 3 verified that the guide and `REPLACE_LEAF_PATHS` agree on all ten paths. The guide now gives each path's replacement contract; field JSDoc explains whole-object replacement versus sibling merging. Following design review, the visual editor keeps plain-language help; technical guidance remains in the guide, autocomplete, and advanced export links. Inline field paths are removed while exact-path search remains available. Existing patch types remain unchanged. Full agent/provider/icon field types provide opt-in completeness checks through `satisfies`; compiled consumer fixtures accept complete replacements, reject incomplete full values and confirm that existing sparse patches still compile. No stricter type or shared schema registry was needed.

The existing V4/V5 merge suite already covered headers, storage adapters, preferences, artifact display and stream plugin maps, ordinary merges and boolean/object transitions. Stage 3 fills the agent/custom-provider/renderer-registry/target-resolver gaps, exercises icon object/function transitions in both defaults modes, checks parent resets and contrasts top-level renderer replacement with `theme.components` sibling retention. The artifact-display fixture now actually uses the selected V4/V5 defaults. Runtime merge code changes only by adding a guide cross-reference. The guide also distinguishes merge policy from activation lifecycle: persistence captures its active storage adapter at mount time and requires a remount to change it. Published comments/editor help have a widget patch changeset.

## Stage 4 — optional targeted token diagnostics

Proceed only if the improved editor/reference still produces frequent unresolved-reference mistakes. Add editor/import checks first for known reference prefixes, missing targets and cycles, using the fully layered active theme with custom palette/plugin contributions. Errors should report the supplied path and target; raw CSS strings, CSS variables and custom token names remain valid. Existing permissive types and runtime rendering remain supported. Do not claim `TokenReference<'color'>` validates a color today.

If runtime warnings are needed, reuse the existing `debug: true`, per-widget once-per-path lifecycle in [legacy diagnostics](../packages/widget/src/utils/legacy-diagnostics.ts), with separate diagnostic codes. No production console noise or values/secrets in messages. Cycle handling in the resolver, if changed, is a separately reviewed correctness fix with explicit fallback semantics.

**Files/tests/release:** `utils/tokens.ts`, theme validation types only as needed, editor import/WebMCP help, focused token/diagnostic tests. Cover missing reference, cycle, custom palette key, raw CSS, plugin target, dark inheritance and repeated widget updates. Patch for bounded fixes/editor metadata, minor for a new public diagnostics capability. Medium effort/risk; a complete JSON Schema or type-level CSS/reference validator is out of scope.

## Stage 5 — optional JSON-compatible reset adapter

There is a real limitation, but stage 1 can document it accurately without a new API. Implement this only for a concrete JSON-fed mounted-widget/editor integration. JSON fresh configuration already works when omitted fields should remain absent; it is not a reset operation.

**Candidate, not approved API:** an additive pure utility `createConfigUpdatePatch({ patch, resetPaths })` that produces the existing JavaScript `AgentWidgetConfigPatch`. A caller could JSON-transport this envelope, then call `widget.update(createConfigUpdatePatch(envelope))`. The controller's `update()` signature remains unchanged. Example reset list: `['launcher.closeButtonColor']`, with the new theme supplied in `patch` for a single atomic update. Naming/export destination must be settled before implementation; do not add a reset tree under theme or treat null as undefined.

Required contract before shipping:

- Omitted paths retain values; reset removes an explicit override so active theme/brand/defaults become visible. A parent reset clears tracked descendants, just like own undefined today. Clearing `theme` does not clear brand. False, empty lists and empty strings retain their existing meanings.
- Reset and patch paths that overlap, including parent/descendant overlap, are rejected before updating; sibling paths can coexist. Duplicates are harmless and normalized. No order-dependent partially applied update.
- Reset paths are bounded to documented config paths. Reject empty/unknown paths, prototype keys (`__proto__`, `prototype`, `constructor`) in any segment, array indices, arbitrary custom-map descendants, and traversal through implementation/function objects. Arrays/maps/implementations reset or replace as a whole. Use own-key checks and immutable construction; invalid input never mutates config or provenance.
- Adapter-generated own undefined must flow through `mergeConfigUpdate` and existing default/style/panel provenance. Do not write directly to controller state or attempt to serialize provenance. Externally resolved values remain conservative unless explicitly reset.
- Functions cannot be transported in JSON. Existing callbacks omitted from the envelope remain in the mounted widget; intentional callback reset needs a documented allowed path. The adapter neither evaluates code nor reconstructs hooks. This is a local config operation, not a remotely authorized configuration service.

**Acceptance/tests:** JSON stringify/parse round-trip, one-update legacy clear plus theme application, light/dark/V4/V5 parent resets, arrays/maps as whole values, callback preservation, frozen inputs, overlap/unknown/prototype rejection, and matching provenance after alias reset/rebuild. Replay on a mounted widget without clearing conversation/draft/approval state. Test atomic validation failure. A finite known path policy must cover the agreed scope without accidentally becoming a validator for the entire public config.

**Files/release/size/risk:** a utility beside `utils/config-merge.ts`, public export/type if approved, focused tests and docs/editor consumer. Minor widget changeset for additive public API; no proxy changes. Medium-to-large effort/risk. Depends on agreed patch policy and the concrete consumer, not on renaming theme fields. Do not include it in stage 1.

## Future conventions and decisions

For new APIs, prefer `background`/`foreground` for paired surface colors, named text roles for independently styled text, consistent nested states when introducing a whole new stateful component, `borderColor`/`borderWidth` for separate properties, and explicitly documented CSS shorthand fields. Reuse established conventions inside existing groups rather than creating both old/new spellings. Existing `button.stop`, voice state names, selected pill fields and approval/artifact names stay where they are; a future major migration requires proven benefit and a separate removal decision.

Reject for this effort: flattening all component tokens, moving behavior/content under theme, silent precedence reversal, null reset sentinels, a second stop-style tree, guessing intent by default equality, automatic conversion of unknown-origin imports, and exhaustive alias proliferation. Defer a full machine-readable config schema and stronger token-reference type system until there is a consumer and maintenance owner.

Stage 2 uses the additive public `exportAuthoredConfig()` method alongside showcase UI. Remaining decisions are confined to later stages: which concrete consumer warrants token diagnostics or JSON reset, and the reset adapter's allowed path scope. Keep the remaining first-party migration inventory separate; migrate each coherent example group with its existing visual/integration checks.

## Verification boundary

Stages 1–3 implement the [configuration guide](configuration.md), aligned published reference/editor help and real-path discovery. The headless editor adds `exportAuthoredConfig()`; code generation adds an opt-in `authoredOverrides` mode. Fresh showcase state supplies only the endpoint; preview fixtures stay separate. Imported backups/configurations remain explicit and are labeled imported. Snapshot version 2 and existing generator defaults remain available. A widget minor changeset covers the additive APIs and published help.

Verification includes authored light/dark round-trips in V4/V5, explicit default-equal/false/empty values, callbacks in memory and undo/redo, conservative legacy imports, six-format generated-code evaluation/escaping, guide and ESM/React compilation against public types, representative generated-code mounts, metadata/search checks, and existing showcase/migration-lab tests. Direct package/showcase typechecks, lint and builds are checked separately from the known upstream generated-contract drift in root typecheck; no unrelated contract is regenerated. Existing uncommitted Phase 14 work is retained. Stage 3 additionally checks focused merge/welcome/custom-voice/editor tests, compiled public replacement fixtures, direct widget TypeScript and relevant lint without regenerating upstream contracts. No commits, pushes or branch creation are part of this implementation.
