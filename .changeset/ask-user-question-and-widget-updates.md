---
"@runtypelabs/persona": minor
"@runtypelabs/persona-proxy": minor
---

**`@runtypelabs/persona`**

- **Human-in-the-loop (`ask_user_question`).** Support Runtype `step_await` (LOCAL tool pause), `client.resumeFlow()`, and `session.resolveAskUserQuestion()`. Synthesize tool messages with `agentMetadata.awaitingLocalTool`, render the answer UI, and resume via `POST` with `toolOutputs` (with `sendMessage` fallback for agents that do not use LOCAL tools). Idempotent `resolveAskUserQuestion` for rapid double-clicks.
- **Built-in answer UI.** Interactive sheet (stacked rows by default, optional `layout: "pills"`), optional free-text, progressive hydration from streaming tool args, feature flags under `features.askUserQuestion`, and `renderAskUserQuestion` / `parseAskUserQuestionPayload` for custom renderers. Plugins that delegate to the default should return `null` when `message.agentMetadata.askUserQuestionAnswered === true` so the widget owns the answered transcript.
- **Grouped questions.** Up to 8 questions per call, paginated stepper, `Record<questionText, string | string[]>` result shape, persistence of in-progress state across refresh, labels `nextLabel` / `backLabel` / `submitAllLabel` / `skipLabel`, and optional `groupedAutoAdvance: false`. UX aligned with common AskUserQuestion-style patterns: row layout, skip/back/submit, Q→A pair messages in the transcript, keyboard shortcuts 1–9, compact header, and optional “Other” input behavior per layout.
- **Fixes.** Composer overlay width and z-index; sheet lifecycle (answered flag, `awaitingLocalTool` gating, prune stale DOM); remove redundant “awaiting” stub when the sheet is the primary UI. Scroll-to-bottom control no longer covers the answer sheet.
- **Artifacts.** Persist artifact list and selection in `storageAdapter`; `initialArtifacts` / `initialSelectedArtifactId`, `hydrateArtifacts()`, and controller helpers for custom chrome; completed-only persistence for artifacts. Backward compatible with older stored state.
- **Theming.** `components.introCard` tokens and CSS variables for the welcome / intro card.

**`@runtypelabs/persona-proxy`**

- **`POST` resume route** (default under the chat path) forwarding `{ executionId, toolOutputs, streamResponse }` to the upstream `/resume` endpoint for LOCAL tool completion. Pre-configured `RuntypeFlowConfig` examples in this package can declare `ask_user_question` and other `runtimeTools` the same way as any custom flow.
