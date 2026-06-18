# Programmatic Control & Events

> Part of the [@runtypelabs/persona](../README.md) documentation.

## Programmatic control

`initAgentWidget` (and `createAgentExperience`) return a controller with methods to programmatically control the widget.

### Basic controls

```ts
const chat = initAgentWidget({
  target: '#launcher-root',
  config: { /* ... */ }
})

document.getElementById('open-chat')?.addEventListener('click', () => chat.open())
document.getElementById('toggle-chat')?.addEventListener('click', () => chat.toggle())
document.getElementById('close-chat')?.addEventListener('click', () => chat.close())
```

### Message hooks

You can programmatically set messages, submit messages, and control voice recognition:

```ts
const chat = initAgentWidget({
  target: '#launcher-root',
  config: { /* ... */ }
})

// Set a message in the input field (doesn't submit)
chat.setMessage("Hello, I need help")

// Submit a message (uses textarea value if no argument provided)
chat.submitMessage()
// Or submit a specific message
chat.submitMessage("What are your hours?")

// Start voice recognition
chat.startVoiceRecognition()

// Stop voice recognition
chat.stopVoiceRecognition()
```

All hook methods return `boolean` indicating success (`true`) or failure (`false`). They will automatically open the widget if it's currently closed (when launcher is enabled).

### Clear chat

```ts
const chat = initAgentWidget({
  target: '#launcher-root',
  config: { /* ... */ }
})

// Clear all messages programmatically
chat.clearChat()
```

### Message Injection

Inject messages programmatically from external sources like tool call responses, system events, or third-party integrations. This is useful when local tools need to push results back into the conversation.

```ts
const chat = initAgentWidget({
  target: '#launcher-root',
  config: { /* ... */ }
})

// Simple message injection
chat.injectAssistantMessage({
  content: 'Here are your search results...'
});

// User message injection
chat.injectUserMessage({
  content: 'Add to cart'
});

// System context injection
chat.injectSystemMessage({
  content: '[Context updated]',
  llmContent: 'User is viewing product page for iPhone 15 Pro'
});
```

**Dual-Content Messages (llmContent)**

Use `llmContent` to show different content to the user versus what gets sent to the LLM. This is useful for:
- **Token efficiency**: Show rich content to users while sending concise summaries to the LLM
- **Sensitive data redaction**: Display PII to users while hiding it from the LLM
- **Context injection**: Provide detailed LLM context with minimal UI footprint

```ts
// Example: Tool callback that injects search results
async function handleProductSearch(query: string) {
  const results = await searchProducts(query);

  // User sees full product details with images and prices
  // LLM receives a concise summary to save tokens
  chat.injectAssistantMessage({
    content: `**Found ${results.length} products:**
${results.map(p => `- ${p.name} - $${p.price} (SKU: ${p.sku})`).join('\n')}`,

    llmContent: `[Search results: ${results.length} products found, price range $${results.minPrice}-$${results.maxPrice}]`
  });
}

// Example: Redacting sensitive information
chat.injectAssistantMessage({
  // User sees their order confirmation with details
  content: `Your order #12345 has been placed!
- Card ending in 4242
- Shipping to: 123 Main St, Anytown, USA`,

  // LLM only knows an order was placed (no PII)
  llmContent: '[Order confirmation displayed to user]'
});
```

**Content Priority**

When messages are sent to the API, content is resolved in this priority order:
1. `contentParts` - Multi-modal content (images, files)
2. `llmContent` - Explicit LLM-specific content
3. `content` - Display content as fallback

**Streaming Updates**

For long-running operations, use the same message ID to update content:

```ts
const messageId = 'search-123';

// Show loading state
chat.injectAssistantMessage({
  id: messageId,
  content: 'Searching...',
  streaming: true
});

// Update with results
chat.injectAssistantMessage({
  id: messageId,
  content: 'Found 5 results...',
  llmContent: '[5 search results]',
  streaming: false
});
```

**Component Directives (`injectComponentDirective`)**

When you've registered a custom component via `componentRegistry.register(...)`, inject an assistant message that renders that component using the same path Persona uses for streamed JSON directives:

```ts
import { componentRegistry } from '@runtypelabs/persona';
import { DynamicForm } from './components';

componentRegistry.register('DynamicForm', DynamicForm);

chat.injectComponentDirective({
  component: 'DynamicForm',
  props: {
    title: 'Book a demo',
    fields: [
      { label: 'Name', type: 'text', required: true },
      { label: 'Email', type: 'email', required: true }
    ],
    submit_text: 'Request meeting'
  },
  text: 'Share your details to book a demo.',
  llmContent: '[Showed booking form]'   // optional, redacted version for the LLM
});
```

