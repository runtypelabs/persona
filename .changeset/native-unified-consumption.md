---
"@runtypelabs/persona": major
---

Persona 4.0: the widget now consumes the neutral 33-event unified SSE vocabulary natively off the wire.

- The dispatch handler renders unified events (`execution_*`, `turn_*`, `step_*`, `text_*`, `reasoning_*`, `media_*`, `artifact_*`, `tool_*`, `approval_*`, `await`, `source`, `error`, `ping`, `custom`) directly — no legacy-wire translation bridge, no `events` config, no `?events=` query param, no `partId` segmentation.
- **Agent path** and **flow path** both supported on the unified wire. Assistant bubbles segment on the **text block id** (`text_start`/`text_complete`), sealed at every tool/media/approval/await boundary. Flow prompt-step text continues to run through the streaming structured-content parser (structured-output flows keep their UX); `step_complete.result.response` reconciles the authoritative final, `execution_complete.finalOutput` finalizes.
- **Nested flow-as-tool attribution.** Text/reasoning blocks carrying `parentToolCallId` (a flow running as a tool) are routed into the parent tool's row (`agentMetadata.parentToolId`) instead of the top-level assistant channel.
- Reflection folds to `reasoning_complete{ scope:"loop" }`; skills fold to `tool_complete{ result.kind }`; iteration is a denormalized field. Recoverable `error` is non-terminal; `execution_error` is terminal. `text_complete`/`reasoning_complete` now carry the assembled `text` (consumed without double-counting deltas).
- Adds `scope?: "turn" | "loop"` to `AgentWidgetReasoning` so loop-level reflections stay distinguishable from per-turn thinking.

The version bump is what arms the API's unified-by-version default via the `X-Persona-Version` header. Requires the Runtype API resume/unified support to be live in production before release.
