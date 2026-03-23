## Streaming Agent Widget

Installable vanilla JavaScript widget for embedding a streaming AI assistant on any website.

### Installation

```bash
npm install @runtypelabs/persona
```

### Building locally

```bash
pnpm build
```

- `dist/index.js` (ESM), `dist/index.cjs` (CJS), and `dist/index.global.js` (IIFE) provide different module formats.
- `dist/widget.css` is the prefixed Tailwind bundle.
- `dist/install.global.js` is the automatic installer script for easy script tag installation.

### Using with modules

```ts
import '@runtypelabs/persona/widget.css';
import {
  initAgentWidget,
  createAgentExperience,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG
} from '@runtypelabs/persona';

const proxyUrl = '/api/chat/dispatch';

// Inline embed
const inlineHost = document.querySelector('#inline-widget')!;
createAgentExperience(inlineHost, {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl: proxyUrl,
  launcher: { enabled: false },
  theme: {
    ...DEFAULT_WIDGET_CONFIG.theme,
    accent: '#2563eb'
  },
  suggestionChips: ['What can you do?', 'Show API docs'],
  postprocessMessage: ({ text }) => markdownPostprocessor(text)
});

// Floating launcher with runtime updates
const controller = initAgentWidget({
  target: '#launcher-root',
  windowKey: 'chatController', // Optional: stores controller on window.chatController
  config: {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: proxyUrl,
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      title: 'AI Assistant',
      subtitle: 'Here to help you get answers fast'
    }
  }
});

// Runtime theme update
document.querySelector('#dark-mode')?.addEventListener('click', () => {
  controller.update({ theme: { surface: '#0f172a', primary: '#f8fafc' } });
});

// Docked panel that wraps a concrete workspace container
const docked = initAgentWidget({
  target: '#workspace-main',
  config: {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: proxyUrl,
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      mountMode: 'docked',
      dock: {
        side: 'right',
        width: '420px',
      }
    }
  }
});
```

### Initialization options

`initAgentWidget` accepts the following options:

