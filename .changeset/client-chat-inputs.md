---
"@runtypelabs/persona": major
"@runtypelabs/persona-proxy": major
---

Support Runtype `/v1/client/chat` `inputs` for per-turn template variables, artifact reference cards in the transcript, and related stream handling.

**`@runtypelabs/persona`**
- `AgentWidgetRequestPayload` and `ClientChatRequest` accept optional `inputs`
- Client-token dispatch sends `inputs` in the chat request body alongside optional `metadata`
- Artifact stream events (`artifact_start` / `artifact_delta` / `artifact_update` / `artifact_complete`) drive an inline **`PersonaArtifactCard`** message in the transcript (streaming → complete), including accumulated markdown on the card when the artifact is markdown
- Tool-call UI for `emit_artifact_markdown` and `emit_artifact_component` is suppressed so artifacts are not duplicated as tool rows
- `AgentWidgetSession.getArtifactById(id)` returns the current `PersonaArtifactRecord` for a sidebar or custom UI
- Faster transcript morphing via message fingerprinting when reconciling assistant bubbles

**`@runtypelabs/persona-proxy`**
- Flow dispatch forwards client `inputs` to the upstream Runtype `/v1/dispatch` body when present
- Bundled **bakery assistant** flow prompt updated to use root-level `inputs` placeholders (e.g. `{{page_url}}`, `{{page_context}}`) instead of metadata-only page context

Requires Runtype API support for `inputs` on `POST /v1/client/chat` (merge into dispatch `inputs`). Agent prompts can use root-level `{{page_url}}` style variables instead of `{{_record.metadata.page_url}}` when the client sends page context as `inputs`.
