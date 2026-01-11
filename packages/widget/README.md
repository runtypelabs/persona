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

### Events

The widget dispatches custom events that you can listen to for integration with your application:

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

| Option | Type | Description |
| --- | --- | --- |
| `apiUrl` | `string` | Proxy endpoint for your chat backend (defaults to Runtype's cloud API). |
| `flowId` | `string` | Optional Runtype flow ID. If provided, the client sends it to the proxy which can use it to select a specific flow. |
| `headers` | `Record<string, string>` | Extra headers forwarded to your proxy. |
| `copy` | `{ welcomeTitle?, welcomeSubtitle?, inputPlaceholder?, sendButtonLabel? }` | Customize user-facing text. |
| `theme` | `{ primary?, secondary?, surface?, muted?, accent?, radiusSm?, radiusMd?, radiusLg?, radiusFull? }` | Override CSS variables for the widget. Colors: `primary` (text/UI), `secondary` (unused), `surface` (backgrounds), `muted` (secondary text), `accent` (buttons/links). Border radius: `radiusSm` (0.75rem, inputs), `radiusMd` (1rem, cards), `radiusLg` (1.5rem, panels/bubbles), `radiusFull` (9999px, pills/buttons). |
| `features` | `AgentWidgetFeatureFlags` | Toggle UI features: `showReasoning?` (show thinking bubbles, default: `true`), `showToolCalls?` (show tool usage bubbles, default: `true`). |
| `launcher` | `{ enabled?, autoExpand?, title?, subtitle?, iconUrl?, position? }` | Controls the floating launcher button. |
| `initialMessages` | `AgentWidgetMessage[]` | Seed the conversation transcript. |
| `suggestionChips` | `string[]` | Render quick reply buttons above the composer. |
| `postprocessMessage` | `(ctx) => string` | Transform message text before it renders (return HTML). Combine with `markdownPostprocessor` for rich output. |
| `parserType` | `"plain" \| "json" \| "regex-json" \| "xml"` | Built-in parser type selector. Easy way to choose a parser without importing functions. Options: `"plain"` (default), `"json"` (partial-json), `"regex-json"` (regex-based), `"xml"`. If both `parserType` and `streamParser` are provided, `streamParser` takes precedence. |
| `streamParser` | `() => AgentWidgetStreamParser` | Custom stream parser for detecting formats and extracting text from streaming responses. Handles JSON, XML, or custom formats. See [Stream Parser Configuration](#stream-parser-configuration) below. |
| `clearChatHistoryStorageKey` | `string` | Additional localStorage key to clear when the clear chat button is clicked. The widget automatically clears `"persona-chat-history"` by default. Use this option to clear additional keys (e.g., if you're using a custom storage key). |
| `formEndpoint` | `string` | Endpoint used by built-in directives (defaults to `/form`). |
| `launcherWidth` | `string` | CSS width applied to the floating launcher panel (e.g. `320px`, `90vw`). Defaults to `min(400px, calc(100vw - 24px))`. |
| `debug` | `boolean` | Emits verbose logs to `console`. |

All options are safe to mutate via `initAgentWidget(...).update(newConfig)`.

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
- Tailwind-esc classes are prefixed with `tvw-` and scoped to `#persona-root`, so they won't collide with the host page.
- Run `pnpm dev` from the repository root to boot the example proxy (`examples/proxy`) and the vanilla demo (`examples/embedded-app`).
- The proxy prefers port `43111` but automatically selects the next free port if needed.
