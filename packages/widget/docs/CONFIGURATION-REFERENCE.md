# Configuration Reference

> Part of the [@runtypelabs/persona](../README.md) documentation.

## Using default configuration

The package exports a complete default configuration that you can use as a base:

```ts
import { DEFAULT_WIDGET_CONFIG, mergeWithDefaults } from '@runtypelabs/persona';

// Option 1: Use defaults with selective overrides
const controller = initAgentWidget({
  target: '#app',
  config: {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: '/api/chat/dispatch',
    theme: {
      semantic: { colors: { accent: '#2563eb' } }  // Override only what you need
    }
  }
});

// Option 2: Use the merge helper
const controller = initAgentWidget({
  target: '#app',
  config: mergeWithDefaults({
    apiUrl: '/api/chat/dispatch',
    theme: { semantic: { colors: { accent: '#2563eb' } } }
  })
});
```

This ensures all configuration values are set to sensible defaults while allowing you to customize only what you need.

## Configuration reference

All options are safe to mutate via `initAgentWidget(...).update(newConfig)`.

For detailed theme styling properties, see [THEME-CONFIG.md](../THEME-CONFIG.md).

### Core

| Option | Type | Description |
| --- | --- | --- |
| `apiUrl` | `string` | Proxy endpoint for your chat backend. Defaults to Runtype's cloud API. |
| `flowId` | `string` | Runtype flow ID. The client sends it to the proxy to select a specific flow. |
| `debug` | `boolean` | Emits verbose logs to `console`. Default: `false`. |
| `headers` | `Record<string, string>` | Static headers forwarded with each request. |
| `getHeaders` | `() => Record<string, string> \| Promise<...>` | Dynamic headers function called before each request. Use for auth tokens that may change. |
| `customFetch` | `(url, init, payload) => Promise<Response>` | Replace the default `fetch` entirely. Receives URL, RequestInit, and the payload. |
| `parseSSEEvent` | `(eventData) => { text?, done?, error? } \| null` | Transform non-standard SSE events into the expected format. Return `null` to ignore an event. |

### Client Token Mode

When `clientToken` is set, the widget uses `/v1/client/*` endpoints directly from the browser instead of `/v1/dispatch`.

| Option | Type | Description |
| --- | --- | --- |
| `clientToken` | `string` | Client token for direct browser-to-API communication (e.g. `ct_live_flow01k7_...`). Mutually exclusive with `headers` auth. |
| `onSessionInit` | `(session: ClientSession) => void` | Called when the session is initialized. Receives session ID, expiry, flow info. |
| `onSessionExpired` | `() => void` | Called when the session expires or errors. Prompt the user to refresh. |
| `getStoredSessionId` | `() => string \| null` | Return a previously stored session ID for session resumption. |
| `setStoredSessionId` | `(sessionId: string) => void` | Persist the session ID so conversations can be resumed later. |

```typescript
config: {
  clientToken: 'ct_live_flow01k7_a8b9c0d1e2f3g4h5i6j7k8l9',
  onSessionInit: (session) => console.log('Session:', session.sessionId),
  onSessionExpired: () => alert('Session expired — please refresh.'),
  getStoredSessionId: () => localStorage.getItem('session_id'),
  setStoredSessionId: (id) => localStorage.setItem('session_id', id)
}
```

### Agent Mode

Use agent loop execution instead of flow dispatch. Mutually exclusive with `flowId`.

| Option | Type | Description |
| --- | --- | --- |
| `agent` | `AgentConfig` | Agent configuration (see sub-table below). Enables agent loop execution. |
| `agentOptions` | `AgentRequestOptions` | Options for agent execution requests. Default: `{ streamResponse: true, recordMode: 'virtual' }`. |
| `iterationDisplay` | `'separate' \| 'merged'` | How multi-iteration output is shown. `'separate'`: new bubble per iteration. `'merged'`: single bubble. Default: `'separate'`. |

**`AgentConfig`**

| Property | Type | Description |
| --- | --- | --- |
| `name` | `string` | Agent display name. |
| `model` | `string` | Model identifier (e.g. `'openai:gpt-4o-mini'`). |
| `systemPrompt` | `string` | System prompt for the agent. |
| `temperature` | `number?` | Temperature for model responses. |
| `loopConfig` | `AgentLoopConfig?` | Loop behavior configuration (see below). |

