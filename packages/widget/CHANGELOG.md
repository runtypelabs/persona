# @runtypelabs/persona

## 2.2.0

### Minor Changes

- 0e5779a: Add stable `data-persona-theme-zone` attributes to widget regions, artifact theming tokens (`ArtifactToolbarTokens`, `ArtifactTabTokens`, `ArtifactPaneTokens`), named presets (`PRESET_SHOP`, `PRESET_MINIMAL`, `PRESET_FULLSCREEN`), `onArtifactAction` callback for intercepting artifact card actions, `onTitleClick` header option, and `controller.update()` support for `loadingIndicator` and `iterationDisplay` without widget remount.

## 2.1.0

### Minor Changes

- 30f1556: Expose theme-controlled box shadows for message bubbles, tool and reasoning rows, and the composer.

  - **`AgentWidgetTheme`:** optional `messageUserShadow`, `messageAssistantShadow`, `toolBubbleShadow`, `reasoningBubbleShadow`, and `composerShadow` map into the token pipeline and consumer CSS variables (`--persona-message-user-shadow`, `--persona-message-assistant-shadow`, `--persona-tool-bubble-shadow`, `--persona-reasoning-bubble-shadow`, `--persona-composer-shadow`).
  - **Semantic tokens:** `ComponentTokens` gains `message.user.shadow`, `toolBubble`, `reasoningBubble`, and `composer` with defaults in `DEFAULT_COMPONENTS`; `themeToCssVariables` wires them to the variables above.
  - **CSS:** bubble and composer rules read those variables so shadow styling stays overridable from theme/config.
  - **V1 migration:** flat `messageUserShadow` / `messageAssistantShadow` / `toolBubbleShadow` / `reasoningBubbleShadow` / `composerShadow` keys migrate into v2 `components`; `validateV1Theme` no longer flags them as unknown deprecated properties.
  - **`toolCall.shadow`:** when set on `AgentWidgetConfig`, `applyThemeVariables` overrides `--persona-tool-bubble-shadow` on the root element.

## 2.0.0

### Major Changes

- 8c6684d: Align agent config with Runtype API and add tool support

  **Breaking:**

  - `AgentLoopConfig.maxIterations` renamed to `maxTurns` to match the Runtype API
  - `AgentLoopConfig.stopCondition` removed (API auto-detects completion)
  - `AgentExecutionState.maxIterations` renamed to `maxTurns`
  - `AgentExecutionState.stopReason` type updated: `'max_iterations'` replaced with `'max_turns'`, added `'end_turn' | 'max_cost' | 'timeout'`

  **Features:**

  - `AgentConfig` now supports a `tools` field (`AgentToolsConfig`) for configuring built-in tools (e.g., `builtin:exa`, `builtin:dalle`), MCP servers, runtime tools, and approval workflows
  - `AgentLoopConfig` now supports `maxCost` (USD budget cap)
  - New exported type: `AgentToolsConfig`

  **Fixes:**

  - Agent loop execution now works correctly — the widget was sending `maxIterations` but the API expects `maxTurns`, causing every agent request to default to a single turn
  - SSE event parsing now correctly reads `maxTurns` from `agent_start` events

- 41ffc07: Support Runtype `/v1/client/chat` `inputs` for per-turn template variables, artifact reference cards in the transcript, and related stream handling.

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

- ed770cc: Complete tvw- to persona- CSS prefix migration and fix related bugs

  **Fixes:**

  - Tool call bubbles now correctly show tool names in flow mode (was reading
    `toolName` but the API sends `name` for flow-mode `tool_start` events)
  - Image attachment container now has proper flexbox layout (stale `tvw-flex`
    classes replaced with `persona-flex`)
  - Tool and reasoning bubble content areas now receive themed border and
    background colors (CSS selector targeted `.tvw-border-t` but elements
    had class `persona-border-t`)
  - Voice recording pulse animation now fires (CSS defined
    `.persona-voice-recording` but JS was adding `tvw-voice-recording`)

  **Cleanup:**

  - Migrated all remaining `tvw-` prefixed CSS classes and keyframes to
    `persona-` prefix for consistency. Zero `tvw-` references remain in source.
  - Removed dead `.tvw-approval-badge-*` CSS rules (never referenced)
  - Updated README to reflect `maxTurns`, `AgentToolsConfig`, and removed
    stale `maxIterations`/`stopCondition` documentation

  **Known limitation:**

  - Context providers configured via `contextProviders` are silently dropped
    in agent mode because the API's dispatch schema does not accept a top-level
    `context` field. This requires an API-side change to resolve.

