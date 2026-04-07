# @runtypelabs/persona-proxy

## 3.8.4

### Patch Changes

- f6b0b89: Send a pinned `Stripe-Version` header on Stripe Checkout Session requests so organization API keys and raw REST calls work reliably (matches Stripe versioning requirements).
- f091453: Surface Stripe API error messages when checkout session creation fails, and reject non-integer or non-positive line item prices/quantities before calling Stripe.

## 3.2.1

### Patch Changes

- a723d8e: Harden the proxy for edge runtimes, reduce sensitive development logging, update Hono dependencies for security fixes, and clean up widget build tooling.
- a723d8e: Read `NODE_ENV` and `RUNTYPE_API_KEY` through a runtime-safe env helper (works when `process` is absent), and keep verbose dispatch logs—API key prefix and full JSON payload—strictly in development.

## 2.3.0

### Patch Changes

- a4b0d1e: Add built-in HTML sanitization via DOMPurify, enabled by default. Configure with the new `sanitize` option: `true` (default), `false` (disable), or a custom `(html: string) => string` function. Also fixes proxy dev-mode CORS defaults, adds prototype pollution protection in config parsing, and validates image URL schemes to block SVG data URIs and javascript: sources.

## 2.0.0

### Major Changes

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

## 1.43.2

### Patch Changes

- ce823c8: Add "ai" keyword to package metadata for improved discoverability

## 1.42.0

### Minor Changes

- fde575d: Add agent loop execution support. The widget can now operate in agent mode by setting `config.agent` with a model, system prompt, and loop configuration instead of using `flowId`. Handles all agent-specific SSE events including `agent_turn_delta` (text and thinking content), `agent_tool_*`, `agent_reflection`, and `agent_iteration_*`. Added configurable `iterationDisplay` option (`'separate'` or `'merged'`) to control how multiple agent iterations appear in the chat UI. New exported types: `AgentConfig`, `AgentLoopConfig`, `AgentRequestOptions`, `AgentExecutionState`, `AgentMessageMetadata`, `AgentWidgetAgentRequestPayload`.

  The proxy now detects agent payloads (requests containing an `agent` field) and forwards them as-is to the upstream API instead of converting them into flow dispatch payloads.

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

### Patch Changes

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

## 1.37.0

### Minor Changes

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

- 1b91c6a: renamed packages to ones that are available on npm