| Option | Type | Description |
| --- | --- | --- |
| `target` | `string \| HTMLElement` | CSS selector or element where widget mounts. |
| `config` | `AgentWidgetConfig` | Widget configuration object (see [Configuration reference](#configuration-reference) below). |
| `useShadowDom` | `boolean` | Use Shadow DOM for style isolation (default: `true`). |
| `onReady` | `() => void` | Callback fired when widget is initialized. |
| `windowKey` | `string` | If provided, stores the controller on `window[windowKey]` for global access. Automatically cleaned up on `destroy()`. |

When `config.launcher.mountMode` is `'docked'`, `target` is treated as the page container that Persona should wrap. Use a concrete element such as `#workspace-main`; `body` and `html` are rejected.

With **`dock.reveal: 'resize'`** (default), a **closed** dock uses a **`0px`** column. **`'emerge'`** uses the same **column width** animation (content reflows) but the chat panel stays **`dock.width`** wide and is **clipped** by the growing slot—like a normal-width widget emerging from the edge. **`'overlay'`** overlays with `transform`. **`'push'`** uses a sliding track (Shopify-style). The built-in launcher stays hidden in docked mode—open with **`controller.open()`** (or your own chrome).

**Rounded / card layout:** `initAgentWidget` inserts a flex **shell** as the **direct child** of your target’s **parent**, with your `target` in the content column and the dock beside it. Put border-radius, border, and `overflow: hidden` on that **parent** (or an ancestor that wraps only the shell) so the dock column sits inside the same visual card as your content.

**Inner push/overlay:** With `reveal: 'push'` or `'overlay'`, only the wrapped node moves. Use a **narrow `target`** (e.g. a main canvas div). For **`dock.side: 'left'`**, place a persistent rail **in flow** next to the stage (e.g. flex `[nav | stage]`) so the dock doesn’t open **under** the sidebar. For a **right** dock, you can instead use a **full-width** stage with an **absolute** left rail if you want the canvas to translate **behind** that rail.

> **Security note:** When you return HTML from `postprocessMessage`, make sure you sanitise it before injecting into the page. The provided postprocessors (`markdownPostprocessor`, `directivePostprocessor`) do not perform sanitisation.


### Programmatic control

`initAgentWidget` (and `createAgentExperience`) return a controller with methods to programmatically control the widget.

#### Basic controls

```ts
const chat = initAgentWidget({
  target: '#launcher-root',
  config: { /* ... */ }
})

document.getElementById('open-chat')?.addEventListener('click', () => chat.open())
document.getElementById('toggle-chat')?.addEventListener('click', () => chat.toggle())
document.getElementById('close-chat')?.addEventListener('click', () => chat.close())
```

#### Message hooks

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

#### Clear chat

```ts
const chat = initAgentWidget({
  target: '#launcher-root',
  config: { /* ... */ }
})

// Clear all messages programmatically
chat.clearChat()
```

#### Message Injection

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

#### Event Stream Control

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

#### Input focus control

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

#### Accessing from window

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

#### Message Types

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

### Enriched DOM context

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

**Where things live:** `defaultParseRules` and the rule/config types are part of the public package API — import them from `@runtypelabs/persona` (same entry as `collectEnrichedPageContext`). Exported names you will use most often:

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

### DOM Events

The widget dispatches custom DOM events that you can listen to for integration with your application:

#### `persona:clear-chat`

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

#### `persona:showEventStream` / `persona:hideEventStream`

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
// ^ No effect — no widget has this instanceId
```

#### `persona:focusInput`

Dispatched to programmatically focus the chat input on a widget instance.

```ts
// Focus input on all widget instances
window.dispatchEvent(new CustomEvent('persona:focusInput'))

// Focus input on a specific instance
window.dispatchEvent(new CustomEvent('persona:focusInput', {
  detail: { instanceId: 'inline-widget' }
}))
```

**Instance scoping:** Same as `persona:showEventStream` — use `detail.instanceId` to target a specific widget. Without `instanceId`, all instances receive the event.

### Controller Events

The widget controller exposes an event system for reacting to chat events. Use `controller.on(eventName, callback)` to subscribe and `controller.off(eventName, callback)` to unsubscribe.

#### Available Events

| Event | Payload | Description |
|-------|---------|-------------|
| `user:message` | `AgentWidgetMessage` | Emitted when a new user message is detected. Includes `viaVoice: true` if sent via voice. |
| `assistant:message` | `AgentWidgetMessage` | Emitted when an assistant message starts streaming |
| `assistant:complete` | `AgentWidgetMessage` | Emitted when an assistant message finishes streaming |
| `voice:state` | `AgentWidgetVoiceStateEvent` | Emitted when voice recognition state changes |
| `action:detected` | `AgentWidgetActionEventPayload` | Emitted when an action is parsed from an assistant message |
| `widget:opened` | `AgentWidgetStateEvent` | Emitted when the widget panel opens |
| `widget:closed` | `AgentWidgetStateEvent` | Emitted when the widget panel closes |
| `widget:state` | `AgentWidgetStateSnapshot` | Emitted on any widget state change |
| `message:feedback` | `AgentWidgetMessageFeedback` | Emitted when user provides feedback (upvote/downvote) |
| `message:copy` | `AgentWidgetMessage` | Emitted when user copies a message |
| `eventStream:opened` | `{ timestamp: number }` | Emitted when the event stream panel opens |
| `eventStream:closed` | `{ timestamp: number }` | Emitted when the event stream panel closes |

#### Event Payload Types

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

#### Example: Listening to Events

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

#### Example: Voice Mode Persistence

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

### State Loaded Hook

The `onStateLoaded` hook is called after state is loaded from the storage adapter, but before the widget initializes. Use this to transform or inject messages based on external state (e.g., navigation flags, checkout returns).

```ts
initAgentWidget({
  target: 'body',
  config: {
    storageAdapter: createLocalStorageAdapter('my-chat'),
    onStateLoaded: (state) => {
      // Check for pending navigation message
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
```

**Use cases:**
- Inject messages after page navigation (e.g., "Here are our products!")
- Add confirmation messages after checkout/payment returns
- Transform or filter loaded messages
- Inject system messages based on external state

The hook receives the loaded state and must return the (potentially modified) state synchronously.

### Message Actions (Copy, Upvote, Downvote)

The widget includes built-in action buttons for assistant messages that allow users to copy message content and provide feedback through upvote/downvote buttons.

#### Configuration

```ts
const controller = initAgentWidget({
  target: '#app',
  config: {
    apiUrl: '/api/chat/dispatch',
    
    // Message actions configuration
    messageActions: {
      enabled: true,              // Enable/disable all action buttons (default: true)
      showCopy: true,             // Show copy button (default: true)
      showUpvote: true,           // Show upvote button (default: false - requires backend)
      showDownvote: true,         // Show downvote button (default: false - requires backend)
      visibility: 'hover',        // 'hover' or 'always' (default: 'hover')
      align: 'right',             // 'left', 'center', or 'right' (default: 'right')
      layout: 'pill-inside',      // 'pill-inside' (compact floating) or 'row-inside' (full-width bar)
      
      // Optional callbacks (called in addition to events)
      onCopy: (message) => {
        console.log('Copied:', message.id);
      },
      onFeedback: (feedback) => {
        console.log('Feedback:', feedback.type, feedback.messageId);
        // Send to your analytics/backend
        fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(feedback)
        });
      }
    }
  }
});
```

#### Feedback Events

Listen to feedback events via the controller:

```ts
// Copy event - fired when user copies a message
controller.on('message:copy', (message) => {
  console.log('Message copied:', message.id, message.content);
});

// Feedback event - fired when user upvotes or downvotes
controller.on('message:feedback', (feedback) => {
  console.log('Feedback received:', {
    type: feedback.type,         // 'upvote' or 'downvote'
    messageId: feedback.messageId,
    message: feedback.message    // Full message object
  });
});
```

#### Feedback Types

```typescript
type AgentWidgetMessageFeedback = {
  type: 'upvote' | 'downvote';
  messageId: string;
  message: AgentWidgetMessage;
};

type AgentWidgetMessageActionsConfig = {
  enabled?: boolean;
  showCopy?: boolean;
  showUpvote?: boolean;
  showDownvote?: boolean;
  visibility?: 'always' | 'hover';
  onFeedback?: (feedback: AgentWidgetMessageFeedback) => void;
  onCopy?: (message: AgentWidgetMessage) => void;
};
```

#### Visual Behavior

- **Hover mode** (`visibility: 'hover'`): Action buttons appear when hovering over assistant messages
- **Always mode** (`visibility: 'always'`): Action buttons are always visible
- **Copy button**: Shows a checkmark briefly after successful copy
- **Vote buttons**: Toggle active state and are mutually exclusive (upvoting clears downvote and vice versa)

### Loading & Idle Indicators

The widget displays visual indicators during different states of the conversation:

- **Loading indicator**: Shown while waiting for a response (standalone) or when an assistant message is streaming but has no content yet (inline)
- **Idle indicator**: Shown when the widget is idle (not streaming) and has at least one message - useful for showing the assistant is "waiting" for user input

#### Configuration

```ts
const controller = initAgentWidget({
  target: '#app',
  config: {
    apiUrl: '/api/chat/dispatch',

    loadingIndicator: {
      // Show/hide bubble styling around standalone indicator (default: true)
      showBubble: false,

      // Custom loading indicator renderer
      render: ({ location, config, defaultRenderer }) => {
        // location: 'standalone' (separate bubble) or 'inline' (inside message)
        if (location === 'standalone') {
          const el = document.createElement('div');
          el.innerHTML = '<svg class="spinner">...</svg>';
          el.setAttribute('data-preserve-animation', 'true');
          return el;
        }
        // Use default 3-dot bouncing indicator for inline
        return defaultRenderer();
      },

      // Custom idle state indicator (shown after response completes)
      renderIdle: ({ lastMessage, messageCount, config }) => {
        // Only show after assistant messages
        if (lastMessage?.role !== 'assistant') return null;

        const el = document.createElement('div');
        el.textContent = 'What would you like to do next?';
        el.setAttribute('data-preserve-animation', 'true');
        return el;
      }
    }
  }
});
```

#### Indicator Locations

| Location | When Shown | Description |
|----------|------------|-------------|
| `standalone` | Waiting for stream to start | Separate bubble shown after user sends a message |
| `inline` | Streaming with empty content | Inside the assistant message bubble |
| `idle` | Not streaming, has messages | After assistant finishes responding |

#### Animation Preservation

When using custom animated indicators, add the `data-preserve-animation="true"` attribute to prevent the DOM morpher from interrupting CSS animations during updates:

```ts
render: () => {
  const el = document.createElement('div');
  el.setAttribute('data-preserve-animation', 'true');
  el.innerHTML = `
    <style>
      @keyframes spin { to { transform: rotate(360deg); } }
      .spinner { animation: spin 1s linear infinite; }
    </style>
    <div class="spinner">⟳</div>
  `;
  return el;
}
```

#### Hiding Indicators

Return `null` from any render function to hide that indicator:

```ts
loadingIndicator: {
  // Hide loading indicator entirely
  render: () => null,

  // Hide idle indicator (default behavior)
  renderIdle: () => null
}
```

#### Using Plugins

You can also customize indicators via plugins, which take priority over config:

```ts
const customIndicatorPlugin = {
  id: 'custom-indicators',

  renderLoadingIndicator: ({ location, defaultRenderer }) => {
    if (location === 'standalone') {
      return createCustomSpinner();
    }
    return defaultRenderer();
  },

  renderIdleIndicator: ({ lastMessage, messageCount }) => {
    if (messageCount === 0) return null;
    if (lastMessage?.role !== 'assistant') return null;
    return createIdleAnimation();
  }
};

initAgentWidget({
  target: '#app',
  config: {
    plugins: [customIndicatorPlugin]
  }
});
```

#### Type Definitions

```typescript
// Loading indicator context
type LoadingIndicatorRenderContext = {
  config: AgentWidgetConfig;
  streaming: boolean;
  location: 'inline' | 'standalone';
  defaultRenderer: () => HTMLElement;
};

// Idle indicator context
type IdleIndicatorRenderContext = {
  config: AgentWidgetConfig;
  lastMessage: AgentWidgetMessage | undefined;
  messageCount: number;
};

// Configuration
type AgentWidgetLoadingIndicatorConfig = {
  showBubble?: boolean;
  render?: (context: LoadingIndicatorRenderContext) => HTMLElement | null;
  renderIdle?: (context: IdleIndicatorRenderContext) => HTMLElement | null;
};
```

#### Priority Chain

Indicators are resolved in this order:
1. **Plugin hook** (`renderLoadingIndicator` / `renderIdleIndicator`)
2. **Config function** (`loadingIndicator.render` / `loadingIndicator.renderIdle`)
3. **Default** (3-dot bouncing animation for loading, `null` for idle)

### Dropdown Menu

A reusable dropdown menu utility for building custom menus in plugins, custom components, or host-page UI that matches the widget's theme.

#### Basic usage

```ts
import { createDropdownMenu } from '@runtypelabs/persona';

const button = document.querySelector('#my-button')!;
const wrapper = document.createElement('div');
wrapper.style.position = 'relative';
button.parentElement!.insertBefore(wrapper, button);
wrapper.appendChild(button);

const dropdown = createDropdownMenu({
  items: [
    { id: 'edit', label: 'Edit', icon: 'pencil' },
    { id: 'duplicate', label: 'Duplicate', icon: 'copy' },
    { id: 'delete', label: 'Delete', icon: 'trash-2', destructive: true, dividerBefore: true },
  ],
  onSelect: (id) => console.log('Selected:', id),
  anchor: wrapper,
  position: 'bottom-left', // or 'bottom-right'
});

wrapper.appendChild(dropdown.element);
button.addEventListener('click', () => dropdown.toggle());
```

#### Escaping overflow containers

When the anchor is inside a container with `overflow: hidden`, use the `portal` option to render the menu at a higher DOM level while keeping CSS variable inheritance:

```ts
const dropdown = createDropdownMenu({
  items: [...],
  onSelect: (id) => { /* handle */ },
  anchor: myButton,
  position: 'bottom-right',
  portal: document.querySelector('[data-persona-root]')!,
});
// No need to append — portal mode appends automatically
```

#### Header dropdown menus

Trailing header actions support built-in dropdown menus via the `menuItems` property:

```ts
createAgentExperience(mount, {
  layout: {
    header: {
      layout: 'minimal',
      trailingActions: [
        {
          id: 'options',
          icon: 'chevron-down',
          ariaLabel: 'Options',
          menuItems: [
            { id: 'settings', label: 'Settings', icon: 'settings' },
            { id: 'help', label: 'Help', icon: 'help-circle' },
            { id: 'logout', label: 'Log out', icon: 'log-out', destructive: true, dividerBefore: true },
          ]
        }
      ],
      onAction: (actionId) => {
        // Receives the menu item id when selected
        console.log('Action:', actionId);
      }
    }
  }
});
```

#### Theming

Dropdown menus are styled via CSS custom properties with semantic fallbacks:

| Variable | Description | Fallback |
|----------|-------------|----------|
| `--persona-dropdown-bg` | Menu background | `--persona-surface` |
| `--persona-dropdown-border` | Menu border | `--persona-border` |
| `--persona-dropdown-radius` | Border radius | `0.625rem` |
| `--persona-dropdown-shadow` | Box shadow | `0 4px 16px rgba(0,0,0,0.12)` |
| `--persona-dropdown-item-color` | Item text color | `--persona-text` |
| `--persona-dropdown-item-hover-bg` | Item hover background | `--persona-container` |
| `--persona-dropdown-destructive-color` | Destructive item color | `#ef4444` |

Artifact toolbar copy menu tokens (`copyMenuBackground`, `copyMenuBorder`, etc.) also set the dropdown variables as defaults, so dropdown theming works with the existing artifact token config.

#### Type definitions

```ts
interface DropdownMenuItem {
  id: string;
  label: string;
  icon?: string;        // Lucide icon name
  destructive?: boolean;
  dividerBefore?: boolean;
}

interface CreateDropdownOptions {
  items: DropdownMenuItem[];
  onSelect: (id: string) => void;
  anchor: HTMLElement;
  position?: 'bottom-left' | 'bottom-right';
  portal?: HTMLElement;
}

interface DropdownMenuHandle {
  element: HTMLElement;
  show: () => void;
  hide: () => void;
  toggle: () => void;
  destroy: () => void;
}
```

### Button Utilities

Composable button factories for building custom toolbars, actions, and toggle controls that match the widget's theme.

#### Icon button

```ts
import { createIconButton } from '@runtypelabs/persona';

const refreshBtn = createIconButton({
  icon: 'refresh-cw',
  label: 'Refresh',
  onClick: () => handleRefresh(),
});
toolbar.appendChild(refreshBtn);
```

#### Label button

```ts
import { createLabelButton } from '@runtypelabs/persona';

const copyBtn = createLabelButton({
  icon: 'copy',
  label: 'Copy',
  variant: 'default',   // 'default' | 'primary' | 'destructive' | 'ghost'
  onClick: () => copyToClipboard(),
});
```

#### Toggle group

```ts
import { createToggleGroup } from '@runtypelabs/persona';

const toggle = createToggleGroup({
  items: [
    { id: 'preview', icon: 'eye', label: 'Preview' },
    { id: 'source', icon: 'code-2', label: 'Source' },
  ],
  selectedId: 'preview',
  onSelect: (id) => setViewMode(id),
});
toolbar.appendChild(toggle.element);

// Programmatic update (does not fire onSelect)
toggle.setSelected('source');
```

#### Theming

All button utilities are styled via CSS custom properties:

| Variable | Component | Description | Fallback |
|----------|-----------|-------------|----------|
| `--persona-icon-btn-bg` | Icon button | Background | `--persona-surface` |
| `--persona-icon-btn-border` | Icon button | Border | `--persona-border` |
| `--persona-icon-btn-color` | Icon button | Icon color | `--persona-text` |
| `--persona-icon-btn-hover-bg` | Icon button | Hover background | `--persona-container` |
| `--persona-icon-btn-hover-color` | Icon button | Hover color | `inherit` |
| `--persona-icon-btn-active-bg` | Icon button | Pressed/active bg | `--persona-container` |
| `--persona-icon-btn-active-border` | Icon button | Pressed/active border | `--persona-border` |
| `--persona-icon-btn-padding` | Icon button | Padding | `0.25rem` |
| `--persona-icon-btn-radius` | Icon button | Border radius | `--persona-radius-md` |
| `--persona-label-btn-bg` | Label button | Background | `--persona-surface` |
| `--persona-label-btn-border` | Label button | Border | `--persona-border` |
| `--persona-label-btn-color` | Label button | Text color | `--persona-text` |
| `--persona-label-btn-hover-bg` | Label button | Hover background | `--persona-container` |
| `--persona-label-btn-font-size` | Label button | Font size | `0.75rem` |
| `--persona-toggle-group-gap` | Toggle group | Gap between items | `0` |
| `--persona-toggle-group-radius` | Toggle group | First/last radius | `--persona-icon-btn-radius` |

These can also be set via the widget config's theme token system:

```ts
createAgentExperience(mount, {
  darkTheme: {
    components: {
      iconButton: {
        background: 'transparent',
        border: 'none',
        hoverBackground: '#2B2B2B',
        hoverColor: '#E5E5E5',
      },
      toggleGroup: {
        gap: '0',
        borderRadius: '8px',
      },
    }
  }
});
```

### Runtype adapter

This package ships with a Runtype adapter by default. The proxy handles all flow configuration, keeping the client lightweight and flexible.

**Flow configuration happens server-side** - you have three options:

1. **Use default flow** - The proxy includes a basic streaming chat flow out of the box
2. **Reference a Runtype flow ID** - Configure flows in your Runtype dashboard and reference them by ID
3. **Define custom flows** - Build flow configurations directly in the proxy

The client simply sends messages to the proxy, which constructs the full Runtype payload. This architecture allows you to:
- Change models/prompts without redeploying the widget
- A/B test different flows server-side
- Enforce security and cost controls centrally
- Support multiple flows for different use cases

### Dynamic Forms (Recommended)

For rendering AI-generated forms, use the **component middleware** approach with the `DynamicForm` component. This allows the AI to create contextually appropriate forms with any fields:

```typescript
import { componentRegistry, initAgentWidget } from "@runtypelabs/persona";
import { DynamicForm } from "./components"; // Your DynamicForm component

// Register the component
componentRegistry.register("DynamicForm", DynamicForm);

initAgentWidget({
  target: "#app",
  config: {
    apiUrl: "/api/chat/dispatch-directive",
    parserType: "json",
    enableComponentStreaming: true,
    formEndpoint: "/form",
    // Optional: customize form appearance
    formStyles: {
      borderRadius: "16px",
      borderWidth: "1px",
      borderColor: "#e5e7eb",
      padding: "1.5rem",
      titleFontSize: "1.25rem",
      buttonBorderRadius: "9999px"
    }
  }
});
```

The AI responds with JSON like:

```json
{
  "text": "Please fill out this form:",
  "component": "DynamicForm",
  "props": {
    "title": "Contact Us",
    "fields": [
      { "label": "Name", "type": "text", "required": true },
      { "label": "Email", "type": "email", "required": true }
    ],
    "submit_text": "Submit"
  }
}
```

See `examples/embedded-app/json.html` for a full working example.

### Directive postprocessor (Deprecated)

> **⚠️ Deprecated:** The `directivePostprocessor` approach is deprecated in favor of the component middleware with `DynamicForm`. The old approach only supports predefined form templates ("init" and "followup"), while the new approach allows AI-generated forms with any fields.

`directivePostprocessor` looks for either `<Form type="init" />` tokens or
`<Directive>{"component":"form","type":"init"}</Directive>` blocks and swaps them for placeholders that the widget upgrades into interactive UI. This approach is limited to the predefined form templates in `formDefinitions`.

### Script tag installation

The widget can be installed via a simple script tag, perfect for platforms where you can't compile custom code. There are two methods:

#### Method 1: Automatic installer (recommended)

The easiest way is to use the automatic installer script. It handles loading CSS and JavaScript, then initializes the widget automatically:

```html
<!-- Add this before the closing </body> tag -->
<script>
  window.siteAgentConfig = {
    target: 'body', // or '#my-container' for specific placement
    config: {
      apiUrl: 'https://your-proxy.com/api/chat/dispatch',
      launcher: {
        enabled: true,
        title: 'AI Assistant',
        subtitle: 'How can I help you?'
      },
      theme: {
        accent: '#2563eb',
        surface: '#ffffff'
      },
      // Optional: configure stream parser for JSON/XML responses
      // streamParser: () => window.AgentWidget.createJsonStreamParser()
    }
  };
</script>
<script src="https://cdn.jsdelivr.net/npm/@runtypelabs/persona@latest/dist/install.global.js"></script>
```

**Installer options:**

- `version` - Package version to load (default: `"latest"`)
- `cdn` - CDN provider: `"jsdelivr"` or `"unpkg"` (default: `"jsdelivr"`)
- `cssUrl` - Custom CSS URL (overrides CDN)
- `jsUrl` - Custom JS URL (overrides CDN)
- `target` - CSS selector or element where widget mounts (default: `"body"`)
- `config` - Widget configuration object (see Configuration reference)
- `autoInit` - Automatically initialize after loading (default: `true`)

**Example with version pinning:**

```html
<script>
  window.siteAgentConfig = {
    version: '0.1.0', // Pin to specific version
    config: {
      apiUrl: '/api/chat/dispatch',
      launcher: { enabled: true, title: 'Support Chat' }
    }
  };
</script>
<script src="https://cdn.jsdelivr.net/npm/@runtypelabs/persona@0.1.0/dist/install.global.js"></script>
```

#### Method 2: Manual installation

For more control, manually load CSS and JavaScript:

```html
<!-- Load CSS -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@runtypelabs/persona@latest/dist/widget.css" />

<!-- Load JavaScript -->
<script src="https://cdn.jsdelivr.net/npm/@runtypelabs/persona@latest/dist/index.global.js"></script>

<!-- Initialize widget -->
<script>
  const chatController = window.AgentWidget.initAgentWidget({
    target: '#persona-anchor', // or 'body' for floating launcher
    windowKey: 'chatWidget', // Optional: stores controller on window.chatWidget
    config: {
      apiUrl: '/api/chat/dispatch',
      launcher: {
        enabled: true,
        title: 'AI Assistant',
        subtitle: 'Here to help'
      },
      theme: {
        accent: '#111827',
        surface: '#f5f5f5'
      },
      // Optional: configure stream parser for JSON/XML responses
      streamParser: window.AgentWidget.createJsonStreamParser // or createXmlParser, createPlainTextParser
    }
  });
  
  // Controller is now available as window.chatWidget (if windowKey was used)
  // or use the returned chatController variable
</script>
```

**CDN options:**

- **jsDelivr** (recommended): `https://cdn.jsdelivr.net/npm/@runtypelabs/persona@VERSION/dist/`
- **unpkg**: `https://unpkg.com/@runtypelabs/persona@VERSION/dist/`

Replace `VERSION` with `latest` for auto-updates, or a specific version like `0.1.0` for stability.

**Available files:**

- `widget.css` - Stylesheet (required)
- `index.global.js` - Widget JavaScript (IIFE format)
- `install.global.js` - Automatic installer script

The script build exposes a `window.AgentWidget` global with `initAgentWidget()` and other exports, including parser functions:

- `window.AgentWidget.initAgentWidget()` - Initialize the widget
- `window.AgentWidget.createPlainTextParser()` - Plain text parser (default)
- `window.AgentWidget.createJsonStreamParser()` - JSON parser using schema-stream
- `window.AgentWidget.createXmlParser()` - XML parser
- `window.AgentWidget.markdownPostprocessor()` - Markdown postprocessor
- `window.AgentWidget.directivePostprocessor()` - Directive postprocessor *(deprecated)*
- `window.AgentWidget.componentRegistry` - Component registry for custom components

### React Framework Integration

The widget is fully compatible with React frameworks. Use the ESM imports to integrate it as a client component.

#### Framework Compatibility

| Framework | Compatible | Implementation Notes |
|-----------|------------|---------------------|
| **Vite** | ✅ Yes | No special requirements - works out of the box |
| **Create React App** | ✅ Yes | No special requirements - works out of the box |
| **Next.js** | ✅ Yes | Requires `'use client'` directive (App Router) |
| **Remix** | ✅ Yes | Use dynamic import or `useEffect` guard for SSR |
| **Gatsby** | ✅ Yes | Use in `wrapRootElement` or check `typeof window !== 'undefined'` |
| **Astro** | ✅ Yes | Use `client:load` or `client:only="react"` directive |

#### Quick Start with Vite or Create React App

For client-side-only React frameworks (Vite, CRA), create a component:

```typescript
// src/components/ChatWidget.tsx
import { useEffect } from 'react';
import '@runtypelabs/persona/widget.css';
import { initAgentWidget, markdownPostprocessor } from '@runtypelabs/persona';
import type { AgentWidgetInitHandle } from '@runtypelabs/persona';

export function ChatWidget() {
  useEffect(() => {
    let handle: AgentWidgetInitHandle | null = null;
    
    handle = initAgentWidget({
      target: 'body',
      config: {
        apiUrl: "/api/chat/dispatch",
        theme: {
          primary: "#111827",
          accent: "#1d4ed8",
        },
        launcher: {
          enabled: true,
          title: "Chat Assistant",
          subtitle: "Here to help you get answers fast"
        },
        postprocessMessage: ({ text }) => markdownPostprocessor(text)
      }
    });

    // Cleanup on unmount
    return () => {
      if (handle) {
        handle.destroy();
      }
    };
  }, []);

  return null; // Widget injects itself into the DOM
}
```

Then use it in your app:

```typescript
// src/App.tsx
import { ChatWidget } from './components/ChatWidget';

function App() {
  return (
    <div>
      {/* Your app content */}
      <ChatWidget />
    </div>
  );
}

export default App;
```

#### Next.js Integration

For Next.js App Router, add the `'use client'` directive:

```typescript
// components/ChatWidget.tsx
'use client';

import { useEffect } from 'react';
import '@runtypelabs/persona/widget.css';
import { initAgentWidget, markdownPostprocessor } from '@runtypelabs/persona';
import type { AgentWidgetInitHandle } from '@runtypelabs/persona';

export function ChatWidget() {
  useEffect(() => {
    let handle: AgentWidgetInitHandle | null = null;
    
    handle = initAgentWidget({
      target: 'body',
      config: {
        apiUrl: "/api/chat/dispatch",
        launcher: {
          enabled: true,
          title: "Chat Assistant",
        },
        postprocessMessage: ({ text }) => markdownPostprocessor(text)
      }
    });

    return () => {
      if (handle) {
        handle.destroy();
      }
    };
  }, []);

  return null;
}
```

Use it in your layout or page:

```typescript
// app/layout.tsx
import { ChatWidget } from '@/components/ChatWidget';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ChatWidget />
      </body>
    </html>
  );
}
```

**Alternative: Dynamic Import (SSR-Safe)**

If you encounter SSR issues, use Next.js dynamic imports:

```typescript
// app/layout.tsx
import dynamic from 'next/dynamic';

const ChatWidget = dynamic(
  () => import('@/components/ChatWidget').then(mod => mod.ChatWidget),
  { ssr: false }
);

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ChatWidget />
      </body>
    </html>
  );
}
```

#### Remix Integration

For Remix, guard the widget initialization with a client-side check:

```typescript
// app/components/ChatWidget.tsx
import { useEffect, useState } from 'react';

export function ChatWidget() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Dynamic import to avoid SSR issues
    import('@runtypelabs/persona/widget.css');
    import('@runtypelabs/persona').then(({ initAgentWidget, markdownPostprocessor }) => {
      const handle = initAgentWidget({
        target: 'body',
        config: {
          apiUrl: "/api/chat/dispatch",
          launcher: { enabled: true },
          postprocessMessage: ({ text }) => markdownPostprocessor(text)
        }
      });
      
      return () => handle?.destroy();
    });
  }, []);

  if (!mounted) return null;
  return null;
}
```

#### Gatsby Integration

Use Gatsby's `wrapRootElement` API:

```typescript
// gatsby-browser.js
import { ChatWidget } from './src/components/ChatWidget';

export const wrapRootElement = ({ element }) => (
  <>
    {element}
    <ChatWidget />
  </>
);
```

#### Astro Integration

Use Astro's client directives with React islands:

```astro
---
// src/components/ChatWidget.astro
import { ChatWidget } from './ChatWidget.tsx';
---

<ChatWidget client:load />
```

#### Using the Theme Configurator

For easy configuration generation, use the [Theme Configurator](https://github.com/becomevocal/chaty/tree/main/examples/embedded-app) which includes a "React (Client Component)" export option. It generates a complete React component with your custom theme, launcher settings, and all configuration options.

#### Installation

```bash
npm install @runtypelabs/persona
# or
pnpm add @runtypelabs/persona
# or
yarn add @runtypelabs/persona
```

#### Key Considerations

1. **CSS Import**: The CSS import (`import '@runtypelabs/persona/widget.css'`) works natively with all modern React build tools
2. **Client-Side Only**: The widget manipulates the DOM, so it must run client-side only
3. **Cleanup**: Always call `handle.destroy()` in the cleanup function to prevent memory leaks
4. **API Routes**: Ensure your `apiUrl` points to a valid backend endpoint
5. **TypeScript Support**: Full TypeScript definitions are included for all exports

### Using default configuration

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
      ...DEFAULT_WIDGET_CONFIG.theme,
      accent: '#custom-color'  // Override only what you need
    }
  }
});

// Option 2: Use the merge helper
const controller = initAgentWidget({
  target: '#app',
  config: mergeWithDefaults({
    apiUrl: '/api/chat/dispatch',
    theme: { accent: '#custom-color' }
  })
});
```

This ensures all configuration values are set to sensible defaults while allowing you to customize only what you need.

### Configuration reference

All options are safe to mutate via `initAgentWidget(...).update(newConfig)`.

For detailed theme styling properties, see [THEME-CONFIG.md](./THEME-CONFIG.md).

#### Core

| Option | Type | Description |
| --- | --- | --- |
| `apiUrl` | `string` | Proxy endpoint for your chat backend. Defaults to Runtype's cloud API. |
| `flowId` | `string` | Runtype flow ID. The client sends it to the proxy to select a specific flow. |
| `debug` | `boolean` | Emits verbose logs to `console`. Default: `false`. |
| `headers` | `Record<string, string>` | Static headers forwarded with each request. |
| `getHeaders` | `() => Record<string, string> \| Promise<...>` | Dynamic headers function called before each request. Use for auth tokens that may change. |
| `customFetch` | `(url, init, payload) => Promise<Response>` | Replace the default `fetch` entirely. Receives URL, RequestInit, and the payload. |
| `parseSSEEvent` | `(eventData) => { text?, done?, error? } \| null` | Transform non-standard SSE events into the expected format. Return `null` to ignore an event. |

#### Client Token Mode

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

#### Agent Mode

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

#### UI & Theme

| Option | Type | Description |
| --- | --- | --- |
| `theme` | `DeepPartial<PersonaTheme>` | Semantic tokens (`palette`, `semantic`, `components`). See [THEME-CONFIG.md](./THEME-CONFIG.md). Flat v1-style objects are still accepted at runtime (with a console warning) and migrated internally. |
| `darkTheme` | `DeepPartial<PersonaTheme>` | Dark-mode token overrides, merged over `theme` when the active scheme is dark. |
| `colorScheme` | `'light' \| 'dark' \| 'auto'` | Color scheme mode. `'auto'` detects from `<html class="dark">` or `prefers-color-scheme`. Default: `'light'`. |
| `copy` | `{ welcomeTitle?, welcomeSubtitle?, inputPlaceholder?, sendButtonLabel? }` | Customize user-facing text strings. |
| `autoFocusInput` | `boolean` | Focus the chat input after the panel opens. Skips when voice is active. Default: `false`. |
| `launcherWidth` | `string` | CSS width for the floating launcher panel (e.g. `'320px'`). Default: `'min(400px, calc(100vw - 24px))'`. |

#### Launcher

Controls the floating launcher button and panel.

| Option | Type | Description |
| --- | --- | --- |
| `launcher` | `AgentWidgetLauncherConfig` | Launcher button configuration (see key properties below). See [THEME-CONFIG.md](./THEME-CONFIG.md) for the full list of icon, button, and style properties. |

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

In docked mode, `position`, `fullHeight`, and `sidebarMode` are ignored because the widget fills the dock slot created around the target container.

#### Layout

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

#### Message Display

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

#### Streaming & Parsing

| Option | Type | Description |
| --- | --- | --- |
| `parserType` | `'plain' \| 'json' \| 'regex-json' \| 'xml'` | Built-in parser selector. `'plain'` (default), `'json'` (partial-json), `'regex-json'` (regex-based), `'xml'`. |
| `streamParser` | `() => AgentWidgetStreamParser` | Custom stream parser factory. Takes precedence over `parserType`. See [Stream Parser Configuration](#stream-parser-configuration). |
| `enableComponentStreaming` | `boolean` | Update component props incrementally as they stream in. Default: `true`. |

#### Components

| Option | Type | Description |
| --- | --- | --- |
| `components` | `Record<string, AgentWidgetComponentRenderer>` | Registry of custom components rendered from JSON directives (`{"component": "Name", "props": {...}}`). Each renderer receives `(props, context)` and returns an `HTMLElement`. |

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

#### Voice Recognition

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
| `iconName`, `iconSize`, `iconColor`, `backgroundColor`, `borderColor`, `borderWidth`, `paddingX`, `paddingY`, `tooltipText`, `showTooltip`, `recordingIconColor`, `recordingBackgroundColor`, `recordingBorderColor`, `showRecordingIndicator` | various | Styling options for the voice button. See [THEME-CONFIG.md](./THEME-CONFIG.md). |

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

#### Text-to-Speech

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

#### Tool Calls & Approvals

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
| `backgroundColor`, `borderColor`, `titleColor`, `descriptionColor` | `string?` | Bubble styling. |
| `approveButtonColor`, `approveButtonTextColor` | `string?` | Approve button styling. |
| `denyButtonColor`, `denyButtonTextColor` | `string?` | Deny button styling. |
| `parameterBackgroundColor`, `parameterTextColor` | `string?` | Parameters block styling. |
| `onDecision` | `(data, decision) => Promise<Response \| ReadableStream \| void>?` | Custom approval handler. Return `void` for SDK auto-resolve. |

#### Suggestion Chips

| Option | Type | Description |
| --- | --- | --- |
| `suggestionChips` | `string[]` | Render quick reply buttons above the composer. |
| `suggestionChipsConfig` | `AgentWidgetSuggestionChipsConfig` | Chip styling: `fontFamily` (`'sans-serif' \| 'serif' \| 'mono'`), `fontWeight`, `paddingX`, `paddingY`. |

#### Input & Composer

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

#### Status Indicator

| Option | Type | Description |
| --- | --- | --- |
| `statusIndicator` | `AgentWidgetStatusIndicatorConfig` | Connection status display: `visible`, `idleText`, `connectingText`, `connectedText`, `errorText`. |

#### Features

| Option | Type | Description |
| --- | --- | --- |
| `features` | `AgentWidgetFeatureFlags` | Feature flag toggles (see sub-table). |

**`features`** — `AgentWidgetFeatureFlags`

| Property | Type | Description |
| --- | --- | --- |
| `showReasoning` | `boolean?` | Show thinking/reasoning bubbles. Default: `true`. |
| `showToolCalls` | `boolean?` | Show tool usage bubbles. Default: `true`. |
| `showEventStreamToggle` | `boolean?` | Show the event stream inspector toggle in the header. Default: `false`. |
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

#### State & Storage

| Option | Type | Description |
| --- | --- | --- |
| `initialMessages` | `AgentWidgetMessage[]` | Seed the conversation transcript with initial messages. |
| `persistState` | `boolean \| AgentWidgetPersistStateConfig` | Persist widget state across page navigations. `true` uses defaults (sessionStorage). |
| `storageAdapter` | `AgentWidgetStorageAdapter` | Custom storage adapter with `load()`, `save(state)`, and `clear()` methods. |
| `onStateLoaded` | `(state: AgentWidgetStoredState) => AgentWidgetStoredState` | Transform state after loading from storage but before widget initialization. |
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

#### Extensibility

| Option | Type | Description |
| --- | --- | --- |
| `plugins` | `AgentWidgetPlugin[]` | Plugin array for extending widget functionality. |
| `contextProviders` | `AgentWidgetContextProvider[]` | Functions that inject additional context into each request payload. |
| `requestMiddleware` | `AgentWidgetRequestMiddleware` | Transform the request payload before it is sent. |
| `actionParsers` | `AgentWidgetActionParser[]` | Parse structured directives from assistant messages. |
| `actionHandlers` | `AgentWidgetActionHandler[]` | Handle parsed actions (navigation, UI updates, etc.). |

### Stream Parser Configuration

The widget can parse structured responses (JSON, XML, etc.) that stream in chunk by chunk, extracting the `text` field for display. By default, it uses a plain text parser. You can easily select a built-in parser using `parserType`, or provide a custom parser via `streamParser`.

**Key benefits of the unified stream parser:**
- **Format detection**: Automatically detects if content matches your parser's format
- **Extensible**: Handle JSON, XML, or any custom structured format
- **Incremental parsing**: Extract text as it streams in, not just when complete

**Quick start with `parserType` (recommended):**

The easiest way to use a built-in parser is with the `parserType` option:

```javascript
import { initAgentWidget } from '@runtypelabs/persona';

const controller = initAgentWidget({
  target: '#chat-root',
  config: {
    apiUrl: '/api/chat/dispatch',
    parserType: 'json'  // Options: 'plain', 'json', 'regex-json', 'xml'
  }
});
```

**Using built-in parsers with `streamParser` (ESM/Modules):**

```javascript
import { initAgentWidget, createPlainTextParser, createJsonStreamParser, createXmlParser } from '@runtypelabs/persona';

const controller = initAgentWidget({
  target: '#chat-root',
  config: {
    apiUrl: '/api/chat/dispatch',
    streamParser: createJsonStreamParser // Use JSON parser
    // Or: createXmlParser for XML, createPlainTextParser for plain text (default)
  }
});
```

**Using built-in parsers with CDN Script Tags:**

```html
<script src="https://cdn.jsdelivr.net/npm/@runtypelabs/persona@latest/dist/index.global.js"></script>
<script>
  window.AgentWidget.initAgentWidget({
    target: '#chat-root',
    config: {
      apiUrl: '/api/chat/dispatch',
      streamParser: window.AgentWidget.createJsonStreamParser // JSON parser
      // Or: window.AgentWidget.createXmlParser for XML
      // Or: window.AgentWidget.createPlainTextParser for plain text (default)
    }
  });
</script>
```

**Using with automatic installer script:**

```html
<script>
  window.siteAgentConfig = {
    target: 'body',
    config: {
      apiUrl: '/api/chat/dispatch',
      parserType: 'json'  // Simple way to select parser - no function imports needed!
    }
  };
</script>
<script src="https://cdn.jsdelivr.net/npm/@runtypelabs/persona@latest/dist/install.global.js"></script>
```

**Alternative: Using `streamParser` with installer script:**

If you need a custom parser, you can still use `streamParser`:

```html
<script>
  window.siteAgentConfig = {
    target: 'body',
    config: {
      apiUrl: '/api/chat/dispatch',
      // Note: streamParser must be set after the script loads, or use a function
      streamParser: function() {
        return window.AgentWidget.createJsonStreamParser();
      }
    }
  };
</script>
<script src="https://cdn.jsdelivr.net/npm/@runtypelabs/persona@latest/dist/install.global.js"></script>
```

Alternatively, you can set it after the script loads:

```html
<script>
  window.siteAgentConfig = {
    target: 'body',
    config: {
      apiUrl: '/api/chat/dispatch'
    }
  };
</script>
<script src="https://cdn.jsdelivr.net/npm/@runtypelabs/persona@latest/dist/install.global.js"></script>
<script>
  // Set parser after AgentWidget is loaded
  if (window.siteAgentConfig && window.AgentWidget) {
    window.siteAgentConfig.config.streamParser = window.AgentWidget.createJsonStreamParser;
  }
</script>
```

**Custom JSON parser example:**

```javascript
const jsonParser = () => {
  let extractedText = null;
  
  return {
    // Extract text field from JSON as it streams in
    // Return null if not JSON or text not available yet
    processChunk(accumulatedContent) {
      const trimmed = accumulatedContent.trim();
      // Return null if not JSON format
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return null;
      }
      
      const match = accumulatedContent.match(/"text"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
      if (match) {
        extractedText = match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
        return extractedText;
      }
      return null;
    },
    
    getExtractedText() {
      return extractedText;
    }
  };
};

initAgentWidget({
  target: '#chat-root',
  config: {
    apiUrl: '/api/chat/dispatch',
    streamParser: jsonParser,
    postprocessMessage: ({ text, raw }) => {
      // raw contains the structured payload (JSON, XML, etc.)
      return markdownPostprocessor(text);
    }
  }
});
```

**Custom XML parser example:**

```javascript
const xmlParser = () => {
  let extractedText = null;
  
  return {
    processChunk(accumulatedContent) {
      // Return null if not XML format
      if (!accumulatedContent.trim().startsWith('<')) {
        return null;
      }
      
      // Extract text from <text>...</text> tags
      const match = accumulatedContent.match(/<text[^>]*>([\s\S]*?)<\/text>/);
      if (match) {
        extractedText = match[1];
        return extractedText;
      }
      return null;
    },
    
    getExtractedText() {
      return extractedText;
    }
  };
};
```

**Parser interface:**

```typescript
interface AgentWidgetStreamParser {
  // Process a chunk and return extracted text (if available)
  // Return null if the content doesn't match this parser's format or text is not yet available
  processChunk(accumulatedContent: string): Promise<string | null> | string | null;
  
  // Get the currently extracted text (may be partial)
  getExtractedText(): string | null;
  
  // Optional cleanup when parsing is complete
  close?(): Promise<void> | void;
}
```

The parser's `processChunk` method is called for each chunk. If the content matches your parser's format, return the extracted text and the raw payload. Built-in parsers already do this, so action handlers and middleware can read the original structured content without re-implementing a parser. Return `null` if the chunk isn't ready yet—the widget will keep waiting or fall back to plain text.

### Optional proxy server

The proxy server handles flow configuration and forwards requests to Runtype. You can configure it in three ways:

**Option 1: Use default flow (recommended for getting started)**

```ts
// api/chat.ts
import { createChatProxyApp } from '@runtypelabs/persona-proxy';

export default createChatProxyApp({
  path: '/api/chat/dispatch',
  allowedOrigins: ['https://www.example.com']
});
```

**Option 2: Reference a Runtype flow ID**

```ts
import { createChatProxyApp } from '@runtypelabs/persona-proxy';

export default createChatProxyApp({
  path: '/api/chat/dispatch',
  allowedOrigins: ['https://www.example.com'],
  flowId: 'flow_abc123' // Flow created in Runtype dashboard or API
});
```

**Option 3: Define a custom flow**

```ts
import { createChatProxyApp } from '@runtypelabs/persona-proxy';

export default createChatProxyApp({
  path: '/api/chat/dispatch',
  allowedOrigins: ['https://www.example.com'],
  flowConfig: {
    name: "Custom Chat Flow",
    description: "Specialized assistant flow",
    steps: [
      {
        id: "custom_prompt",
        name: "Custom Prompt",
        type: "prompt",
        enabled: true,
        config: {
          model: "meta/llama3.1-8b-instruct-free",
          responseFormat: "markdown",
          outputVariable: "prompt_result",
          userPrompt: "{{user_message}}",
          systemPrompt: "you are a helpful assistant, chatting with a user",
          previousMessages: "{{messages}}"
        }
      }
    ]
  }
});
```

**Hosting on Vercel:**

```ts
import { createVercelHandler } from '@runtypelabs/persona-proxy';

export default createVercelHandler({
  allowedOrigins: ['https://www.example.com'],
  flowId: 'flow_abc123' // Optional
});
```

**Environment setup:**

Add `RUNTYPE_API_KEY` to your environment. The proxy constructs the Runtype payload (including flow configuration) and streams the response back to the client.

### Development notes

- The widget streams results using SSE and mirrors the backend `flow_complete`/`step_chunk` events.
- Tailwind-esc classes are prefixed with `tvw-` and scoped to `[data-persona-root]`, so they won't collide with the host page.
- Run `pnpm dev` from the repository root to boot the example proxy (`examples/proxy`) and the vanilla demo (`examples/embedded-app`).
- The proxy prefers port `43111` but automatically selects the next free port if needed.
