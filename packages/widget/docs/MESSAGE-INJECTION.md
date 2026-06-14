# Message Injection API

The Persona widget supports programmatic message injection, allowing you to add messages to the conversation from external sources such as tool call responses, system events, or third-party integrations.

## Overview

Message injection is useful for:
- **Tool call responses**: Inject search results, product listings, or API responses
- **System context**: Add context about user behavior (e.g., "User is viewing product X")
- **External integrations**: Push messages from CRM systems, analytics, or other services
- **Dual-content messages**: Show rich content to users while sending concise summaries to the LLM

## API Reference

### `injectMessage(options)`

The primary method for injecting messages into the conversation.

```typescript
interface InjectMessageOptions {
  role: 'user' | 'assistant' | 'system';
  content: string;              // User-facing (UI display)
  llmContent?: string;          // LLM-facing (defaults to content)
  contentParts?: ContentPart[]; // Multi-modal (highest priority for LLM)
  rawContent?: string;          // Raw structured payload (e.g. directive JSON)
  id?: string;                  // Custom message ID
  createdAt?: string;           // ISO timestamp
  sequence?: number;            // Sort order
  streaming?: boolean;          // For streaming updates
}
```

### Convenience Methods

```typescript
// Assistant messages (role: 'assistant')
widgetHandle.injectAssistantMessage(options);

// User messages (role: 'user')
widgetHandle.injectUserMessage(options);

// System messages (role: 'system')
widgetHandle.injectSystemMessage(options);

// Component directives (assistant message that renders a registered component)
widgetHandle.injectComponentDirective({
  component: 'DynamicForm',
  props: { title: 'Book a demo', fields: [/* ... */] },
  text: 'Share your details to book a demo.',
  llmContent: '[Showed booking form]'   // optional, redacted version for the LLM
});
```

## Content Priority

When building the API payload, content is resolved in this priority order:

1. `contentParts` - Multi-modal content (images, files)
2. `llmContent` - Explicit LLM-specific content
3. `rawContent` - Backward compatibility for structured parsers
4. `content` - Display content as fallback

## Examples

### Basic Message Injection

```javascript
const widgetHandle = initAgentWidget({
  apiUrl: 'https://api.example.com/chat'
});

// Simple assistant message
widgetHandle.injectAssistantMessage({
  content: 'Here are your search results...'
});
```

### Dual-Content (User vs LLM)

Show rich content to users while sending a concise summary to the LLM:

```javascript
// User sees full product details
// LLM receives concise summary to save tokens
widgetHandle.injectAssistantMessage({
  content: `**Found 3 products:**
- iPhone 15 Pro - $1,199 (SKU: IP15P-256)
- iPhone 15 - $999 (SKU: IP15-128)
- iPhone 14 - $799 (SKU: IP14-128)`,

  llmContent: '[Search results: 3 iPhones found, $799-$1199]'
});
```

### System Context Injection

Inject context that guides LLM behavior without cluttering the chat:

```javascript
// Minimal display, rich context for LLM
widgetHandle.injectSystemMessage({
  content: '[Context updated]',
  llmContent: 'User is viewing iPhone 15 Pro product page. Cart contains 2 items totaling $45.99. User has Gold membership.'
});
```

### Sensitive Data Redaction

Show sensitive information to users while redacting it from LLM:

```javascript
// User sees their order details
// LLM only sees that an order exists
widgetHandle.injectAssistantMessage({
  content: `Your order #12345:
- Card ending in 4242
- Shipping to: 123 Main St, Anytown, USA`,

  llmContent: '[Order confirmation displayed to user]'
});
```

### Streaming Updates

For long-running operations, use streaming to show progress:

```javascript
const messageId = 'search-results-123';

// Initial streaming message
widgetHandle.injectAssistantMessage({
  id: messageId,
  content: 'Searching...',
  streaming: true
});

// Update with partial results
widgetHandle.injectAssistantMessage({
  id: messageId,
  content: 'Found 2 results so far...',
  streaming: true
});

// Final update
widgetHandle.injectAssistantMessage({
  id: messageId,
  content: 'Here are all 5 results...',
  llmContent: '[5 search results]',
  streaming: false
});
```

## Component Directive Injection

When you have a renderer registered via `componentRegistry.register(...)`, you can inject an assistant message that renders that component: exactly the same path Persona uses for streamed `{ "text": "...", "component": "...", "props": {...} }` directives.

This is useful for:

- **Previews and replays**: render a component without round-tripping to the LLM
- **Debug toggles**: add a button that injects the form/widget you want to QA
- **Local tools**: have a tool callback render a registered component instead of plain text
- **Restoring state**: rehydrate a directive after a user action without re-streaming

### Using `injectComponentDirective` (recommended)

```javascript
import { initAgentWidget, componentRegistry } from '@runtypelabs/persona';
import { DynamicForm } from './components';

componentRegistry.register('DynamicForm', DynamicForm);

const widget = initAgentWidget({
  target: 'body',
  config: { apiUrl: '/api/chat/dispatch', parserType: 'json' }
});

widget.injectComponentDirective({
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
  llmContent: '[Showed booking form]'
});
```

The helper builds the canonical directive JSON (`{ text, component, props }`), sets `content` to `text`, sets `rawContent` to the JSON, and forwards `llmContent` so the LLM sees a redacted summary on subsequent turns instead of the full directive.

### Using `rawContent` directly

If you already have a serialized directive (e.g. cached from a previous response), set it on `rawContent` and the directive renderer will pick it up:

```javascript
const directive = JSON.stringify({
  text: 'Booking form',
  component: 'DynamicForm',
  props: { /* ... */ }
});

widget.injectAssistantMessage({
  content: 'Booking form',          // bubble copy
  rawContent: directive,            // makes the directive renderable
  llmContent: '[Showed booking form]'
});
```

`hasComponentDirective` and `extractComponentDirectiveFromMessage` look at `rawContent` first; if it's missing, they fall back to parsing `content` when it looks like JSON. So either of these forms also works:

```javascript
// Pass the directive JSON via rawContent (preferred: keeps `content` clean)
widget.injectAssistantMessage({
  content: 'Booking form',
  rawContent: JSON.stringify({ text: 'Booking form', component: 'DynamicForm', props: {} })
});

// Or pass the directive JSON via content alone (the fallback path)
widget.injectAssistantMessage({
  content: JSON.stringify({ text: 'Booking form', component: 'DynamicForm', props: {} })
});
```

The first form is preferred because `content` stays human-readable for plain-text renderers, accessibility tools, and copy actions.

## Migration from `injectTestMessage`

The previous `injectTestMessage` method is deprecated. Migrate using:

**Before:**
```javascript
widgetHandle.injectTestMessage({
  type: 'message',
  message: {
    id: 'msg-123',
    role: 'assistant',
    content: 'Hello!',
    createdAt: new Date().toISOString()
  }
});
```

**After:**
```javascript
widgetHandle.injectAssistantMessage({
  content: 'Hello!'
});
```

## Best Practices

1. **Use llmContent for token efficiency**: When displaying rich content (tables, lists, detailed info), provide a concise summary in `llmContent`

2. **Redact sensitive data**: Never send PII, payment details, or credentials to the LLM - use `llmContent` for redacted summaries

3. **Use appropriate roles**:
   - `assistant` for responses and information display
   - `user` for simulating user actions (use sparingly)
   - `system` for context injection that should influence LLM behavior

4. **Leverage streaming**: For operations that take time, use streaming updates to keep users informed

5. **Consistent message IDs**: When updating messages, always use the same ID to avoid duplicates