### Minor Changes

- 85e2e7f: Add optional artifact sidebar: SSE handling for artifact events, in-session artifact store, split-pane / mobile drawer UI, `features.artifacts`, and controller / `persona:*` window hooks. Dispatch payloads accept optional `artifacts` on agent config (API parity). Includes demo page in `examples/embedded-app/artifact-demo.html`.
- 39e7b0e: Add a docked panel launcher mode that wraps a target container and renders Persona as a sibling side panel, with theme editor preview support, codegen updates, and a dedicated docked demo page.
- 41ffc07: Structured DOM context collection: score candidates before applying `maxElements`, add extensible `ParseRule` hooks with `defaultParseRules` for card-like UIs, rule-owned markdown-style summaries, and `options.mode` (`structured` default vs `simple` legacy). `formatEnrichedContext` accepts options to emit structured summaries.

  - Package README adds an **Enriched DOM context** section (imports, mode matrix, export table, custom `ParseRule` sketch) aligned with the new APIs

- 85e2e7f: Improve launcher-mode artifact layout: split gap and pane styling, configurable `features.artifacts.layout` (CSS vars, narrow-host in-panel drawer, optional launcher panel widen when artifacts are visible), optional draggable split resize (`layout.resizable`), artifact pane appearance (`paneAppearance`: `panel` / `seamless`), `paneBorderRadius`, `paneShadow`, themed borders (`paneBorder` / `paneBorderLeft`), unified split chrome (`unifiedSplitChrome`), and documentation.
- 85e2e7f: Add `components.markdown.link` and optional `heading` (h1/h2) tokens mapping to `--persona-md-link-color` and optional `--persona-md-h1-*` / `--persona-md-h2-*` overrides. Artifact `layout`: `documentToolbarShowCopyLabel`, `documentToolbarShowCopyChevron`, `documentToolbarIconColor`, `documentToolbarToggleActiveBackground`, `documentToolbarToggleActiveBorderColor` (root CSS variables). Document toolbar uses `aria-pressed` on view/source and theme-driven icon button styles.
- 85e2e7f: Artifact pane: optional `layout.paneBackground`, `layout.panePadding`, and `layout.toolbarPreset` (`document` shows view/source, copy/refresh/close, and hides the tab strip for a single artifact). Theme: `components.markdown.inlineCode`, assistant `message` border/shadow CSS vars (`--persona-message-assistant-shadow`, `--persona-md-inline-code-color`), artifact markdown styling for `.persona-markdown-bubble`. Config: `copy.showWelcomeCard`, `wrapComponentDirectiveInBubble`. Composer: `data-persona-composer-*` hooks on the default footer; rebind refs after `renderComposer` plugins. Optional `composerForm`/`textarea` guards when custom composers omit controls.
- 85e2e7f: - Extend custom `renderComposer` context with `streaming`, `openAttachmentPicker`, optional `models` / `selectedModelId` / `onModelChange`, and `onVoiceToggle` when voice is enabled.
  - Ensure attachment file input + previews exist for custom composers when `attachments.enabled` is true.
  - Reflect streaming state on the composer footer via `data-persona-composer-streaming` and optional `data-persona-composer-disable-when-streaming` controls.
  - Add optional markdown `components.markdown.prose.fontFamily` mapped to `--persona-md-prose-font-family` for `.persona-markdown-bubble`.
  - Document artifact pane desktop close behavior on `AgentWidgetArtifactsLayoutConfig`.
  - Export `AgentWidgetComposerConfig` from the package entry.

### Patch Changes