**`AgentLoopConfig`**

| Property | Type | Description |
| --- | --- | --- |
| `maxTurns` | `number` | Maximum number of agent turns (1-100). The loop continues while the model calls tools. |
| `maxCost` | `number?` | Maximum cost budget in USD. Agent stops when exceeded. |
| `enableReflection` | `boolean?` | Enable periodic reflection during execution. |
| `reflectionInterval` | `number?` | Number of iterations between reflections (1-50). |

**`AgentToolsConfig`**

| Property | Type | Description |
| --- | --- | --- |
| `toolIds` | `string[]?` | Tool IDs to enable (e.g., `"builtin:exa"`, `"builtin:dalle"`). |
| `toolConfigs` | `Record<string, Record<string, unknown>>?` | Per-tool configuration overrides keyed by tool ID. |
| `runtimeTools` | `Array<Record<string, unknown>>?` | Inline tool definitions for runtime-defined tools. |
| `mcpServers` | `Array<Record<string, unknown>>?` | Custom MCP server connections. |
| `maxToolCalls` | `number?` | Maximum number of tool invocations per execution. |
| `approval` | `{ require: string[] \| boolean; timeout?: number }?` | Tool approval configuration for human-in-the-loop workflows. |

**`AgentRequestOptions`**

| Property | Type | Description |
| --- | --- | --- |
| `streamResponse` | `boolean?` | Stream the response (should be `true` for widget usage). |
| `recordMode` | `'virtual' \| 'existing' \| 'create'?` | Record persistence mode. |
| `storeResults` | `boolean?` | Store results server-side. |
| `debugMode` | `boolean?` | Enable debug mode for additional event data. |

```typescript
config: {
  agent: {
    name: 'Research Assistant',
    model: 'qwen/qwen3-8b',
    systemPrompt: 'You are a research assistant with access to web search.',
    tools: { toolIds: ['builtin:exa'] },
    loopConfig: { maxTurns: 5 }
  },
  agentOptions: { streamResponse: true, recordMode: 'virtual' },
  iterationDisplay: 'merged'
}
```

### UI & Theme

| Option | Type | Description |
| --- | --- | --- |
| `theme` | `DeepPartial<PersonaTheme>` | Semantic tokens (`palette`, `semantic`, `components`). See [THEME-CONFIG.md](../THEME-CONFIG.md). The flat v1 shape (`{ primary, accent, surface, ... }`) is **not** supported — there is no runtime migration; port themes to the token tree. |
| `darkTheme` | `DeepPartial<PersonaTheme>` | Dark-mode token overrides, merged over `theme` when the active scheme is dark. |
| `colorScheme` | `'light' \| 'dark' \| 'auto'` | Color scheme mode. `'auto'` detects from `<html class="dark">` or `prefers-color-scheme`. Default: `'light'`. |
| `copy` | `{ welcomeTitle?, welcomeSubtitle?, inputPlaceholder?, sendButtonLabel?, stopButtonLabel?, showWelcomeCard?, stopReasonNotice? }` | Customize user-facing text strings, hide the welcome card, or override per-stop-reason notices. |
| `autoFocusInput` | `boolean` | Focus the chat input after the panel opens. Skips when voice is active. Default: `false`. |
| `launcherWidth` | `string` | CSS width for the floating launcher panel (e.g. `'320px'`). Default: `'min(440px, calc(100vw - 24px))'`. |

### Launcher

Controls the floating launcher button and panel.

| Option | Type | Description |
| --- | --- | --- |
| `launcher` | `AgentWidgetLauncherConfig` | Launcher button configuration (see key properties below). See [THEME-CONFIG.md](../THEME-CONFIG.md) for the full list of icon, button, and style properties. |

**Key `launcher` properties**

