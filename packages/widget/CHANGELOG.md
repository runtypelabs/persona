# @runtypelabs/persona

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