- 85e2e7f: Document artifact toolbar title: strip a trailing `· MD` from `artifact` titles before appending ` · MD` so streams that already include the suffix are not shown twice.
- 85e2e7f: Fix artifact pane not reopening after the user dismisses it: clear `persona-hidden`, force mobile drawer open when artifacts exist, and complete mobile visibility branches in the artifact pane.
- 85e2e7f: Fix artifact pane **Close** (and mobile backdrop tap) so they call the same hide path as `hideArtifacts()`, including split-desktop layouts. `syncArtifactPane` now resets mobile drawer state when the user dismisses the pane.
- 99658f7: Fix message action buttons (copy, upvote, downvote) not responding to clicks

  The event delegation handler in ui.ts used stale `tvw-` class name selectors that
  didn't match the actual `persona-` prefixed classes on the rendered buttons. This
  meant clicks were silently ignored after the class naming migration.

  Also consolidates click handling: `createMessageActions` is now a pure rendering
  function that emits buttons with `data-action` attributes. All behavior (clipboard,
  vote state, callbacks, API submission) is handled exclusively via event delegation
  in ui.ts, eliminating duplicated logic and divergent vote state that previously
  existed between the two code paths.

- 85e2e7f: Inline embed (`launcher.enabled: false`) with `launcher.fullHeight: true` now sizes the panel to 100% of the host mount width instead of the default launcher width (`min(400px, …)`).
- a4e740e: Add `persona-message-content` class on the message body wrapper for stable theme-editor / integration targeting.
- 85e2e7f: Fix `transcript_insert` SSE messages omitting `variant`: stop defaulting to `"assistant"`, which prevented component-directive rendering for messages with JSON `rawContent`.

## 1.48.0

### Minor Changes

- 7b61bce: Add barge-in voice interruption mode with always-on mic and speech detection

  - New `VoiceActivityDetector` class provides reusable RMS-based VAD with two modes: `silence` (user stopped talking) and `speech` (user started talking)
  - In barge-in mode the mic stays hot between turns — audio pipeline is reused instead of torn down after each utterance
  - During agent playback, VAD monitors for sustained speech and automatically interrupts playback to begin recording
  - Mic button shows recording state during agent speech in barge-in mode and acts as a "hang up" to end the session
  - New `isBargeInActive()` and `deactivateBargeIn()` methods on `VoiceProvider` and `Session` for UI coordination
  - Guard against late `audio_end` and audio chunks from cancelled requests

- d3ed42b: Add voice interruption and cancellation support to RuntypeVoiceProvider

  - Handle `session_config` WebSocket message to receive server-side interruption mode (`none`, `cancel`, `barge-in`)
  - New `cancelCurrentPlayback()` method stops audio playback and sends cancel request to server
  - When interruption is enabled, `startListening()` cancels in-flight responses instead of throwing
  - Track current audio element and request IDs for reliable cancellation and cleanup
  - Handle `cancelled` WebSocket message for server-acknowledged cancellation
  - Clean up audio resources on disconnect
  - Demo: conditionally show browser voice controls based on active TTS provider

## 1.47.0

### Minor Changes

- 68f7453: Add voice provider system with speech-to-text and text-to-speech support

  - New `voice/` module with `RuntypeVoiceProvider` (server-side STT via WebSocket) and `BrowserVoiceProvider` (Web Speech API fallback)
  - Factory functions `createVoiceProvider`, `createBestAvailableVoiceProvider`, and `isVoiceSupported` for provider selection
  - Session-level voice lifecycle management: `setupVoice()`, `toggleVoice()`, `isVoiceActive()`, `getVoiceStatus()`
  - `TextToSpeechConfig` type for browser and Runtype TTS with configurable voice, rate, and pitch
  - `onVoiceStatusChanged` callback for UI integration with Runtype provider status updates
  - New exports: `VoiceProvider`, `VoiceResult`, `VoiceStatus`, `VoiceConfig` types and voice factory functions

## 1.46.1

### Patch Changes

- 9485a83: Fix finalizing stale streaming messages when starting a new stream (e.g., tool messages interrupted by approval pause)

## 1.46.0

### Minor Changes

