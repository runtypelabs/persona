# @runtypelabs/persona-proxy

## 3.36.0

### Minor Changes

- f90ec29: Broadcast the widget version as an `X-Persona-Version` request header. The widget now sends its package version on every outgoing request (chat dispatch, session init, feedback, approve, and resume), and the proxy allows the header through CORS and forwards it upstream to the Runtype API.

## 3.35.0

### Patch Changes

- ## 02d9183: Reduce em dash sentence constructions across package source and documentation.

  "@runtypelabs/persona": patch
  "@runtypelabs/persona-proxy": patch

  ***

  ## Reduce em dash sentence constructions across package source and documentation.

  "@runtypelabs/persona": patch
  "@runtypelabs/persona-proxy": patch

  ***

  ## Reduce em dash sentence constructions across package source and documentation.

  "@runtypelabs/persona": patch
  "@runtypelabs/persona-proxy": patch

  ***

  Normalize em dash punctuation to ASCII hyphen separators across package source and documentation.

## 3.34.0

### Minor Changes

- 571f4c5: Add WEBMCP_PAINT_FLOW: the Paint Pal flow for the jspaint WebMCP demo, with a snapshot-and-look visual loop (image tool results through /resume).

### Patch Changes

- 279b173: Bump safe non-breaking dependencies.

## 3.33.0

### Minor Changes

- 1aeba66: Add `THEME_ASSISTANT_FLOW`: the tool-calling flow behind the Theme Editor's docked **Theme Copilot**. It drives the page's WebMCP theme tools (`webmcp:*`) to restyle the editor's live preview from chat, and supports an image-matching loop: paste a screenshot of another chat widget and the copilot extracts a style spec, applies it, then verifies the result via the page's `screenshot_preview` capture tool.

### Patch Changes