| Property | Type | Description |
| --- | --- | --- |
| `enabled` | `boolean?` | Show the launcher button. |
| `autoExpand` | `boolean?` | Auto-open the chat panel on load. |
| `title` | `string?` | Launcher header title text. |
| `subtitle` | `string?` | Launcher header subtitle text. |
| `iconUrl` | `string?` | URL for the launcher icon image. |
| `position` | `'bottom-right' \| 'bottom-left' \| 'top-right' \| 'top-left'?` | Screen corner position. |
| `mountMode` | `'floating' \| 'docked'?` | Mount as the existing floating launcher or wrap the target with a docked side panel. Default: `'floating'`. |
| `dock` | `{ side?, width?, animate?, reveal? }?` | Dock layout. Defaults: right / `420px` / `animate: true` / `reveal: 'resize'`. `reveal: 'emerge'` = content column animates like resize but the panel stays fixed `dock.width` (clip-in). `reveal: 'overlay'` = transform overlay; `reveal: 'push'` = sliding track. `animate: false` snaps without transition. |
| `width` | `string?` | Width of the launcher button. |
| `fullHeight` | `boolean?` | Fill the full height of the container. Default: `false`. |
| `sidebarMode` | `boolean?` | Flush sidebar layout with no border-radius or margins. Default: `false`. |
| `sidebarWidth` | `string?` | Width when `sidebarMode` is true. Default: `'420px'`. |
| `heightOffset` | `number?` | Pixels to subtract from panel height (for fixed headers, etc.). Default: `0`. |
| `clearChat` | `AgentWidgetClearChatConfig?` | Clear chat button configuration (enabled, placement, icon, styling). |
| `border` | `string?` | Border style for the launcher button. Default: `'1px solid #e5e7eb'`. |
| `shadow` | `string?` | Box shadow for the launcher button. |
| `collapsedMaxWidth` | `string?` | CSS `max-width` for the floating launcher pill when the panel is closed (title/subtitle truncate with ellipsis; full text in `title` tooltip). Does not affect the open panel (`width`). |

In docked mode, `position`, `fullHeight`, and `sidebarMode` are ignored because the widget fills the dock slot created around the target container.

### Layout

| Option | Type | Description |
| --- | --- | --- |
| `layout` | `AgentWidgetLayoutConfig` | Layout configuration (see sub-properties below). |

**`AgentWidgetLayoutConfig`**

| Property | Type | Description |
| --- | --- | --- |
| `showHeader` | `boolean?` | Show/hide the header section entirely. Default: `true`. |
| `showFooter` | `boolean?` | Show/hide the footer/composer section entirely. Default: `true`. |
| `header` | `AgentWidgetHeaderLayoutConfig?` | Header customization (see below). |
| `messages` | `AgentWidgetMessageLayoutConfig?` | Message display customization (see below). |
| `slots` | `Record<WidgetLayoutSlot, SlotRenderer>?` | Content injection into named slots. |

**`header`** — `AgentWidgetHeaderLayoutConfig`

| Property | Type | Description |
| --- | --- | --- |
| `layout` | `'default' \| 'minimal'?` | Header preset. |
| `showIcon` | `boolean?` | Show/hide the header icon. |
| `showTitle` | `boolean?` | Show/hide the title. |
| `showSubtitle` | `boolean?` | Show/hide the subtitle. |
| `showCloseButton` | `boolean?` | Show/hide the close button. |
| `showClearChat` | `boolean?` | Show/hide the clear chat button. |
| `render` | `(ctx: HeaderRenderContext) => HTMLElement?` | Custom renderer that replaces the entire header. |

**`messages`** — `AgentWidgetMessageLayoutConfig`

| Property | Type | Description |
| --- | --- | --- |
| `layout` | `'bubble' \| 'flat' \| 'minimal'?` | Message style preset. Default: `'bubble'`. |
| `avatar` | `{ show?, position?, userAvatar?, assistantAvatar? }?` | Avatar configuration. |
| `timestamp` | `{ show?, position?, format? }?` | Timestamp configuration. |
| `groupConsecutive` | `boolean?` | Group consecutive messages from the same role. |
| `renderUserMessage` | `(ctx: MessageRenderContext) => HTMLElement?` | Custom user message renderer. |
| `renderAssistantMessage` | `(ctx: MessageRenderContext) => HTMLElement?` | Custom assistant message renderer. |