- 29dc7ad: feat: add chat input focus control via autoFocusInput config, controller.focusInput(), and persona:focusInput DOM event

  - Add `autoFocusInput` init parameter to focus input after panel open animation
  - Add `controller.focusInput()` method for programmatic focus
  - Add `persona:focusInput` DOM event with instance scoping
  - Add focus-input-demo example page with localStorage-persisted toggle

### Patch Changes

- 9b5299d: fix(event-stream): fall back to buffer when Copy All gets empty from store

  When "All events" is selected and Copy All is clicked, the code used getFullHistory() which reads from IndexedDB. If the store's DB isn't ready (e.g. open failed, private browsing), getAll() returns []. Now fall back to buffer.getAll() when the store returns empty so users get the visible in-memory events instead of [].

- 7728e64: fix(ui): keep typing indicator visible while agent resumes after approval

  Exclude approval-variant messages from the hasRecentAssistantResponse check so the typing indicator still shows while the agent resumes after user approval, instead of flickering away.

## 1.45.0

### Minor Changes

- b614fce: feat: add connectStream() to pipe external SSE streams through SDK event pipeline

  Enables streaming approval responses (and other external SSE sources) through the SDK's native message/tool/reasoning handling instead of static injection.

### Patch Changes

- b245fbe: Fix inline timestamp positioning regression in message bubbles by avoiding an always-on wrapper div around transformed text content.
- 862366b: Use theme-aware styling for approval, tool, and reasoning bubbles instead of hardcoded colors and ghost CSS classes. All three bubble types now adapt to dark mode and custom themes. Config overrides still take priority.

## 1.44.2

### Patch Changes

- 1e0dbaf: When attachments are enabled, pasted clipboard images are now added to the composer as attachments in addition to files selected from the file picker.

  Messages that include attached images now attempt to render bounded image previews directly in the chat bubble. If preview rendering fails, the existing `[Image]` fallback text is shown.

## 1.44.1

### Patch Changes

- b81e5d1: Refactor event handling in AgentWidgetClient to clarify alias usage. Updated the conditional check to maintain the order of event types for clarity, with `reason_delta` as the canonical event and `reason_chunk` as a legacy alias.

## 1.44.0

### Minor Changes

- 55f8297: Support unified SSE event names ahead of platform-wide rename

  - Accept `step_delta`, `tool_delta`, and `reason_delta` as aliases for `step_chunk`, `tool_chunk`, and `reason_chunk` (aligns with industry-standard `delta` terminology used by Anthropic, Vercel AI SDK, and OpenAI)
  - Accept `agent_reflect` as alias for `agent_reflection` (consistent `entity_verb` grammar)
  - Enrich `tool_start`, `tool_delta`, and `tool_complete` handlers to carry `agentMetadata` when the payload includes `agentContext` or direct `executionId`/`iteration` fields, supporting the upcoming unification of `agent_tool_*` events into shared `tool_*` events
  - Accept `parameters` as alias for `args` and `executionTime` as alias for `duration` in tool event payloads for forward compatibility with the unified format

  All existing event names continue to work unchanged. No breaking changes.

## 1.43.6

### Patch Changes

- 81c2585: Fix message action buttons (upvote, downvote, copy) not firing after DOM morphing by using event delegation

## 1.43.5

### Patch Changes

- e600050: Pre-initialize client session in client token mode so feedback (upvote/downvote) works before the user sends their first message (e.g. on restored or persisted messages)

## 1.43.4

### Patch Changes

- 4b23630: Consolidate R2 CDN publish into release workflow and add manual dispatch

## 1.43.3

### Patch Changes

- 3b79b5a: Fix typo in package description ("plugable" → "pluggable")

## 1.43.2

### Patch Changes

- ce823c8: Add "ai" keyword to package metadata for improved discoverability

## 1.43.1

### Patch Changes

- 69f991c: Fix SSE event stream callback lost on config update. `session.updateConfig()` was creating a new `AgentWidgetClient` without preserving the `onSSEEvent` callback, causing the Event Stream Inspector to show 0 events after any `controller.update()` call (e.g. theme changes).

## 1.43.0

### Minor Changes