- 6d57356: Add "Asking instead of guessing" guidance to the WebMCP calendar and slides flow prompts: when an `ask_user_question` tool is available (e.g. via the widget's `features.askUserQuestion.expose` flag), the copilots now know to offer structured options for genuinely ambiguous requests: conflicting slots and multi-match events in the calendar, theme/content/style-direction forks in the deck editor , and to act directly otherwise.
- dd03a60: Update the WebMCP calendar and slides flow prompts for the slimmed demo tool surfaces: the calendar demo dropped its lookup-only tools (`get_users`, `get_event_colors`, `get_page_title`: users now ride along on `get_calendar_state` and colors are schema enums), and the slides demo folded `distribute_elements` into `align_elements`.
- ee8febd: Add "Acting vs. claiming" grounding rules to all WebMCP demo flow system prompts (calendar, storefront, slides, docked) so the model never confirms a calendar/cart/deck/workspace change without a same-turn tool call, and handles bare follow-ups like "do it" by executing or verifying instead of re-announcing a past action.
- f3868fe: Ground the WebMCP slides flow for vague restyle requests ("make the title slide pop"): treat them as a small focused style pass (4-5 mutations, prefer update_element, at most one new decorative element, theme tokens only) ending in a summary, instead of an open-ended add_element spree that hits the runtime's per-turn tool-call cap and strands the user with "Stopped after calling a tool."

## 3.32.0

### Minor Changes

- 1247779: Add `WEBMCP_DOCKED_FLOW`, a tool-less dashboard-copilot flow for the docked panel demo. Like the other WebMCP flows, the page registers its workspace tools on `document.modelContext` and the proxy forwards them as `clientTools[]`.
- 3333850: Add WEBMCP_SLIDES_FLOW: a Deck Copilot flow for the new slide-deck editor WebMCP demo (`examples/embedded-app/webmcp-slides.html`). Like the other WebMCP flows it owns no tools of its own; the system prompt teaches the model to work with the page's dynamic tool set (selection-scoped tools, presenter-mode swap) and the live `{{slides_context}}` editor state.

## 3.31.0

### Minor Changes

- 4d1e79c: Add `WEBMCP_CALENDAR_FLOW`, an in-code flow template for the webmcp-calendar example. Like `WEBMCP_STOREFRONT_FLOW`, the agent owns no tools of its own: the page registers ten calendar tools on `document.modelContext` and the widget forwards them as `clientTools[]`. The system prompt reinforces the page's timezone-safe tool contract (local wall-clock `YYYY-MM-DDTHH:mm` date-times, no UTC offsets).

### Patch Changes

- e512d3d: Teach the WebMCP storefront demo prompt to use returned product image URLs when helpful.

## 3.26.0

### Minor Changes

- 236afc2: Two proxy additions:

  - **`WEBMCP_STOREFRONT_FLOW`**: an in-code agent definition for the WebMCP "Switchback" storefront demo. The demo now runs through the local proxy like the other examples (via a new `/api/chat/dispatch-webmcp` route) instead of requiring a client token pointed at a hosted Runtype agent : the page's `clientTools[]` are forwarded upstream and the `/resume` round-trip is proxied, with the full agent prompt and model living in the repo.
  - **Preview-aware CORS**: `createChatProxyApp` now reflects dynamic preview origins so per-branch preview deployments work without enumerating their URLs. It reflects the caller's origin when the proxy itself is a preview runtime (`VERCEL_ENV === "preview"`) and when the origin matches the new `previewOriginPattern` option (default `https://*.vercel.app`; settable via the `PREVIEW_ORIGIN_PATTERN` env var to allow other preview domains, or `false` to disable). The exact `allowedOrigins` allowlist and production behavior are unchanged.

### Patch Changes

- 2edaa95: Switch all built-in proxy flow agents to the `nvidia/nemotron-3-ultra-550b-a55b` model.

## 3.22.0

### Minor Changes

- eb7f3e1: Add `PAGE_CONTEXT_FLOW`, a page-aware shopping flow that injects live page content via
  `{{pageContext}}`. It returns a small JSON envelope: a markdown `text` field for chat
  replies, plus an optional `add_to_cart` action carrying a product handle so the assistant
  can drive the host. Used by the smart-dom-reader example to demonstrate shadow-DOM-aware
  page context reaching the model, and the assistant adding shadow-DOM products to the cart.

### Patch Changes

- 6569c56: Forward WebMCP `clientTools[]` to the upstream API in flow-dispatch mode. The proxy rebuilds the flow-dispatch payload from scratch, which previously dropped the page-discovered tools the widget snapshots from `document.modelContext`, so a WebMCP-enabled flow behind the proxy never received them and the agent could not call page tools. The flow path now copies `clientTools` through (agent mode already forwarded the payload as-is), pairing with the existing `/resume` endpoint to complete the local-tool round-trip.

## 3.19.0

### Minor Changes

- 2eba114: ## `@runtypelabs/persona`

  ### `launcher.mountMode: "composer-bar"`: persistent pill composer

  Add `launcher.mountMode: "composer-bar"`: a sleek rounded-pill composer fixed at the bottom of the viewport that morphs into an expanded chat panel on submit and minimizes back. Single composer DOM instance, so messages, drafts, and attachments persist across collapse/expand. The collapsed pill is single-row (paperclip · textarea · mic · send) with no surrounding card chrome; suggestions and status indicator stay hidden until expanded.

  Configurable via `launcher.composerBar`:

  - `expandedSize`: `"anchored"` (default: pill stays put, panel grows upward into a centered column above it) | `"fullscreen"` (edge-to-edge viewport) | `"modal"` (centered sheet)
  - `expandedMaxWidth` (default `"880px"`) and `expandedTopOffset` (default `"5vh"`): anchored panel sizing
  - `contentMaxWidth` (default `"720px"`): auto-centers messages, composer, suggestions, and previews horizontally inside the expanded panel; falls back to `layout.contentMaxWidth` when set
  - `collapsedMaxWidth` (no default: when omitted, the pill uses the responsive defaults `90vw` / `70vw` / `50vw` at `<640` / `<1024` / `>=1024` viewports; setting it overrides with a fixed pill width) and `bottomOffset` (default `"16px"`) : pill sizing/position
  - `expandOnSubmit` (default `true`), `modalMaxWidth`, `modalMaxHeight`

  Internally, composer-bar mode uses a purpose-built pill composer (`pill-composer-builder.ts`) that shares low-level button factories with the regular composer (`composer-parts.ts`): the only meaningful difference is the layout shell + className. Plugin-rendered headers and composers continue to work unchanged; stable data-attribute selectors (`data-persona-composer-form`, `-input`, `-submit`, `-mic`, `-status`) are preserved across both composer variants.

  The expanded chat panel is purpose-built for this UX: a minimal corner-only header (no title bar, subtitle, or refresh button strip) with two small action icons stacked in the top-right, a clear/start-over button and the × close button, and the pill stays mounted as a viewport-fixed sibling of the chat panel chrome (always visible and interactive, never absorbed into the panel above). Clicks anywhere outside the wrapper or pill collapse back to just the pill. Both action buttons flow through the existing `launcher.closeButton*` and `launcher.clearChat.*` config (tooltip, icon, color, size) via shared `createCloseButton` and `createClearChatButton` factories in `header-parts.ts`. Set `launcher.clearChat: { enabled: false }` to render only the × close icon. Composer-bar mode sizes both icons at 16px (versus the floating launcher's 32px default) to read as a paired action group rather than a header strip.

  The pill (and peek banner) live in a viewport-fixed `pillRoot` element that is a sibling of the wrapper inside the host mount node: not a descendant. This decouples the pill from the wrapper's geometry transitions: in `expandedSize: "modal"` the wrapper's `transform: translate(-50%, -50%)` no longer drags the pill toward the centered modal, and in `expandedSize: "fullscreen"` the pill stays anchored at the viewport bottom while the chat panel covers the rest of the screen. The pillRoot mirrors the wrapper's `data-state` and `data-expanded-size` attributes so peek visibility rules cascade unchanged. Pill width is set on the pillRoot itself via the same responsive `90vw / 70vw / 50vw` media-query defaults (overridable with `composerBar.collapsedMaxWidth`); pill bottom offset honors `composerBar.bottomOffset` (default `16px`). In `expandedSize: "anchored"`, the wrapper's bottom edge clears the pill area via `calc(${bottomOffset} + var(--persona-pill-area-height, 80px))` : override the CSS variable on the host if the static 80px clearance leaves a visible overlap with custom pill content.

  In `expandedSize: "fullscreen"`, the chat panel covers the entire viewport and messages scroll behind the pill rather than stopping above it. The body's bottom padding is removed in this mode (so the body background extends to the viewport edge) and the messages list gains `padding-bottom: calc(${bottomOffset} + var(--persona-pill-area-height) + 16px)` so the last bubble is reachable above the pill rather than permanently obscured. Override `--persona-pill-area-height` on the host to tune the reachability gap if you've themed the pill to a non-default height.

  Pressing Escape while the chat is expanded collapses back to just the pill: same end state as outside-click. Matches the WAI-ARIA dialog pattern (modal mode is literally a dialog) and the dominant chat-widget convention (Intercom, Drift, Crisp). The handler attaches on expand and detaches on collapse, so it doesn't intercept Escape outside the chat session. Guarded on `event.isComposing` so dismissing an IME suggestion (Pinyin, Kotoeri, etc.) doesn't also collapse the panel.

  In `expandedSize: "modal"` and `expandedSize: "anchored"`, the wrapper's geometry transition is disabled so the panel snaps to its expanded position rather than sliding in directionally. (The wrapper goes from collapsed, no inline `top/left/transform`, to its expanded position, and the default `transform 220ms ease` would interpolate `none → translate(...)`, reading as a slide-in from the wrapper's static-default origin: diagonally from the bottom-right for modal, horizontally from the right for anchored. With pillRoot owning the visible chrome in the collapsed state, the wrapper has nothing to morph from, so the slide is pure motion noise. The container's existing opacity fade-in keyframe is enough of a reveal. Fullscreen keeps its geometry transition because that's the one mode where the wrapper genuinely morphs from empty to full viewport, and the staggered fade-in cascade is built specifically to mask the outer-edge/inner-content desync during that morph.)

  The collapsed pill includes a "peek" affordance for re-entering chat history: a chrome-less row above the pill that shows a chat-bubble icon, a trailing-100-character preview of the most recent assistant message, and a chevron-up. The peek fades in while a response is streaming OR when the user hovers the composer area, and fades out otherwise. Clicking the peek expands the panel. This replaces the earlier pill-internal chat-bubble button + focus-to-open behavior, which read as composer chrome rather than as navigation.

  The peek banner shares the same animation surface as the main message stream. Configure once via `features.streamAnimation` and both surfaces inherit (matching `type`, `speed`, `duration`, `buffer`, `placeholder`, and custom plugins). To animate the peek differently, e.g. faster cadence in the ticker than in the bubble, set `launcher.composerBar.peek.streamAnimation` with the same `AgentWidgetStreamAnimationFeature` shape. Carve-out: `bubbleClass` is ignored on the peek (no bubble analog); `containerClass`, `wrap` (`"char"`/`"word"`), `useCaret`, the `"skeleton"` placeholder (used when `buffer: "line"` trims to empty between line completions), and `onAfterRender` plugin hooks all port over. Per-char/per-word span IDs are namespaced with a `peek-` prefix so they don't collide with the main bubble's spans for the same message id, and use absolute char indices so animations on already-revealed chars survive each chunk's slice shift.

  ### Icon registry: explicit named imports + public `renderLucideIcon` export

  Two changes that ship together:

  1. **Public `renderLucideIcon` (and `IconName` type) export.** The widget already used this helper internally for every icon in its chrome (header, composer, launcher, tool/reasoning bubbles, attachment manager, etc.); exposing it lets custom `ComponentRenderer` authors draw the same icons without re-implementing inline SVG.

     ```ts
     import { renderLucideIcon, type IconName } from "@runtypelabs/persona";

     const clock = renderLucideIcon("clock", 14, "currentColor");
     if (clock) container.appendChild(clock);
     ```

  2. **Closed icon registry: drops ~400KB from the IIFE bundle.** The previous implementation was `import * as icons from "lucide"` plus a runtime string lookup, which defeated tree-shaking; the script-tag/CDN distribution (`dist/index.global.js`) shipped all 1640 lucide icons. The registry is now a curated set of ~110 named imports covering the widget's internal usage and common UI patterns (forms, status, navigation, commerce, media, files, social, decorative). Names outside the registry return `null` and log a warning. See `packages/widget/docs/icon-registry-shortlist.md` for the full list and the rule for adding more.

  **Behavior note for config consumers:** any place where you previously passed an arbitrary lucide icon name string (e.g. `launcher.callToActionIconName`, `sendButton.iconName`, `voiceRecognition.iconName`) now resolves against the closed registry. The default values are unchanged. If you were passing a custom name that isn't on the shortlist, the icon will silently render as null and you'll see a console warning telling you to add it to the registry. The new `IconName` type gives TypeScript users autocomplete and compile-time errors for unknown names.

  **Side fix:** `attachment-manager.ts` previously returned `"file-json"` as the icon name for `application/json` attachments: that name doesn't exist in lucide v0.552 and silently failed. Switched to `"file-code"`.

  ### Component directives: preserve event listeners across morph passes

  Event listeners on custom component renderers (registered via `config.components` and rendered from JSON directives) are preserved across transcript updates. Previously, serializing through `tempContainer.innerHTML` during the morph pass dropped `addEventListener`-attached listeners (e.g. `DynamicForm` submit handlers calling `preventDefault()` could revert to full-page navigation after later messages). Directive bubbles now use stub-and-hydrate like `renderAskUserQuestion`; fingerprint-gated rebuilds avoid wiping mid-stream form input when other messages re-render.

  ### `persistState: false` is now an explicit storage kill-switch

  Make `persistState: false` an explicit kill-switch for chat-history persistence. Previously, setting `persistState: false` only suppressed UI state (open/closed, voice mode, focus): message history was still written to the default `localStorage["persona-state"]` adapter. Now `persistState: false` also short-circuits the storage adapter: the default localStorage adapter is never created, and any user-supplied `storageAdapter` is ignored. This is the strict semantic : passing `persistState: false` means "no chat history is read or written, period." Pass `persistState: true` (or omit it) to keep the prior behavior of persisting messages via the configured `storageAdapter` (or the built-in localStorage adapter).

  Why this matters: multiple widgets on the same origin (e.g. several demos served from `localhost:5173`) used to share a single `localStorage` key by default, so injecting a tool call or message in one demo would leak into the next. Setting `persistState: false` now prevents that leakage; for cases that _want_ persistence, pass an explicit `storageAdapter: createLocalStorageAdapter("my-unique-key")`.

  ## `@runtypelabs/persona-proxy`

  ### `STOREFRONT_ASSISTANT_FLOW`

  Add `STOREFRONT_ASSISTANT_FLOW` for product-discovery demos. The flow emits three JSON actions:

  - `{"action": "show_products", "text": "...", "products": [{"id", "title", "price", "image", "description"}]}`: the host page renders these as a product card grid alongside the chat.
  - `{"action": "add_to_cart", "text": "...", "item": {"id", "title", "price"}}`: the host adds the item to its cart.
  - `{"action": "message", "text": "..."}`: plain conversational reply that stays in the chat panel.

  Wired into `examples/persistent-composer.html` as the "Everspun" storefront demo, where asking the agent for products dynamically populates a host-page product grid below the existing hero.

  ### Scheduling flow: half-width form fields

  Teach `DynamicForm` prompts about `width: "half"` so the AI can pair short related inputs (e.g. Phone + Company, City + Zip) side-by-side instead of stacking every field full-width.

## 3.18.0

### Minor Changes

- 7e58039: **`@runtypelabs/persona`**

  - **Human-in-the-loop (`ask_user_question`).** Support Runtype `step_await` (LOCAL tool pause), `client.resumeFlow()`, and `session.resolveAskUserQuestion()`. Synthesize tool messages with `agentMetadata.awaitingLocalTool`, render the answer UI, and resume via `POST` with `toolOutputs` (with `sendMessage` fallback for agents that do not use LOCAL tools). Idempotent `resolveAskUserQuestion` for rapid double-clicks.
  - **Built-in answer UI.** Interactive sheet (stacked rows by default, optional `layout: "pills"`), optional free-text, progressive hydration from streaming tool args, feature flags under `features.askUserQuestion`, and `renderAskUserQuestion` / `parseAskUserQuestionPayload` for custom renderers. Plugins that delegate to the default should return `null` when `message.agentMetadata.askUserQuestionAnswered === true` so the widget owns the answered transcript.
  - **Grouped questions.** Up to 8 questions per call, paginated stepper, `Record<questionText, string | string[]>` result shape, persistence of in-progress state across refresh, labels `nextLabel` / `backLabel` / `submitAllLabel` / `skipLabel`, and optional `groupedAutoAdvance: false`. UX aligned with common AskUserQuestion-style patterns: row layout, skip/back/submit, Q→A pair messages in the transcript, keyboard shortcuts 1–9, compact header, and optional “Other” input behavior per layout.
  - **Fixes.** Composer overlay width and z-index; sheet lifecycle (answered flag, `awaitingLocalTool` gating, prune stale DOM); remove redundant “awaiting” stub when the sheet is the primary UI. Scroll-to-bottom control no longer covers the answer sheet.
  - **Artifacts.** Persist artifact list and selection in `storageAdapter`; `initialArtifacts` / `initialSelectedArtifactId`, `hydrateArtifacts()`, and controller helpers for custom chrome; completed-only persistence for artifacts. Backward compatible with older stored state.
  - **Theming.** `components.introCard` tokens and CSS variables for the welcome / intro card.

  **`@runtypelabs/persona-proxy`**

  - **`POST` resume route** (default under the chat path) forwarding `{ executionId, toolOutputs, streamResponse }` to the upstream `/resume` endpoint for LOCAL tool completion. Pre-configured `RuntypeFlowConfig` examples in this package can declare `ask_user_question` and other `runtimeTools` the same way as any custom flow.

## 3.14.0

### Minor Changes

- 610f4a3: Handle `step_error`, `dispatch_error`, and `flow_error` SSE frames natively: emit `error` events, finalize streaming assistant messages, and transition status to `idle`. Hosts no longer need a custom `parseSSEEvent` callback for these Runtype flow/dispatch error types.

## 3.8.5

### Patch Changes

- f9b5002: Add optional `Stripe-Context` for checkout session creation (`stripeContext` / `STRIPE_CONTEXT`) and require it when using organization secret keys (`sk_org_…`), per Stripe’s organization key rules.

## 3.8.4

### Patch Changes

- f6b0b89: Send a pinned `Stripe-Version` header on Stripe Checkout Session requests so organization API keys and raw REST calls work reliably (matches Stripe versioning requirements).
- f091453: Surface Stripe API error messages when checkout session creation fails, and reject non-integer or non-positive line item prices/quantities before calling Stripe.

## 3.2.1

### Patch Changes

- a723d8e: Harden the proxy for edge runtimes, reduce sensitive development logging, update Hono dependencies for security fixes, and clean up widget build tooling.
- a723d8e: Read `NODE_ENV` and `RUNTYPE_API_KEY` through a runtime-safe env helper (works when `process` is absent), and keep verbose dispatch logs, API key prefix and full JSON payload, strictly in development.

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