**Available `slots`**: `header-left`, `header-center`, `header-right`, `body-top`, `messages`, `body-bottom`, `footer-top`, `composer`, `footer-bottom`.

### Message Display

| Option | Type | Description |
| --- | --- | --- |
| `postprocessMessage` | `(ctx: { text, message, streaming, raw? }) => string` | Transform message text before rendering (return HTML). |
| `markdown` | `AgentWidgetMarkdownConfig` | Markdown rendering configuration (see sub-table). |
| `messageActions` | `AgentWidgetMessageActionsConfig` | Action buttons on assistant messages (see sub-table). |
| `loadingIndicator` | `AgentWidgetLoadingIndicatorConfig` | Customize the loading indicator (see sub-table). |

**`markdown`** — `AgentWidgetMarkdownConfig`

| Property | Type | Description |
| --- | --- | --- |
| `options` | `AgentWidgetMarkdownOptions?` | Marked parser options: `gfm` (default: `true`), `breaks` (default: `true`), `pedantic`, `headerIds`, `headerPrefix`, `mangle`, `silent`. |
| `renderer` | `AgentWidgetMarkdownRendererOverrides?` | Custom renderers for elements: `heading`, `code`, `blockquote`, `table`, `link`, `image`, `list`, `listitem`, `paragraph`, `codespan`, `strong`, `em`, `hr`, `br`, `del`, `checkbox`, `html`, `text`. Return `false` to use default. |
| `disableDefaultStyles` | `boolean?` | Skip all default markdown CSS styles. Default: `false`. |

**`messageActions`** — `AgentWidgetMessageActionsConfig`

| Property | Type | Description |
| --- | --- | --- |
| `enabled` | `boolean?` | Enable/disable message actions. Default: `true`. |
| `showCopy` | `boolean?` | Show copy button. Default: `true`. |
| `showUpvote` | `boolean?` | Show upvote button. Auto-submitted with `clientToken`. Default: `false`. |
| `showDownvote` | `boolean?` | Show downvote button. Auto-submitted with `clientToken`. Default: `false`. |
| `visibility` | `'always' \| 'hover'?` | Button visibility mode. Default: `'hover'`. |
| `align` | `'left' \| 'center' \| 'right'?` | Horizontal alignment. Default: `'right'`. |
| `layout` | `'pill-inside' \| 'row-inside'?` | Button layout style. Default: `'pill-inside'`. |
| `onFeedback` | `(feedback: AgentWidgetMessageFeedback) => void?` | Callback on upvote/downvote. Called in addition to automatic submission with `clientToken`. |
| `onCopy` | `(message: AgentWidgetMessage) => void?` | Callback on copy. Called in addition to automatic tracking with `clientToken`. |

**`loadingIndicator`** — `AgentWidgetLoadingIndicatorConfig`

| Property | Type | Description |
| --- | --- | --- |
| `showBubble` | `boolean?` | Show bubble background around standalone indicator. Default: `true`. |
| `render` | `(ctx: LoadingIndicatorRenderContext) => HTMLElement \| null?` | Custom render function. Return `null` to hide. Add `data-preserve-animation="true"` for custom animations. |
| `renderIdle` | `(ctx: IdleIndicatorRenderContext) => HTMLElement \| null?` | Custom idle state renderer (shown when not streaming). Return `null` to hide. |

### Streaming & Parsing