- ba29509: Add SSE Event Stream Inspector - a debug panel that shows raw SSE events with filtering, search, virtual scrolling, IndexedDB persistence, and programmatic control via controller methods and window events

## 1.42.0

### Minor Changes

- fde575d: Add agent loop execution support. The widget can now operate in agent mode by setting `config.agent` with a model, system prompt, and loop configuration instead of using `flowId`. Handles all agent-specific SSE events including `agent_turn_delta` (text and thinking content), `agent_tool_*`, `agent_reflection`, and `agent_iteration_*`. Added configurable `iterationDisplay` option (`'separate'` or `'merged'`) to control how multiple agent iterations appear in the chat UI. New exported types: `AgentConfig`, `AgentLoopConfig`, `AgentRequestOptions`, `AgentExecutionState`, `AgentMessageMetadata`, `AgentWidgetAgentRequestPayload`.

  The proxy now detects agent payloads (requests containing an `agent` field) and forwards them as-is to the upstream API instead of converting them into flow dispatch payloads.

## 1.41.0

### Minor Changes

- 2d5ec5e: Add custom loading indicator and idle state support. Users can now customize loading indicators via `loadingIndicator.render` and `loadingIndicator.renderIdle` config options, or through plugin hooks `renderLoadingIndicator` and `renderIdleIndicator`. Added `showBubble` option to control bubble styling around standalone loading indicators.

## 1.40.1

### Patch Changes

- f398a27: Complete camelCase migration for step config fields and add ESLint enforcement

  Proxy step config changes:

  - `response_format` → `responseFormat`
  - `output_variable` → `outputVariable`
  - `user_prompt` → `userPrompt`
  - `system_prompt` → `systemPrompt`
  - `previous_messages` → `previousMessages`

  ESLint rule added to prevent snake_case regression in API payloads.

## 1.40.0

### Minor Changes

- 3aae116: Add embedded cart pattern support with new state hooks

  **New Features:**

  - `onStateLoaded` hook: Transform or inject messages after state loads from storage but before widget initializes. Useful for navigation-based message injection, checkout returns, or external state sync.

  - `user:message` event: Emitted when a new user message is detected. Includes `viaVoice: true` if sent via voice recognition.

  - Enhanced state persistence: Automatically restore widget open state, voice recognition state, and input focus across page navigations when using `persistState`.

  **Bug Fixes:**

  - Don't show fallback error messages when requests are intentionally aborted (e.g., user navigates away or cancels)

  **Proxy:**

  - Added `bakery-assistant` flow for the bakery demo example

  **Documentation:**

  - Added comprehensive Controller Events documentation with all available events and payload types
  - Added examples for `onStateLoaded` hook usage

## 1.39.0

### Minor Changes

- 1835807: Migrate to camelCase API convention

  Update all API interactions to use camelCase field names to match the Runtype API's native camelCase convention.

  **Breaking Change**: Requires Runtype API v2.x+ with camelCase support.

  Proxy changes:

  - `stream_response` → `streamResponse`
  - `record_mode` → `recordMode`
  - `flow_mode` → `flowMode`
  - `auto_append_metadata` → `autoAppendMetadata`

  Widget client changes:

  - Init: `flow_id` → `flowId`, `session_id` → `sessionId`
  - Response: `session_id` → `sessionId`, `expires_at` → `expiresAt`, `welcome_message` → `welcomeMessage`
  - Chat: `session_id` → `sessionId`, `assistant_message_id` → `assistantMessageId`
  - Feedback: `session_id` → `sessionId`, `message_id` → `messageId`

## 1.38.3

### Patch Changes

- e12eb21: Fix race condition with resubmit flag for async action handlers

  When an action handler returns `resubmit: true`, the library now waits for `injectAssistantMessage()` to be called before triggering the automatic model continuation. This prevents race conditions where the resubmit would fire before async operations (like API calls) completed, causing the model to hallucinate instead of using the injected data.

  Previously, the `action:resubmit` event was emitted immediately when the handler returned, which fired too early for handlers with async operations. Now, the resubmit is deferred until after the handler injects its results via `injectAssistantMessage()`.

  Handlers that use `context.triggerResubmit()` are unaffected and continue to work as before.

