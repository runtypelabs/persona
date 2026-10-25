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
  role: 'user' | 'assistant' | 'system' | 'operator';
  author?: { id?: string; displayName?: string; kind?: 'human' | 'ai' | 'system' };
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

## Operator Messages (Human Replies)

Use `role: 'operator'` for a human speaking on the agent's side of the
conversation, such as a support agent who takes over an SMS, WhatsApp or Slack
thread. Operator messages:

- Render on the assistant's side with their own bubble, styled by
  `theme.components.message.operator` (see [THEME-CONFIG.md](../THEME-CONFIG.md)).
  The bubble fits its content, even when the assistant is `width: "full"`.
  The v4 defaults tint the container with the theme primary; the v5 defaults
  outline the bubble instead, and a `brand` accent tints the outline.
- Are omitted from model requests by default, on proxy, agent and client-token
  transports. This supports backends that already own and replay human replies.
  For stateless adapters, explicitly convert them with `modelMessageTransform`
  as described below. The UI role `operator` never reaches a model request.
- Show a readable, accessible “Human operator” label even with avatars off.
  Supply `author: { id, displayName, kind: 'human' }` to identify the speaker;
  `copy.operatorLabel` localizes the human label. Provenance survives injection,
  initial messages, custom history mapping and local storage. It is display
  information supplied by the host, not proof of identity or permission.
- Protect human contributions from destructive history changes: retry and edit
  are unavailable before a later operator message, including direct
  `session.resubmitFrom()` calls. A new user turn after the human reply can
  still be edited or retried.
- Get the copy action and any custom action that lists `'operator'` in
  `roles`. They never get upvote, downvote, read-aloud or regenerate, and copy
  does not report feedback to the API.
- Use `layout.messages.avatar.operatorAvatar` when avatars are shown (default:
  the letter "O").
- Do not fire `assistant:message` or `assistant:complete`.

```javascript
widgetHandle.injectMessage({
  id: 'msg_42',
  role: 'operator',
  author: { id: 'support-sam', displayName: 'Sam', kind: 'human' },
  content: "Hi, this is Sam from support. I've refunded your order.",
  createdAt: '2026-10-24T10:15:00.000Z',
});
```

### Model context ownership

Decide which side owns replay before enabling human context:

| Backend | Widget behavior |
| --- | --- |
| Backend stores/replays the conversation, including operator replies | Leave `modelMessageTransform` unset; the widget omits operator entries, avoiding duplicate replay. |
| Stateless adapter rebuilds each run from `body.messages` | Convert each operator entry once, at its original chronological position, into an attributed historical conversation turn. |

`modelMessageTransform` is a synchronous hook. It receives `{ message, content,
modelMessage }`: the full UI entry and its identity/provenance, content resolved
as `contentParts > llmContent > rawContent > content`, and the normal payload
projection (`null` for operators). Return a supported `user`, `assistant` or
`system` payload message with `content` and `createdAt`, or `null` to omit it.
Local-only notices and voice captions are excluded before the hook. Malformed
return values, including promises and the unsupported `operator` model role,
fail dispatch. The hook runs once per eligible entry on all three transports.
Tool-call/result pairing remains owned by the widget serializer.

A historical human support reply can be quoted as conversation data in a
`user` turn with an explicit label; that label must distinguish it from a new
customer instruction. Do not automatically promote operator speech into system
instructions. For example, the stateless AI SDK showcase installs
[`historicalOperatorContext`](../../../examples/ai-sdk-next/app/lib/operator-context.ts):

```typescript
import { historicalOperatorContext } from './operator-context';

const config = {
  apiUrl: '/api/ai-sdk/dispatch',
  modelMessageTransform: historicalOperatorContext,
};
```

The helper attributes the historical reply by message ID and author, preserves
attachment parts on the Persona wire, and leaves the UI entry as `operator`.
It also works with the text converters in the OpenAI Agents, LangGraph and Eve
examples. Those converters currently flatten multimodal content to text; a
vision/file-capable adapter must map the preserved parts into its provider's
content types. The AI SDK and OpenAI Agents mock-model tests verify the human
reply reaches model input once, between its neighboring conversation turns.