| Option | Type | Description |
| --- | --- | --- |
| `parserType` | `'plain' \| 'json' \| 'regex-json' \| 'xml'` | Built-in parser selector. `'plain'` (default), `'json'` (partial-json), `'regex-json'` (regex-based), `'xml'`. |
| `streamParser` | `() => AgentWidgetStreamParser` | Custom stream parser factory. Takes precedence over `parserType`. See [Stream Parser Configuration](./STREAM-PARSERS.md#stream-parser-configuration). |
| `enableComponentStreaming` | `boolean` | Update component props incrementally as they stream in. Default: `true`. |

### Components

| Option | Type | Description |
| --- | --- | --- |
| `components` | `Record<string, AgentWidgetComponentRenderer>` | Registry of custom components rendered from JSON directives (`{"component": "Name", "props": {...}}`). Each renderer receives `(props, context)` and returns an `HTMLElement`. Event listeners attached via `addEventListener` (and any other imperative state on the returned element) are preserved across transcript updates — the widget injects the live element directly into the morphed wrapper so listeners survive subsequent re-renders. The renderer is re-invoked when the directive's props change; for state you want to persist across prop changes, hold it in a closure outside the render. |

```typescript
config: {
  components: {
    ProductCard: (props, { message, config, updateProps }) => {
      const card = document.createElement('div');
      card.innerHTML = `<h3>${props.title}</h3><p>$${props.price}</p>`;
      return card;
    }
  }
}
```

### Voice Recognition

| Option | Type | Description |
| --- | --- | --- |
| `voiceRecognition` | `AgentWidgetVoiceRecognitionConfig` | Voice input configuration (see sub-table). |

**`voiceRecognition`** — `AgentWidgetVoiceRecognitionConfig`

| Property | Type | Description |
| --- | --- | --- |
| `enabled` | `boolean?` | Enable voice recognition. |
| `pauseDuration` | `number?` | Silence duration (ms) before auto-stop. |
| `processingText` | `string?` | Placeholder text while processing voice. Default: `'Processing voice...'`. |
| `processingErrorText` | `string?` | Error text on voice failure. Default: `'Voice processing failed. Please try again.'`. |
| `autoResume` | `boolean \| 'assistant'?` | Auto-resume listening after playback. `'assistant'` resumes after assistant finishes. |
| `provider` | `{ type, browser?, runtype?, custom? }?` | Voice provider configuration (see below). |
| `iconName`, `iconSize`, `iconColor`, `backgroundColor`, `borderColor`, `borderWidth`, `paddingX`, `paddingY`, `tooltipText`, `showTooltip`, `recordingIconColor`, `recordingBackgroundColor`, `recordingBorderColor`, `showRecordingIndicator` | various | Styling options for the voice button. See [THEME-CONFIG.md](../THEME-CONFIG.md). |

**`provider.browser`**

| Property | Type | Description |
| --- | --- | --- |
| `language` | `string?` | Recognition language (e.g. `'en-US'`). |
| `continuous` | `boolean?` | Continuous listening mode. |

**`provider.runtype`**

| Property | Type | Description |
| --- | --- | --- |
| `agentId` | `string` | Runtype agent ID for server-side voice. |
| `clientToken` | `string` | Client token for authentication. |
| `host` | `string?` | API host override. |
| `voiceId` | `string?` | Voice ID for TTS. |
| `pauseDuration` | `number?` | Silence duration (ms) before auto-stop. Default: `2000`. |
| `silenceThreshold` | `number?` | RMS volume threshold for silence detection. Default: `0.01`. |

```typescript
// Browser voice recognition
config: {
  voiceRecognition: {
    enabled: true,
    provider: { type: 'browser', browser: { language: 'en-US' } }
  }
}

// Runtype server-side voice
config: {
  voiceRecognition: {
    enabled: true,
    provider: {
      type: 'runtype',
      runtype: { agentId: 'agent_01abc', clientToken: 'ct_live_...' }
    }
  }
}
```

### Text-to-Speech

| Option | Type | Description |
| --- | --- | --- |
| `textToSpeech` | `TextToSpeechConfig` | TTS configuration (see sub-table). |

**`textToSpeech`** — `TextToSpeechConfig`

| Property | Type | Description |
| --- | --- | --- |
| `enabled` | `boolean` | Enable text-to-speech for assistant messages. |
| `provider` | `'browser' \| 'runtype'?` | `'browser'` uses Web Speech API (default). `'runtype'` delegates to server. |
| `browserFallback` | `boolean?` | When provider is `'runtype'`, fall back to browser TTS for text-typed responses. Default: `false`. |
| `voice` | `string?` | Browser TTS voice name (e.g. `'Google US English'`). |
| `pickVoice` | `(voices: SpeechSynthesisVoice[]) => SpeechSynthesisVoice?` | Custom voice picker when `voice` is not set. |
| `rate` | `number?` | Speech rate (0.1–10). Default: `1`. |
| `pitch` | `number?` | Speech pitch (0–2). Default: `1`. |

```typescript
config: {
  textToSpeech: {
    enabled: true,
    provider: 'browser',
    voice: 'Google US English',
    rate: 1.2,
    pitch: 1.0
  }
}
```

### Tool Calls & Approvals

| Option | Type | Description |
| --- | --- | --- |
| `toolCall` | `AgentWidgetToolCallConfig` | Styling for tool call bubbles: `backgroundColor`, `borderColor`, `borderWidth`, `borderRadius`, `headerBackgroundColor`, `headerTextColor`, `contentBackgroundColor`, `contentTextColor`, `codeBlockBackgroundColor`, `codeBlockBorderColor`, `codeBlockTextColor`, `toggleTextColor`, `labelTextColor`, and padding options. |
| `approval` | `AgentWidgetApprovalConfig \| false` | Tool approval bubble configuration. Set to `false` to disable built-in approval handling. |

**`approval`** — `AgentWidgetApprovalConfig`

| Property | Type | Description |
| --- | --- | --- |
| `title` | `string?` | Title text above the description. |
| `approveLabel` | `string?` | Label for the approve button. |
| `denyLabel` | `string?` | Label for the deny button. |
| `detailsDisplay` | `'collapsed' \| 'expanded' \| 'hidden'?` | How the technical details (agent-facing tool description + raw parameters JSON) are presented. Default: `'collapsed'` (behind a "Show details" toggle). `'expanded'` shows them open; `'hidden'` never renders them. |
| `showDetailsLabel`, `hideDetailsLabel` | `string?` | Labels for the details toggle. Defaults: `"Show details"` / `"Hide details"`. |
| `formatDescription` | `(approval) => string \| undefined` | Build the user-facing summary line. Receives `{ toolName, toolType, description, parameters, displayTitle }`. Return a falsy value to fall back to the default copy for that approval. |
| `backgroundColor`, `borderColor`, `titleColor`, `descriptionColor` | `string?` | Bubble styling. |
| `approveButtonColor`, `approveButtonTextColor` | `string?` | Approve button styling. |
| `denyButtonColor`, `denyButtonTextColor` | `string?` | Deny button styling. |
| `parameterBackgroundColor`, `parameterTextColor` | `string?` | Parameters block styling. |
| `onDecision` | `(data, decision) => Promise<Response \| ReadableStream \| void>?` | Custom approval handler. Return `void` for SDK auto-resolve. |

**How the summary line is chosen.** A tool's wire `description` is written for the
agent (usage rules, prompt prose), not for end users, so the bubble doesn't lead
with it. The user-facing summary resolves in priority order:

1. `formatDescription(...)` from your config, when it returns a non-empty string
2. The display title the tool declared via the WebMCP spec's `ToolDescriptor.title`
   (e.g. `"Add to Cart"`) — WebMCP tools only
3. The humanized tool name — `add_to_cart` / `webmcp:add_to_cart` →
   "Add to cart", `getProductDetails` → "Get product details"
4. The raw `description` (only when the approval carries no tool name at all)

The agent-facing description and the raw parameters JSON stay available behind
the "Show details" toggle (see `detailsDisplay`).

```ts
initAgentWidget({
  // ...config
  approval: {
    // Optional: fully custom, parameter-aware copy per tool. Falsy returns
    // fall back to the default summary, so a sparse map is fine.
    formatDescription: ({ toolName, parameters }) =>
      ({
        add_to_cart: "Add these items to your shopping cart",
        apply_promo_code: `Apply promo code “${(parameters as { code?: string })?.code}”`,
      })[toolName.replace(/^webmcp:/, "")],
  },
});
```

### Suggestion Chips

| Option | Type | Description |
| --- | --- | --- |
| `suggestionChips` | `string[]` | Render quick reply buttons above the composer. |
| `suggestionChipsConfig` | `AgentWidgetSuggestionChipsConfig` | Chip styling: `fontFamily` (`'sans-serif' \| 'serif' \| 'mono'`), `fontWeight`, `paddingX`, `paddingY`. |

### Input & Composer

| Option | Type | Description |
| --- | --- | --- |
| `sendButton` | `AgentWidgetSendButtonConfig` | Send button customization: `borderWidth`, `borderColor`, `paddingX`, `paddingY`, `iconText`, `iconName`, `useIcon`, `tooltipText`, `showTooltip`, `backgroundColor`, `textColor`, `size`. |
| `attachments` | `AgentWidgetAttachmentsConfig` | File attachment configuration (see sub-table). |
| `formEndpoint` | `string` | Endpoint used by built-in directives. Default: `'/form'`. |

**`attachments`** — `AgentWidgetAttachmentsConfig`

| Property | Type | Description |
| --- | --- | --- |
| `enabled` | `boolean?` | Enable file attachments. Default: `false`. |
| `allowedTypes` | `string[]?` | Allowed MIME types. Default: `['image/png', 'image/jpeg', 'image/gif', 'image/webp']`. |
| `maxFileSize` | `number?` | Maximum file size in bytes. Default: `10485760` (10 MB). |
| `maxFiles` | `number?` | Maximum files per message. Default: `4`. |
| `buttonIconName` | `string?` | Lucide icon name. Default: `'image-plus'`. |
| `buttonTooltipText` | `string?` | Tooltip text. Default: `'Attach image'`. |
| `onFileRejected` | `(file, reason: 'type' \| 'size' \| 'count') => void?` | Callback when a file is rejected. |

### Status Indicator

| Option | Type | Description |
| --- | --- | --- |
| `statusIndicator` | `AgentWidgetStatusIndicatorConfig` | Connection status display: `visible`, `idleText`, `connectingText`, `connectedText`, `errorText`. |

### Features

| Option | Type | Description |
| --- | --- | --- |
| `features` | `AgentWidgetFeatureFlags` | Feature flag toggles (see sub-table). |

**`features`** — `AgentWidgetFeatureFlags`

| Property | Type | Description |
| --- | --- | --- |
| `showReasoning` | `boolean?` | Show thinking/reasoning bubbles. Default: `true`. |
| `showToolCalls` | `boolean?` | Show tool usage bubbles. Default: `true`. |
| `showEventStreamToggle` | `boolean?` | Show the event stream inspector toggle in the header. Default: `false`. |
| `composerHistory` | `boolean?` | `Up`/`Down` arrows in the composer navigate previously sent user messages for re-entry/editing (shell / Slack style). Entered only when the caret is at the start of the input, so multi-line cursor movement is preserved. Default: `true`. |
| `eventStream` | `EventStreamConfig?` | Event stream inspector configuration: `badgeColors`, `timestampFormat`, `showSequenceNumbers`, `maxEvents`, `descriptionFields`, `classNames`. |
| `artifacts` | `AgentWidgetArtifactsFeature?` | Artifact sidebar: `enabled`, `allowedTypes`, optional `layout` (see below). |

**`features.artifacts`** — `AgentWidgetArtifactsFeature`

| Property | Type | Description |
| --- | --- | --- |
| `enabled` | `boolean?` | When `true`, shows the artifact pane and handles `artifact_*` SSE events. |
| `allowedTypes` | `('markdown' \| 'component')[]?` | If set, other artifact kinds are ignored client-side. |
| `layout` | `AgentWidgetArtifactsLayoutConfig?` | Split/drawer sizing and launcher widen behavior. |

**`features.artifacts.layout`** — `AgentWidgetArtifactsLayoutConfig`

| Property | Type | Description |
| --- | --- | --- |
| `splitGap` | `string?` | CSS gap between chat column and artifact pane. Default: `0.5rem`. |
| `paneWidth` | `string?` | Artifact column width in split mode. Default: `40%`. |
| `paneMaxWidth` | `string?` | Max width of artifact column. Default: `28rem`. |
| `paneMinWidth` | `string?` | Optional min width of artifact column. |
| `narrowHostMaxWidth` | `number?` | If the **panel** is at most this many px wide, artifacts use an in-panel drawer instead of split. Default: `520`. |
| `expandLauncherPanelWhenOpen` | `boolean?` | When not `false`, the floating panel grows while artifacts are visible (not user-dismissed). Default: widens for launcher mode. |
| `expandedPanelWidth` | `string?` | CSS width when expanded. Default: `min(720px, calc(100vw - 24px))`. |
| `resizable` | `boolean?` | When `true`, draggable handle between chat and artifact in desktop split mode. Default: `false`. |
| `resizableMinWidth` | `string?` | Min artifact width while resizing; `px` only (e.g. `"200px"`). Default: `200px`. |
| `resizableMaxWidth` | `string?` | Optional max artifact width cap (`px` only); layout still limits by panel width. |
| `paneAppearance` | `'panel' \| 'seamless'?` | `panel` (default) — bordered sidebar with left border, gap, and shadow. `seamless` — flush with chat: no border or shadow, container background, zero gap (with `resizable`, the drag handle overlays the seam). |
| `paneBorderRadius` | `string?` | Border radius on the artifact pane. Works with any `paneAppearance`. |
| `paneShadow` | `string?` | CSS `box-shadow` on the artifact pane. Set `"none"` to suppress the default shadow. |
| `paneBorder` | `string?` | Full CSS `border` shorthand on the artifact pane (e.g. `"1px solid #cccccc"`). Overrides default/`rounded` borders. If set, `paneBorderLeft` is ignored. |
| `paneBorderLeft` | `string?` | `border-left` shorthand only — typical for the split edge next to chat (works with or without `resizable`). Example: `"1px solid #cccccc"`. |
| `unifiedSplitChrome` | `boolean?` | Desktop split only: square the main chat card’s **top-right / bottom-right** radii and round the artifact pane’s **top-right / bottom-right** to match the panel (`--persona-radius-lg`) so both columns read as one shell. |
| `unifiedSplitOuterRadius` | `string?` | Outer-right radius on the artifact side when `unifiedSplitChrome` is true. If omitted, uses `--persona-radius-lg`, or `paneBorderRadius` when `paneAppearance: 'rounded'`. |

### State & Storage

| Option | Type | Description |
| --- | --- | --- |
| `initialMessages` | `AgentWidgetMessage[]` | Seed the conversation transcript with initial messages. |
| `persistState` | `boolean \| AgentWidgetPersistStateConfig` | Persist widget state across page navigations. `true` uses defaults (sessionStorage). |
| `storageAdapter` | `AgentWidgetStorageAdapter` | Custom storage adapter with `load()`, `save(state)`, and `clear()` methods. |
| `onStateLoaded` | `(state: AgentWidgetStoredState) => AgentWidgetStoredState \| { state: AgentWidgetStoredState; open?: boolean }` | Transform state after loading from storage but before widget initialization. Return `{ state, open: true }` to also open the panel. |
| `clearChatHistoryStorageKey` | `string` | Additional localStorage key to clear on chat reset. The widget clears `"persona-chat-history"` by default. |

**`persistState`** — `AgentWidgetPersistStateConfig`

| Property | Type | Description |
| --- | --- | --- |
| `storage` | `'local' \| 'session'?` | Storage type. Default: `'session'`. |
| `keyPrefix` | `string?` | Prefix for storage keys. Default: `'persona-'`. |
| `persist.openState` | `boolean?` | Persist widget open/closed state. Default: `true`. |
| `persist.voiceState` | `boolean?` | Persist voice recognition state. Default: `true`. |
| `persist.focusInput` | `boolean?` | Focus input when restoring open state. Default: `true`. |
| `clearOnChatClear` | `boolean?` | Clear persisted state when chat is cleared. Default: `true`. |

### Extensibility

| Option | Type | Description |
| --- | --- | --- |
| `plugins` | `AgentWidgetPlugin[]` | Plugin array for extending widget functionality. |
| `contextProviders` | `AgentWidgetContextProvider[]` | Functions that inject additional context into each request payload. |
| `requestMiddleware` | `AgentWidgetRequestMiddleware` | Transform the request payload before it is sent. |
| `actionParsers` | `AgentWidgetActionParser[]` | Parse structured directives from assistant messages. |
| `actionHandlers` | `AgentWidgetActionHandler[]` | Handle parsed actions (navigation, UI updates, etc.). |