## 1.38.2

### Patch Changes

- 801b611: Fix race condition in action handler resubmit feature

  - Add `continueConversation()` method to session for triggering model continuation without adding a visible user message
  - Add `triggerResubmit()` function to action context, allowing handlers to trigger resubmit AFTER async work completes
  - Update resubmit handler to use `continueConversation()` instead of `sendMessage("[continue]")`
  - This fixes the race condition where resubmit would fire before async data was injected, causing the model to hallucinate results
  - The `[continue]` message is no longer visible to users

## 1.38.1

### Patch Changes

- f8ce416: Fix resubmit to use [continue] message instead of empty string

  Empty string messages were being filtered out by the session, preventing
  automatic continuation. Now sends "[continue]" as a special marker that
  signals the model should analyze previously injected results.

  Also increased resubmit delay from 150ms to 500ms to ensure async
  operations complete before triggering continuation.

## 1.38.0

### Minor Changes

- 1ecd4d8: Add resubmit flag to action handler results for automatic model continuation

  - Add `resubmit?: boolean` to `AgentWidgetActionHandlerResult` type
  - Add `action:resubmit` event to `AgentWidgetControllerEventMap`
  - When a handler returns `resubmit: true`, automatically trigger another model call
  - Enables handlers that inject data (e.g., search results) to have the model analyze and respond to that data

## 1.37.2

### Patch Changes

- 71d709e: Fix llmContent not being sent to server in client token mode

  - Add missing `llmContent` to content priority chain in client token dispatch
  - Content priority now matches proxy mode: `contentParts > llmContent > rawContent > content`
  - Fixes message injection API when using client tokens instead of proxy

## 1.37.1

### Patch Changes

- af82f7f: Use pinned package version in generated CDN URLs instead of @latest

  - Code generator now uses the installed package version in CDN URLs
  - Generated snippets use exact version (e.g., `@runtypelabs/persona@1.36.1`) instead of `@latest`
  - Ensures reproducible deployments where generated code matches the installed widget version
  - Export `VERSION` constant from package for programmatic access

## 1.37.0

### Minor Changes

- 0a08bc7: Add first-class message injection API with dual-content support

  - Add `llmContent` field to `AgentWidgetMessage` for separating user-facing and LLM-facing content
  - Add `injectMessage()`, `injectAssistantMessage()`, `injectUserMessage()`, and `injectSystemMessage()` methods
  - Update content priority chain: `contentParts > llmContent > rawContent > content`
  - Deprecate `injectTestMessage()` in favor of new injection methods
  - Add comprehensive documentation at `docs/MESSAGE-INJECTION.md`

  **New Feature: Dual-Content Messages**

  Inject messages where the displayed content differs from what the LLM receives:

  ```javascript
  // User sees rich markdown
  // LLM receives concise summary
  widgetHandle.injectAssistantMessage({
    content: "**Found 3 products:**\n- iPhone 15 Pro - $1,199...",
    llmContent: "[Search results: 3 iPhones, $799-$1199]",
  });
  ```

  This enables:

  - Token efficiency (send summaries to LLM instead of full content)
  - Sensitive data redaction (show PII to user, hide from LLM)
  - Context injection (rich LLM context with minimal UI footprint)

- 28132f6: Rename travrse to runtype and update API URLs

  - Update all references from "travrse" to "runtype" throughout codebase
  - Change API endpoint from api.travrse.ai to api.runtype.com
  - Update environment variable names (TRAVRSE_API_KEY -> RUNTYPE_API_KEY)
  - Update data attribute from data-travrse-token to data-runtype-token
  - Update CSS variable names from --travrse-_ to --runtype-_
  - Rename types TravrseFlowConfig -> RuntypeFlowConfig (with deprecated aliases)

  **Breaking Changes:**

  - Default API endpoint changed to `api.runtype.com`
  - Data attribute changed from `data-travrse-token` to `data-runtype-token`
  - CSS variables renamed from `--travrse-*` to `--runtype-*`

  **Backwards Compatibility:**

  - `TRAVRSE_API_KEY` environment variable is still supported as a fallback
  - `TravrseFlowStep` and `TravrseFlowConfig` types are exported as deprecated aliases