A custom backend must authenticate authors and decide which conversation data
it trusts. Browser-supplied provenance and labels grant no authority. A standard
upstream history response containing only `user`/`assistant` roles cannot recover
an operator's identity or UI role after conversion: preserve the original
operator entry and `author` in local persistence or a custom history provider.
Client-token display projections preserve visible text when it differs from the
converted model content; they do not preserve operator role/provenance on their
own, and an empty display projection cannot reconstruct media attachments. Keep
the original content parts in local/custom history as well. When human replies
are already in server history, keep the default omission.

### Human replies and run control

An operator reply is conversation content. Other human interactions require
separate adapter capabilities:

| Interaction | Owner and required behavior |
| --- | --- |
| Human support reply | Inject/persist an operator entry; select one replay owner as above. |
| Steering or takeover | Backend decides whether to cancel, interrupt, replace or resume the active run; changing a UI role does not control a run. |
| Answering an agent question | Match the pending question/tool-call ID and resume the saved execution with the answer. |
| Approving a tool | Backend validates approval against the pending action, identity and policy, then resumes/denies it. A transcript reply is not an approval. |

The AI SDK, OpenAI Agents, LangGraph and Eve examples demonstrate streaming
adapters and stateless transcript replay, not full takeover/approval systems.
OpenAI Agents removes system history entries, so injecting a separate system
message is not a portable fallback. The LangGraph example compiles a fresh graph
without a checkpointer; Eve creates a fresh session for each dispatch and rejects
`input.requested`. These examples have no durable pause/resume endpoint. Add
backend-owned run/session state, correlation and authenticated control endpoints
before offering steering, question answers or approvals. See
[`ai-sdk-webmcp`](../../../examples/ai-sdk-webmcp) for a separate pause/resume
example.

### Example: Read-Only Messaging Thread

This maps a channel transcript (inbound end-user messages, agent replies, and
human takeover replies) onto Persona, and draws each reply's delivery status
under its text with a `renderMessage` plugin. The plugin takes the default
bubble and adds an empty slot marked `data-preserve-runtime`. Persona keeps
that node as it is on later renders, so the host owns its contents: fill it
when it is created and update it in place when the status changes.

```javascript
const statuses = new Map(); // message id -> delivery status

const fillStatus = (slot, status) => {
  slot.textContent = status ?? '';
  slot.dataset.status = status ?? '';
};

const deliveryStatus = {
  id: 'delivery-status',
  renderMessage: ({ message, defaultRenderer }) => {
    if (message.role !== 'operator' && message.role !== 'assistant') return null;
    const bubble = defaultRenderer();
    const slot = document.createElement('div');
    slot.className = 'thread-status';
    slot.setAttribute('data-preserve-runtime', 'true');
    slot.setAttribute('data-status-for', message.id);
    fillStatus(slot, statuses.get(message.id));
    // Under the text, above the action bar when the message has one.
    bubble.insertBefore(slot, bubble.querySelector(':scope > .persona-message-actions'));
    return bubble;
  },
};

const toPersonaMessage = (msg) => {
  const inbound = msg.direction === 'inbound';
  const human = !inbound && msg.metadata?.source === 'human_operator';
  return {
    id: msg.id,
    role: inbound ? 'user' : human ? 'operator' : 'assistant',
    content: msg.content,
    ...(human && { author: { id: msg.authorId, displayName: msg.authorName, kind: 'human' } }),
    createdAt: msg.createdAt,
  };
};

const widgetHandle = initAgentWidget({
  target: '#thread',
  config: {
    launcher: { enabled: false },
    plugins: [deliveryStatus],
    layout: {
      showFooter: false, // read-only: no composer
      messages: { timestamp: { show: true } },
    },
  },
});

const show = (msg) => {
  statuses.set(msg.id, msg.metadata?.deliveryStatus);
  // Injecting an existing id updates that bubble in place.
  widgetHandle.injectMessage(toPersonaMessage(msg));
  // The slot survives the update, so refresh what it shows.
  const slot = document.querySelector(`[data-status-for="${msg.id}"]`);
  if (slot) fillStatus(slot, statuses.get(msg.id));
};

messages.forEach(show);
onThreadUpdate(show); // a new message or a status change
```

Style `.thread-status` in your page (or with the plugin kit's `injectStyles`
when the widget uses Shadow DOM, and query the slot from that shadow root). A
framework host can render into the slot the same way, for example with a
React portal.

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
   - `operator` for a human speaking on the agent's side (omitted from model requests unless an adapter explicitly converts it)

4. **Leverage streaming**: For operations that take time, use streaming updates to keep users informed

5. **Consistent message IDs**: When updating messages, always use the same ID to avoid duplicates
