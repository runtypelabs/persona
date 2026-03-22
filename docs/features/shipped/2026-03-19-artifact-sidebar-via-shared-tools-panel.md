# Artifact sidebar via shared tools panel

**In this monorepo (shipped):** Persona widget artifact pane (split / drawer), SSE artifact stream handling, controller + instance-scoped `window` APIs, and the [`fullscreen-assistant-demo`](../../../examples/embedded-app/fullscreen-assistant-demo.html) example under `examples/embedded-app/`.

**Product / dashboard (spec below):** Runtype dashboard changes such as the `Artifacts` section in Configure Tools, shared config schema next to `tools`, and preview wiring—tracked here as direction; not all sections are implemented in this repository.

---

## Summary

Add a Persona-powered artifact sidebar that can render streamed `markdown` and `component` artifacts next to chat.

The validation shape is:

- Keep the current dashboard IA unchanged.
- Put artifact authoring inside the existing `Configure Tools` sheet as a new `Artifacts` section.
- Store artifact settings as a sibling config field next to `tools`, not inside `toolIds` or `toolConfigs`.
- Keep runtime transport artifact-native with dedicated SSE artifact events.
- Use the existing Persona chat previews for flows, agents, and surfaces to validate behavior.

This gives us one portable authoring surface, one portable preview surface, and a runtime model that still works for direct prompt output, tool-produced artifacts, and external artifact producers.

## Product Decisions

- Do not rename `Configure Tools` yet. The panel title and entry point stay as-is for v0 validation.
- Do not represent artifacts as normal tools or pseudo-tools.
- Do not change product embed or export IA in v0.
- Support only two artifact types initially:
  - `markdown`
  - `component`
- Flow prompts own prompt-level artifact config.
- Model-backed agents can own agent-level artifact config.
- Flow-backed agents do not duplicate artifact authoring; they inherit from the flow and only show a read-only summary or note in the agent editor.
- Artifacts are ephemeral UI state in v0 and are not restored from history.

## Dashboard UX

### Shared authoring surface

Extend the existing shared tools sheet with a new `Artifacts` section, while keeping the current entry point and layout intact.

Initial artifact controls:

- `Enable artifacts`
- `Allowed artifact types`
  - `Markdown`
  - `Component`

No additional IA changes in v0:

- no button rename
- no new top-level tab
- no separate artifact builder screen

### Where it appears

- **Flow prompt editor**: inside the existing tools sheet opened from the prompt card.
- **Model-backed agent editor**: inside the same tools sheet used by the agent editor.
- **Flow-backed agent editor**: no editable artifact controls; show a note that artifact behavior is defined by the linked flow.
- **Onboarding / playground / eval overrides**: inherit support automatically anywhere the shared tools sheet is already reused, but validation priority is the main flow and agent editors.

### Preview

Use the same Persona-powered preview panels that already exist:

- flow preview chat
- agent test chat
- surface chat preview

When the tested config enables artifacts, these previews should initialize Persona with artifact support enabled and show the artifact pane when artifact events arrive.

## Config Schema

Artifact settings live next to `tools`, not inside `tools`.

```ts
type ArtifactType = 'markdown' | 'component'

interface ArtifactConfig {
  enabled: true
  types: ArtifactType[]
}

interface PromptStepConfig {
  tools?: PromptToolsConfig
  artifacts?: ArtifactConfig
}

interface AgentConfig {
  tools?: AgentToolsConfig
  artifacts?: ArtifactConfig
}
```

Defaults:

- `artifacts` absent means artifacts disabled
- `types` omitted is not valid when `artifacts.enabled` is true
- model-backed agents may persist `artifacts`
- flow-backed agents do not persist a separate agent-level artifact config

This schema should be added in shared, dashboard, and API types without nesting artifacts under tool configuration.

## Runtime Contract

Artifacts are a first-class stream and output concept. Tools are only one possible producer path.

### Allowed producers