The helper sets `content` to `text`, `rawContent` to the canonical directive JSON, and forwards `llmContent`. Useful for previews, replays, debug buttons, and local tools that should render a component instead of plain text.

If you already have a serialized directive, you can pass it through `rawContent` directly on any inject method:

```ts
chat.injectAssistantMessage({
  content: 'Booking form',
  rawContent: JSON.stringify({
    text: 'Booking form',
    component: 'DynamicForm',
    props: { /* ... */ }
  }),
  llmContent: '[Showed booking form]'
});
```

See [docs/MESSAGE-INJECTION.md](./MESSAGE-INJECTION.md#component-directive-injection) for the full reference.

### Event Stream Control

When the `showEventStreamToggle` feature flag is enabled, you can programmatically control the event stream inspector panel:

```ts
const chat = initAgentWidget({
  target: '#launcher-root',
  config: {
    apiUrl: '/api/chat/dispatch',
    features: { showEventStreamToggle: true }
  }
})

// Open the event stream panel
chat.showEventStream()

// Close the event stream panel
chat.hideEventStream()

// Check if the event stream panel is currently visible
chat.isEventStreamVisible() // returns boolean
```

These methods are no-ops if `showEventStreamToggle` is not enabled.

### Input focus control

Focus the chat input programmatically:

```ts
const chat = initAgentWidget({
  target: '#chat-root',
  config: { apiUrl: '/api/chat/dispatch' }
})

// Focus the input (returns true if successful, false if panel is closed or unavailable)
chat.focusInput()
```

In launcher mode, `focusInput()` returns `false` when the panel is closed and does not auto-open it. Use `chat.open()` first if you want to open and focus in one flow.

### Accessing from window

To access the controller globally (e.g., from browser console or external scripts), use the `windowKey` option:

```ts
const chat = initAgentWidget({
  target: '#launcher-root',
  windowKey: 'chatController', // Stores controller on window.chatController
  config: { /* ... */ }
})

// Now accessible globally
window.chatController.setMessage("Hello from console!")
window.chatController.submitMessage("Test message")
window.chatController.startVoiceRecognition()
```

When using the automatic installer script (`install.global.js`), see [Programmatic access with the installer](./INSTALLATION-FRAMEWORKS.md#programmatic-access-with-the-installer) for additional approaches including the `onChatReady` callback and `persona:chat-ready` event.

### Message Types

The widget uses `AgentWidgetMessage` objects to represent messages in the conversation. You can access these through `postprocessMessage` callbacks or by inspecting the session's message array.

```typescript
type AgentWidgetMessage = {
  id: string;                    // Unique message identifier
  role: "user" | "assistant" | "system";
  content: string;               // Message text content
  createdAt: string;             // ISO timestamp
  streaming?: boolean;           // Whether message is still streaming
  variant?: "assistant" | "reasoning" | "tool";
  sequence?: number;             // Message ordering
  reasoning?: AgentWidgetReasoning;
  toolCall?: AgentWidgetToolCall;
  tools?: AgentWidgetToolCall[];
  viaVoice?: boolean;            // Indicates if user message was sent via voice input
};
```

**`viaVoice` field**: Set to `true` when a user message is sent through voice recognition. This allows you to implement voice-specific behaviors, such as automatically reactivating voice recognition after assistant responses. You can check this field in your `postprocessMessage` callback:

```ts
postprocessMessage: ({ message, text, streaming }) => {
  if (message.role === 'user' && message.viaVoice) {
    console.log('User sent message via voice');
  }
  return text;
}
```

Alternatively, manually assign the controller:

```ts
const chat = initAgentWidget({ /* ... */ })
window.chatController = chat
```

## Enriched DOM context

Use `collectEnrichedPageContext` and `formatEnrichedContext` to summarize the visible page for tools or metadata (selectors, roles, text, and optional structured card summaries). By default the collector runs in **structured** mode: it gathers candidates, scores them with built-in `ParseRule` definitions in `defaultParseRules` (product/result-style cards), suppresses redundant descendants, then applies `maxElements`. Pass `options: { mode: "simple" }` for the legacy path (traverse with an early cap only, no rules or `formattedSummary`).

```ts
import {
  collectEnrichedPageContext,
  formatEnrichedContext,
  defaultParseRules
} from '@runtypelabs/persona';

const elements = collectEnrichedPageContext({
  options: {
    mode: 'structured',
    maxElements: 80,
    excludeSelector: '.persona-host',
    maxTextLength: 200,
    visibleOnly: true
  },
  rules: defaultParseRules
});

const pageContext = formatEnrichedContext(elements);
// Structured mode: "Structured summaries:" blocks for matched cards, then grouped interactivity sections.
```

- Omit both `options` and `rules` → structured defaults (`defaultParseRules`, sensible limits).
- `options: { mode: 'structured' }` → explicit structured behavior (same as default).
- `rules: [...]` → custom rules with default options.
- `options: { mode: 'simple' }` → no relation-based scoring or rule-owned formatting. If you also pass `rules`, they are ignored and a console warning is emitted.

Pass `formatEnrichedContext(elements, { mode: 'simple' })` to ignore any `formattedSummary` fields on elements (for example when re-formatting data collected earlier).

**Where things live:** `defaultParseRules` and the rule/config types are part of the public package API: import them from `@runtypelabs/persona` (same entry as `collectEnrichedPageContext`). Exported names you will use most often:

| Export | Role |
| --- | --- |
| `defaultParseRules` | Built-in `ParseRule[]` (commerce-style cards + generic result rows). |
| `ParseRule` | Type for a custom rule: `id`, `scoreElement`, optional `shouldSuppressDescendant`, optional `formatSummary`. |
| `RuleScoringContext` | Argument to rule hooks (`doc`, `maxTextLength`). |
| `ParseOptionsConfig` | `mode`, `maxElements`, `maxCandidates`, `excludeSelector`, `maxTextLength`, `visibleOnly`, `root`. |
| `DomContextOptions` | What you pass to `collectEnrichedPageContext` (`options`, `rules`, plus legacy top-level limits). |
| `FormatEnrichedContextOptions` | Second argument to `formatEnrichedContext` (`mode`). |
| `EnrichedPageElement` | One collected node; optional `formattedSummary` in structured mode. |

Use **Go to definition** (or open `node_modules/@runtypelabs/persona/dist/index.d.ts` after install) for the authoritative field list and JSDoc. Implementation source in this repo: `packages/widget/src/utils/dom-context.ts`.

Custom rule sketch:

```ts
import type { ParseRule } from '@runtypelabs/persona';

const myRules: ParseRule[] = [
  {
    id: 'kpi-tile',
    scoreElement: (el, enriched, ctx) =>
      el.classList.contains('kpi-tile') ? 2000 : 0,
    formatSummary: (el, enriched, ctx) =>
      el.classList.contains('kpi-tile')
        ? `${enriched.text.trim()}\nselector: ${enriched.selector}`
        : null
  }
];
```

### Optional: smart-dom-reader provider

The default reader above is a zero-dependency `TreeWalker` and **does not pierce shadow
DOM**. For pages built from web components, an optional provider backed by a
vendored copy of [`@mcp-b/smart-dom-reader`](https://github.com/WebMCP-org/npm-packages/tree/main/packages/smart-dom-reader)
ships as a **separate entry point**, `@runtypelabs/persona/smart-dom-reader`. It is **not**
imported by the main bundle, so consumers who never import this subpath pay nothing: no
extra install, no bundle weight, no IIFE/CDN impact.

It adds, over the default reader: **Shadow-DOM piercing**, form grouping, and page
landmarks/state: while still emitting Persona's `EnrichedPageElement[]` shape so it
formats and flows through the same pipeline.

```ts
import initAgentWidget from '@runtypelabs/persona';
import { createSmartDomReaderContextProvider } from '@runtypelabs/persona/smart-dom-reader';

initAgentWidget({
  // ...config
  contextProviders: [
    createSmartDomReaderContextProvider({
      // 'interactive' (default) | 'full': full adds semantic content AND is required
      // for shadow-DOM piercing (shadow descendants surface only in full mode).
      mode: 'full',
      contextKey: 'pageContext',            // key under payload.context (default)
      // root: document.querySelector('main') // optional: scope to a subtree, skip chrome
    })
  ]
});
```

`contextProviders` are honored on both send paths: agent mode and flow/proxy dispatch mode merge each provider's result into `payload.context` on every request. `requestMiddleware` then receives that payload, so you can transform or template the collected context before it leaves the browser.

You can also use the pieces directly:

```ts
import {
  collectSmartDomContext,      // → EnrichedPageElement[] (parity with collectEnrichedPageContext)
  smartDomResultToEnriched     // pure mapper: SmartDOMResult → EnrichedPageElement[]
} from '@runtypelabs/persona/smart-dom-reader';
import { formatEnrichedContext } from '@runtypelabs/persona';

const pageContext = formatEnrichedContext(collectSmartDomContext({ mode: 'full' }));
```

Both `collectSmartDomContext()` and `createSmartDomReaderContextProvider()` accept a
`root` element to scope extraction to a subtree (parity with `collectEnrichedPageContext`'s
`root`): useful to read only your main content region and skip nav/sidebars. Shadow DOM
inside the subtree is still pierced.

> **Actionability caveat.** Persona's click loop (`utils/actions.ts`) drives
> `document.querySelector`, which cannot pierce shadow roots or evaluate XPath. The adapter
> therefore prefers plain-CSS selectors; elements reachable only via shadow-piercing or
> XPath selectors are surfaced to the model as **context only** and are **not clickable**
> through the current `message_and_click` handler.

> **Why vendored, not a dependency.** Every published version of `@mcp-b/smart-dom-reader`
> (2.3.1–3.0.0) is mis-published: its `package.json` points to `dist/index.js` /
> `dist/index.d.ts` while the build only ships `.mjs` / `.d.mts`, so it cannot be imported
> by name in Node or any bundler. The library (MIT, zero-dep) is therefore vendored under
> `packages/widget/src/vendor/smart-dom-reader/`; see that directory's `README.md` for
> provenance and update steps. Once upstream republishes correctly this can revert to a
> normal optional peer dependency.

## WebMCP page tools

When `webmcp: { enabled: true }` is set, the widget consumes tools the page
registers on `document.modelContext` (the [WebMCP](https://github.com/webmachinelearning/webmcp)
producer surface), snapshots them into each request as `clientTools[]`, runs the
agent's calls on the page, and gates each behind a confirm bubble (override with
`autoApprove` / `onConfirm`).

```ts
initAgentWidget({
  // ...config
  webmcp: {
    enabled: true,
    autoApprove: (info) => READ_ONLY_TOOLS.has(info.toolName),
  },
});
```

**Give your tools user-facing names.** The approval bubble (and any custom
`onConfirm` handler, via `info.title`) shows a human-readable label for the
tool being called. Declare it once at registration with the WebMCP spec's
top-level `title` field:

```ts
document.modelContext.registerTool({
  name: "add_to_cart",
  title: "Add to Cart", // shown to users in the approval bubble
  description: "Add products to the shopping cart. IMPORTANT: …", // agent-facing
  inputSchema: { /* … */ },
  execute: async (args) => { /* … */ },
});
```

Tools without a `title` get a label derived from their name
(`add_to_cart` → "Add to cart"). The agent-facing `description` is never shown
as the headline: it sits behind the approval bubble's "Show details" toggle.
See [Tool Calls & Approvals](./CONFIGURATION-REFERENCE.md#tool-calls--approvals) for the full summary-line
resolution order and `approval.formatDescription` for parameter-aware copy.
(The legacy `annotations.title` is *not* read: the polyfill's consumer surface
doesn't expose annotations; use top-level `title`.)

**Using WebMCP against a non-Runtype backend (e.g. the Vercel AI SDK)?** The
widget's WebMCP loop expects Runtype's proxy wire protocol (a `step_await` pause
→ `/resume` round-trip). See
[`docs/webmcp-without-runtype.md`](../../../docs/webmcp-without-runtype.md) for the
exact contract and two integration paths, with a runnable Next.js example at
[`examples/ai-sdk-webmcp/`](../../../examples/ai-sdk-webmcp/).

## DOM Events

The widget dispatches custom DOM events that you can listen to for integration with your application:

### `persona:clear-chat`

Dispatched when the user clicks the "Clear chat" button or when `chat.clearChat()` is called programmatically.

```ts
window.addEventListener("persona:clear-chat", (event) => {
  console.log("Chat cleared at:", event.detail.timestamp);
  // Clear your localStorage, reset state, etc.
});
```

**Event detail:**
- `timestamp`: ISO timestamp string of when the chat was cleared

**Use cases:**
- Clear localStorage chat history
- Reset application state
- Track analytics events
- Sync with backend

**Note:** The widget automatically clears the `"persona-chat-history"` localStorage key by default when chat is cleared. If you set `clearChatHistoryStorageKey` in the config, it will also clear that additional key. You can still listen to this event for additional custom behavior.

### `persona:showEventStream` / `persona:hideEventStream`

Dispatched to programmatically open or close the event stream panel. Requires `showEventStreamToggle: true` in the widget config.

```ts
// Open the event stream panel on all widget instances
window.dispatchEvent(new CustomEvent('persona:showEventStream'))

// Close the event stream panel on all widget instances
window.dispatchEvent(new CustomEvent('persona:hideEventStream'))
```

**Instance scoping:** When multiple widget instances exist on the same page, use the `instanceId` detail to target a specific one. For `createAgentExperience`, the `instanceId` is the original `id` of the mount element. For `initAgentWidget`, it's the `id` of the target element.

```ts
// Target only the widget mounted on #inline-widget
window.dispatchEvent(new CustomEvent('persona:showEventStream', {
  detail: { instanceId: 'inline-widget' }
}))

// Events with a non-matching instanceId are ignored
window.dispatchEvent(new CustomEvent('persona:showEventStream', {
  detail: { instanceId: 'wrong-id' }
}))
// ^ No effect: no widget has this instanceId
```

### `persona:focusInput`

Dispatched to programmatically focus the chat input on a widget instance.

```ts
// Focus input on all widget instances
window.dispatchEvent(new CustomEvent('persona:focusInput'))

// Focus input on a specific instance
window.dispatchEvent(new CustomEvent('persona:focusInput', {
  detail: { instanceId: 'inline-widget' }
}))
```

**Instance scoping:** Same as `persona:showEventStream`: use `detail.instanceId` to target a specific widget. Without `instanceId`, all instances receive the event.

### `persona:chat-ready`

Dispatched on `window` by the automatic installer script (`install.global.js`) when the widget is initialized and its controller API is callable. The `event.detail` contains the `AgentWidgetInitHandle` (the same object returned by `initAgentWidget()`). In a deferred install (the default floating-launcher case) this fires after the user first opens the panel; in an eager install it fires on page load.

```ts
window.addEventListener('persona:chat-ready', (e) => {
  const handle = e.detail;
  handle.on('user:message', (msg) => console.log(msg));
  handle.open();
});
```

The installer also dispatches sibling lifecycle events for diagnostics and analytics:

| Event | `detail` | Fires |
| --- | --- | --- |
| `persona:script-load` | `{ version }` | the installer script executed (before any loading) |
| `persona:launcher-shown` | `{ deferred, element? }` | the floating launcher painted on the page (page-load time) |
| `persona:chat-ready` | the widget handle | the widget is initialized and its API is callable |
| `persona:error` | `{ phase, error }` | a load step (`css` / `bundle` / `init`) failed |

> **Note:** These events are only dispatched by the automatic installer script. Direct calls to `initAgentWidget()` return the handle synchronously and do not fire them.

## Controller Events

The widget controller exposes an event system for reacting to chat events. Use `controller.on(eventName, callback)` to subscribe and `controller.off(eventName, callback)` to unsubscribe.

### Available Events

| Event | Payload | Description |
|-------|---------|-------------|
| `user:message` | `AgentWidgetMessage` | Emitted when a new user message is detected. Includes `viaVoice: true` if sent via voice. |
| `assistant:message` | `AgentWidgetMessage` | Emitted when an assistant message starts streaming |
| `assistant:complete` | `AgentWidgetMessage` | Emitted when an assistant message finishes streaming |
| `voice:state` | `AgentWidgetVoiceStateEvent` | Emitted when voice recognition state changes |
| `action:detected` | `AgentWidgetActionEventPayload` | Emitted when an action is parsed from an assistant message |
| `action:resubmit` | `AgentWidgetActionEventPayload` | Emitted when an action handler requests a follow-up/resubmit after injection |
| `widget:opened` | `AgentWidgetStateEvent` | Emitted when the widget panel opens |
| `widget:closed` | `AgentWidgetStateEvent` | Emitted when the widget panel closes |
| `widget:state` | `AgentWidgetStateSnapshot` | Emitted on any widget state change |
| `message:feedback` | `AgentWidgetMessageFeedback` | Emitted when user provides feedback (upvote/downvote) |
| `message:copy` | `AgentWidgetMessage` | Emitted when user copies a message |
| `eventStream:opened` | `{ timestamp: number }` | Emitted when the event stream panel opens |
| `eventStream:closed` | `{ timestamp: number }` | Emitted when the event stream panel closes |
| `approval:requested` | `{ approval, message }` | Emitted when an approval bubble is created |
| `approval:resolved` | `{ approval, decision }` | Emitted when an approval is approved/denied |

### Event Payload Types

```typescript
// Voice state event
type AgentWidgetVoiceStateEvent = {
  active: boolean;
  source: "user" | "auto" | "restore" | "system";
  timestamp: number;
};

// Widget state event (for opened/closed)
type AgentWidgetStateEvent = {
  open: boolean;
  source: "user" | "auto" | "api" | "system";
  timestamp: number;
};

// Widget state snapshot
type AgentWidgetStateSnapshot = {
  open: boolean;
  launcherEnabled: boolean;
  voiceActive: boolean;
  streaming: boolean;
};

// Action event payload
type AgentWidgetActionEventPayload = {
  action: AgentWidgetParsedAction;
  message: AgentWidgetMessage;
};

// Message feedback
type AgentWidgetMessageFeedback = {
  type: "upvote" | "downvote";
  messageId: string;
  message: AgentWidgetMessage;
};
```

### Example: Listening to Events

```ts
const chat = initAgentWidget({
  target: 'body',
  config: { apiUrl: '/api/chat/dispatch' }
});

// Listen for new user messages
chat.on('user:message', (message) => {
  console.log('User sent:', message.content);
  if (message.viaVoice) {
    console.log('Message was sent via voice recognition');
  }
});

// Listen for completed assistant responses
chat.on('assistant:complete', (message) => {
  console.log('Assistant replied:', message.content);
});

// Listen for voice state changes
chat.on('voice:state', (event) => {
  console.log('Voice active:', event.active, 'Source:', event.source);
});

// Listen for widget open/close
chat.on('widget:opened', (event) => {
  console.log('Widget opened by:', event.source);
});

chat.on('widget:closed', (event) => {
  console.log('Widget closed by:', event.source);
});

// Listen for parsed actions from assistant messages
chat.on('action:detected', ({ action, message }) => {
  console.log('Action detected:', action.type, action.payload);
});
```

### Example: Voice Mode Persistence

The `user:message` event is useful for implementing custom voice mode persistence across page navigations:

```ts
const chat = initAgentWidget({
  target: 'body',
  config: {
    apiUrl: '/api/chat/dispatch',
    voiceRecognition: { enabled: true }
  }
});

// Track if the user is in "voice mode"
chat.on('user:message', (message) => {
  localStorage.setItem('voice-mode', message.viaVoice ? 'true' : 'false');
});

// On page load, restore voice mode if the user was using voice
if (localStorage.getItem('voice-mode') === 'true') {
  chat.startVoiceRecognition();
}
```

Note: The built-in `persistState` option handles this automatically when configured:

```ts
initAgentWidget({
  target: 'body',
  config: {
    persistState: true,  // Automatically persists open state and voice mode
    voiceRecognition: { enabled: true, autoResume: 'assistant' }
  }
});
```

## State Loaded Hook

The `onStateLoaded` hook is called after state is loaded from the storage adapter, but before the widget initializes. Use this to transform or inject messages based on external state (e.g., navigation flags, checkout returns).

Returning `{ state, open: true }` also tells the widget to open the panel after initialization: useful when injecting a post-navigation message that the user should immediately see.

```ts
// Plain state transform
initAgentWidget({
  target: 'body',
  config: {
    storageAdapter: createLocalStorageAdapter('my-chat'),
    onStateLoaded: (state) => {
      const navMessage = consumeNavigationFlag();
      if (navMessage) {
        return {
          ...state,
          messages: [...(state.messages || []), {
            id: `nav-${Date.now()}`,
            role: 'assistant',
            content: navMessage,
            createdAt: new Date().toISOString()
          }]
        };
      }
      return state;
    }
  }
});

// Return { state, open: true } to also open the panel
initAgentWidget({
  target: 'body',
  config: {
    storageAdapter: createLocalStorageAdapter('my-chat'),
    onStateLoaded: (state) => {
      const navMessage = consumeNavigationFlag();
      if (navMessage) {
        return {
          state: {
            ...state,
            messages: [...(state.messages || []), {
              id: `nav-${Date.now()}`,
              role: 'assistant',
              content: navMessage,
              createdAt: new Date().toISOString()
            }]
          },
          open: true
        };
      }
      return state;
    }
  }
});
```

**Use cases:**
- Inject messages after page navigation (e.g., "Here are our products!") and open the panel
- Add confirmation messages after checkout/payment returns
- Transform or filter loaded messages
- Inject system messages based on external state

The hook receives the loaded state and must return the (potentially modified) state synchronously.