## 1.36.1

### Patch Changes

- 8f6b68a: Add ESLint configuration files for proper linting support
- 8f6b68a: Migrate package to @runtypelabs organization

  - Renamed from vanilla-agent to @runtypelabs/persona
  - Updated all CSS selectors and DOM IDs to use persona prefix
  - Updated localStorage keys and event names

## 1.36.0

### Minor Changes

- Improve code gen with client token

## 1.35.0

### Minor Changes

- Enable tooltip colors to be configurable

## 1.34.0

### Minor Changes

- Add attachment functionality

## 1.33.0

### Minor Changes

- Add more control over script generation

## 1.32.0

### Minor Changes

- Add ability to persist session id

## 1.31.0

### Minor Changes

- Update message event listeners and add config for header/footer visibility

## 1.30.0

### Minor Changes

- Use idiomorph for dom updates to prevent animation flicker

## 1.29.0

### Minor Changes

- Replace CSS that may conflict with parent page styles

## 1.28.0

### Minor Changes

- Move load css to be inside hydration function

## 1.27.0

### Minor Changes

- Additional hydration support within advanced script export

## 1.26.0

### Minor Changes

- Update advanced script export to support sites that hydrate dom

## 1.25.0

### Minor Changes

- Support for dark mode theme

## 1.24.0

### Minor Changes

- Enable tool call, message action, markdown, and layout config in code export

## 1.23.0

### Minor Changes

- Add feedback api support and include metadata in the chat message requests

## 1.22.0

### Minor Changes

- Message feedback mechanisms and client token support

## 1.21.0

### Minor Changes

- Improved markdown and launcher button styling

## 1.20.0

### Minor Changes

- Add panel height offset config

## 1.19.0

### Minor Changes

- Improve inline embed width and flex config

## 1.18.0

### Minor Changes

- Fix layout shift in inline embed

## 1.17.0

### Minor Changes

- Fix theme apply issue

## 1.16.0

### Minor Changes

- Add theme config reference and resolve embedded overflow issue

## 1.15.0

### Minor Changes

- Resolve rendering issues when in full height and sidebar mode

## 1.14.0

### Minor Changes

- Improve user message ux and markdown styling for lists and paragraphs

## 1.13.0

### Minor Changes

- Add markdown parsing to script generation
- Remove extra action-middleware example
- Fix lagging typing indicator after assistant message

## 1.12.0

### Minor Changes

- Add code generation methods to library export

## 1.11.0

### Minor Changes

- Improve responsiveness of inline rendering, enable sidebar rendering, and use custom components for form demo

## 1.10.0

### Minor Changes

Added:

- Component streaming hooks
- Custom fetch / header / sse parsing methods

Improved:

- Vanilla Agent DOM is now excluded from page DOM helper

Fixed

- Missed triggering of checkout middleware actions
- Duplicate triggering of click and checkout actions

## 1.9.0

### Minor Changes

- improve usability of theme presets and script generation

## 1.8.0

### Minor Changes

- Widget state events, message persistance control, and shop demo styling

## 1.7.0

### Minor Changes

- resolve test issues, simplify action middleware, and enable upstream url in proxy to be configured more easily

## 1.6.0

### Minor Changes

- added event handlers and middleware hooks

## 1.5.0

### Minor Changes

- add z-index to launcher

## 1.4.0

### Minor Changes

- implement stream parsing plugin system

## 1.3.0

### Minor Changes

- added viaVoice field to user message in send message

## 1.2.0

### Minor Changes

- added message and voice input hooks

## 1.1.0

### Minor Changes

- b7124ae: update proxy examples for vercel and cloudflare

## 1.0.0

### Major Changes

- e64d029: Initial version 😎

  Updated core interface and unified default style definitions, while adding much more configurability of elements.

## 0.2.0

### Minor Changes

- 7a52ca9: fix for css not loading in shadow dom
- 1b91c6a: renamed packages to ones that are available on npm