- prompt or model steps
- tool results
- external agents or A2A adapters
- SDK, controller, or `window`-triggered events

All producers normalize to the same artifact event stream before reaching Persona.

### SSE events

Supported event types:

```ts
type ArtifactEvent =
  | { type: 'artifact_start'; id: string; artifactType: 'markdown'; title?: string }
  | { type: 'artifact_delta'; id: string; delta: string }
  | {
      type: 'artifact_start'
      id: string
      artifactType: 'component'
      title?: string
      component: string
    }
  | { type: 'artifact_update'; id: string; props: Record<string, unknown>; component?: string }
  | { type: 'artifact_complete'; id: string }
  | {
      type: 'artifact'
      id: string
      artifactType: 'markdown' | 'component'
      title?: string
      content?: string
      component?: string
      props?: Record<string, unknown>
    }
```

Rules:

- `markdown` uses `artifact_start` + `artifact_delta` + `artifact_complete`, or one-shot `artifact`
- `component` uses `artifact_start` + `artifact_update` + `artifact_complete`, or one-shot `artifact`
- `artifact_delta` is only for `markdown`
- `artifact_update` is only for `component`
- artifact events are not turned into assistant transcript text
- if a tool produces an artifact, the runtime emits artifact events; the client should not need to know it came from a tool
- if Persona receives artifact events while artifact support is disabled, it ignores them

## Persona Widget

Add optional artifact support to Persona behind a feature flag.

### Widget behavior

- `features.artifacts.enabled` gates the sidebar
- desktop: split chat + artifact pane
- mobile: slide-over artifact drawer
- new artifacts auto-open and auto-select by default
- `clearChat()` also clears artifacts
- raw artifact events remain visible in the event stream inspector

### Rendering

- `markdown`: render with the existing markdown pipeline
- `component`: resolve through the existing component registry
- unknown component renderer: show a fallback inspector card with the component name and props JSON instead of failing

### Manual APIs

Expose matching manual triggers for validation and SDK parity:

- controller methods:
  - `showArtifacts()`
  - `hideArtifacts()`
  - `upsertArtifact(...)`
  - `selectArtifact(id)`
  - `clearArtifacts()`
- instance-scoped `window` events with the same capabilities

These APIs are additive and only act when artifact support is enabled.

## Preview and Example

- Reuse existing Persona-based dashboard previews instead of creating a new preview UI.
- Add a dedicated embedded-app example page that demonstrates:
  - streamed markdown artifacts
  - streamed component artifacts
  - controller-triggered artifacts
  - `window` event-triggered artifacts

The example should include:

- one registered demo component renderer
- one unknown component example to verify fallback rendering

## Test Plan

- Widget tests for:
  - artifact store add, update, select, and clear behavior
  - `clearChat()` clearing artifacts
  - desktop split pane and mobile drawer behavior
  - registered and unregistered component rendering
  - controller and `window` artifact APIs
- Stream parsing tests for:
  - `artifact_start` / `artifact_delta` / `artifact_complete`
  - `artifact_start` / `artifact_update` / `artifact_complete`
  - one-shot `artifact`
  - ensuring artifacts do not become assistant message text
- Dashboard tests for:
  - shared tools sheet reading and writing sibling `artifacts` config
  - flow prompt persistence
  - model-backed agent persistence
  - flow-backed agent read-only artifact summary behavior
- Preview tests for:
  - flow preview chat showing artifacts
  - agent test chat showing artifacts
  - surface preview showing artifacts when supported

## Assumptions and Defaults

- v0 keeps the current IA and button labels unchanged.
- Artifact config remains intentionally small for validation: enable or disable plus allowed types only.
- Runtime remains artifact-native even when artifacts are produced by tools.
- No history persistence, DB storage, or conversation restore for artifacts in v0.
- No product embed-code or shipping UI updates in v0.
- External or A2A artifact preservation is a follow-on integration task unless already emitting compatible artifact events.
