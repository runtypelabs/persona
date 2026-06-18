# UI Features & Components

> Part of the [@runtypelabs/persona](../README.md) documentation.

## Message Actions (Copy, Upvote, Downvote)

The widget includes built-in action buttons for assistant messages that allow users to copy message content and provide feedback through upvote/downvote buttons.

### Configuration

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

### Feedback Events

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

### Feedback Types

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

### Visual Behavior

- **Hover mode** (`visibility: 'hover'`): Action buttons appear when hovering over assistant messages
- **Always mode** (`visibility: 'always'`): Action buttons are always visible
- **Copy button**: Shows a checkmark briefly after successful copy
- **Vote buttons**: Toggle active state and are mutually exclusive (upvoting clears downvote and vice versa)

## Loading & Idle Indicators

The widget displays visual indicators during different states of the conversation:

- **Loading indicator**: Shown while waiting for a response (standalone) or when an assistant message is streaming but has no content yet (inline)
- **Idle indicator**: Shown when the widget is idle (not streaming) and has at least one message - useful for showing the assistant is "waiting" for user input

### Configuration

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

### Indicator Locations

| Location | When Shown | Description |
|----------|------------|-------------|
| `standalone` | Waiting for stream to start | Separate bubble shown after user sends a message |
| `inline` | Streaming with empty content | Inside the assistant message bubble |
| `idle` | Not streaming, has messages | After assistant finishes responding |

### Animation Preservation

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

### Hiding Indicators

Return `null` from any render function to hide that indicator:

```ts
loadingIndicator: {
  // Hide loading indicator entirely
  render: () => null,

  // Hide idle indicator (default behavior)
  renderIdle: () => null
}
```

### Using Plugins

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

### Type Definitions

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

### Priority Chain

Indicators are resolved in this order:
1. **Plugin hook** (`renderLoadingIndicator` / `renderIdleIndicator`)
2. **Config function** (`loadingIndicator.render` / `loadingIndicator.renderIdle`)
3. **Default** (3-dot bouncing animation for loading, `null` for idle)

## Ask User Question

The `ask_user_question` feature turns a LOCAL agent tool into an interactive prompt with tappable option pills. When the agent calls the `ask_user_question` tool, the server pauses execution and emits a `step_await` event; the widget renders an answer-pill sheet over the composer; the user picks / types / dismisses; the widget POSTs the answer to `/v1/dispatch/resume` and the paused execution continues with a structured `tool_result`.

This is the recommended pattern for human-in-the-loop clarifying questions.

### Exposing the tool to the agent

The simplest setup is `expose: true`: the widget advertises a built-in `ask_user_question` tool definition (model-facing description + JSON schema) on every dispatch via `clientTools[]`, the same wire surface WebMCP page tools use. No server-side declaration needed; the server registers it as a LOCAL tool under its bare name and any flow's agent can call it.

```ts
features: {
  askUserQuestion: { expose: true }
}
```

`expose` defaults to `false`: flows that already declare the tool would otherwise present it to the model twice. It is also ignored when `enabled: false`, so the agent is never offered a question tool the widget can't render an answer UI for.

The alternative is declaring the tool server-side in your `RuntypeFlowConfig` (a `runtimeTools` LOCAL tool entry); the exported `ASK_USER_QUESTION_CLIENT_TOOL` / `ASK_USER_QUESTION_PARAMETERS_SCHEMA` constants give you the same description and schema to reuse there. Either way, pair your proxy with a `POST` handler that forwards to the upstream `/resume` endpoint (see `@runtypelabs/persona-proxy` and your deployment’s `resume` route).

### Configuration

```ts
features: {
  askUserQuestion: {
    enabled: true,             // default: true. When false, the tool falls through to the normal tool-bubble path.
    expose: false,             // default: false. When true, advertises the built-in tool to the agent via clientTools[].
    layout: 'rows',            // default: 'rows'. Use 'pills' for the legacy compact wrap layout.
    slideInMs: 180,            // slide-in animation duration.
    freeTextLabel: 'Other…',
    freeTextPlaceholder: 'Type your answer…',
    submitLabel: 'Send',       // submit label for free-text / multi-select.
    nextLabel: 'Next',         // grouped (multi-question) payloads.
    backLabel: 'Back',
    submitAllLabel: 'Submit all',
    skipLabel: 'Skip',
    groupedAutoAdvance: true,  // single-select intermediate pages auto-advance.
    styles: {
      sheetBackground: '#ffffff',
      sheetBorder: '#e5e7eb',
      sheetShadow: '0 12px 28px -10px rgba(0,0,0,0.15)',
      pillBackground: 'transparent',
      pillBackgroundSelected: '#0f0f0f',
      pillTextColor: '#1f2937',
      pillTextColorSelected: '#fafafa',
      pillBorderRadius: '999px',
      customInputBackground: '#ffffff'
    }
  }
}
```

The default `rows` layout renders full-width choices with descriptions always visible and an inline free-text row when `allowFreeText !== false`. `pills` preserves the older compact wrapped pills where descriptions surface as tooltips and the "Other…" pill expands into an input.

A tool call may include 1–8 questions. Single-question payloads render as one sheet. Multi-question payloads render as a paginated "Question N of M" stepper with Back / Next / Skip / Submit-all controls; progress and partial answers persist on the tool message so a refresh can restore the user's place. On the final page, users always confirm with Submit-all: auto-advance never auto-submits the entire group.

The composer-overlay sheet is the question UI. After the user answers, the picked answer (or grouped summary) appears as a normal user bubble so the transcript reads naturally; the answered tool message stores structured answers for review/re-rendering.

### DOM events

The widget dispatches two events on the mount element so the host page can react without touching the plugin API:

| Event | Detail |
|---|---|
| `persona:askUserQuestion:answered` | `{ toolUseId, answer, answers?, values, isFreeText, source }` where `answers` is the structured question→answer map and `source` is `'pick' \| 'multi' \| 'free-text' \| 'submit-all'` |
| `persona:askUserQuestion:dismissed` | `{ toolUseId }` |

```ts
mount.addEventListener('persona:askUserQuestion:answered', (event) => {
  const { answer, source } = event.detail;
  console.log('User picked', answer, 'via', source);
});
```

### Custom UI via the `renderAskUserQuestion` plugin hook

For full control over the question UI, a modal, a sidebar form, a command palette, whatever, register a plugin with `renderAskUserQuestion`. Returning a non-null `HTMLElement` renders inline in the transcript and suppresses the built-in overlay sheet. Returning `null` falls through to the default sheet.

```ts
import type { AgentWidgetPlugin } from '@runtypelabs/persona';

const customAskPlugin: AgentWidgetPlugin = {
  id: 'custom-ask',
  renderAskUserQuestion: ({ payload, complete, resolve, dismiss }) => {
    const prompt = payload?.questions?.[0];
    if (!prompt) return null; // streaming: wait for more data, or show a skeleton

    const root = document.createElement('div');
    root.className = 'my-question-card';

    const q = document.createElement('p');
    q.textContent = prompt.question ?? '';
    root.appendChild(q);

    (prompt.options ?? []).forEach((option) => {
      const btn = document.createElement('button');
      btn.textContent = option.label;
      btn.addEventListener('click', () => resolve(option.label));
      root.appendChild(btn);
    });

    if (prompt.allowFreeText !== false) {
      const input = document.createElement('input');
      input.placeholder = 'Other…';
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && input.value.trim()) resolve(input.value.trim());
      });
      root.appendChild(input);
    }

    const close = document.createElement('button');
    close.textContent = '×';
    close.addEventListener('click', () => dismiss());
    root.appendChild(close);

    return root;
  }
};

initAgentWidget({
  target: '#app',
  config: {
    plugins: [customAskPlugin]
  }
});
```

### Type Definitions

```ts
type AskUserQuestionOption = {
  label: string;
  description?: string;
  preview?: string; // reserved for future richer rendering
};

type AskUserQuestionPrompt = {
  question: string;
  header?: string;           // short group label, ≤12 chars
  options: AskUserQuestionOption[]; // 2–4 options
  multiSelect?: boolean;     // allow multiple picks with a Submit/Next action
  allowFreeText?: boolean;   // show an "Other…" free-text input (default true)
};

type AskUserQuestionPayload = {
  questions: AskUserQuestionPrompt[]; // 1–8 questions; extras are dropped with a warning
};

// Plugin hook signature
renderAskUserQuestion?: (context: {
  message: AgentWidgetMessage;
  payload: Partial<AskUserQuestionPayload> | null;  // may be partial mid-stream
  complete: boolean;                                // true once tool-call args fully stream
  resolve: (answer: string) => void;                // posts /resume with structured toolOutput
  dismiss: () => void;                              // sends "(dismissed)" sentinel
  config: AgentWidgetConfig;
}) => HTMLElement | null;
```

For plugins that want to re-parse a tool message outside the hook context, the widget also exports a `parseAskUserQuestionPayload(message)` helper that returns `{ payload, complete }` using the same partial-JSON logic the built-in sheet uses.

### Priority chain

1. **Plugin hook** (`renderAskUserQuestion` returning a non-null element): fully owns the UI; built-in overlay is suppressed.
2. **Built-in overlay sheet**: when the feature is enabled and no plugin handles it.
3. **Generic tool bubble**: when `features.askUserQuestion.enabled` is `false`, the tool call renders through the normal `renderToolCall` path.

## Suggested Replies

The `suggest_replies` feature lets the agent offer tappable quick-reply chips for the user's next message. When the agent calls the `suggest_replies` tool, the widget renders the suggestions as chips above the composer (the same slot, and `suggestionChipsConfig` styling, as the static `suggestionChips`) and **immediately** resumes the paused execution with a canned "shown" result. Unlike `ask_user_question`, nothing blocks on the user: the agent's turn completes, and tapping a chip simply sends its text verbatim as the user's next message.

This is the recommended pattern for follow-up discovery: teaching users what to ask next without forcing typing.

### Exposing the tool to the agent

```ts
features: {
  suggestReplies: { expose: true }
}
```

`expose` defaults to `false`: flows that already declare the tool via `runtimeTools` would otherwise present it to the model twice. It is also ignored when `enabled: false`: a disabled feature neither renders chips nor auto-resumes, so exposing the tool alongside it would park the execution on a generic tool bubble forever. (The same applies to a server-declared `suggest_replies` with `enabled: false` : treat that combination as a configuration error.)

For server-side declaration, the exported `SUGGEST_REPLIES_CLIENT_TOOL` / `SUGGEST_REPLIES_PARAMETERS_SCHEMA` constants provide the same description and schema to reuse in a flow's `runtimeTools`.

### Tool schema

```ts
{
  suggestions: string[]   // 1-4 items, each ≤60 chars, phrased in the user's voice
}
```

### Lifecycle

Chip visibility is derived from the transcript, not toggled imperatively: the widget shows the chips of the **last** `suggest_replies` tool message that has **no user message after it**. That one rule covers everything:

- Chips soft-dismiss the moment any user message lands: typed, voice, or a chip tap (which itself sends a user message).
- Chips survive panel close/reopen and page reload (the tool message persists in history and the rule re-evaluates on hydrate). If the page reloads before the automatic resume fired, the execution stays paused server-side; tapping a chip starts a fresh dispatch and the conversation recovers naturally.
- When one turn carries several `suggest_replies` calls, every call is resumed but only the latest renders (latest wins).
- Chips are disabled while a response is streaming, like all composer controls.

No transcript bubble is rendered for the tool message: the chips are the entire UI. When `enabled: false`, the message falls through to the generic tool bubble instead.

Note: integrators who replace the composer's suggestions slot via the composer layout API won't see agent-pushed chips: they render in the same container as `suggestionChips`.

### Configuration

```ts
features: {
  suggestReplies: {
    enabled: true,   // default: true. When false, the tool falls through to the normal tool-bubble path and is NOT auto-resumed.
    expose: false    // default: false. When true, advertises the built-in tool to the agent via clientTools[].
  }
}
```

Chip styling reuses the widget-level `suggestionChipsConfig` (font family/weight, padding).

### DOM events

| Event | Detail |
|---|---|
| `persona:suggestReplies:shown` | `{ suggestions: string[] }`: fires once per distinct chip set |
| `persona:suggestReplies:selected` | `{ suggestion: string }`: fires before the chip text is sent |

## Dropdown Menu

A reusable dropdown menu utility for building custom menus in plugins, custom components, or host-page UI that matches the widget's theme.

### Basic usage

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

### Escaping overflow containers

When the anchor is inside a container with `overflow: hidden`, use the `portal` option to render the menu at a higher DOM level while keeping CSS variable inheritance:

```ts
const dropdown = createDropdownMenu({
  items: [...],
  onSelect: (id) => { /* handle */ },
  anchor: myButton,
  position: 'bottom-right',
  portal: document.querySelector('[data-persona-root]')!,
});
// No need to append: portal mode appends automatically
```

### Header dropdown menus

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

### Theming

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

### Type definitions

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

## Button Utilities

Composable button factories for building custom toolbars, actions, and toggle controls that match the widget's theme.

### Icon button

```ts
import { createIconButton } from '@runtypelabs/persona';

const refreshBtn = createIconButton({
  icon: 'refresh-cw',
  label: 'Refresh',
  onClick: () => handleRefresh(),
});
toolbar.appendChild(refreshBtn);
```

### Label button

```ts
import { createLabelButton } from '@runtypelabs/persona';

const copyBtn = createLabelButton({
  icon: 'copy',
  label: 'Copy',
  variant: 'default',   // 'default' | 'primary' | 'destructive' | 'ghost'
  onClick: () => copyToClipboard(),
});
```

### Toggle group

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

### Theming

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

## Runtype adapter

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

## Dynamic Forms (Recommended)

For rendering AI-generated forms, use the **component middleware** approach with the `DynamicForm` component. This allows the AI to create contextually appropriate forms with any fields:

```typescript
import { componentRegistry, initAgentWidget } from "@runtypelabs/persona";
import { DynamicForm } from "./components"; // Your DynamicForm component

// Register the component
componentRegistry.register("DynamicForm", DynamicForm);

initAgentWidget({
  target: "#app",
  config: {
    apiUrl: "/api/chat/dispatch-component",
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

**Demos and reference:**

- [`apps/web/dynamic-components.html`](../../../apps/web/dynamic-components.html): primary demo with three DynamicForm layout variants (Compact / Spacious / Branded) plus smaller ProductCard, SimpleChart, StatusBadge, and InfoCard directives.
- [`apps/web/dynamic-form-fields.html`](../../../apps/web/dynamic-form-fields.html): every field type, layout width, helper-text, required marking, and sensitive-masking pattern in one page.
- [`docs/DYNAMIC-FORMS.md`](./DYNAMIC-FORMS.md): full reference: field schema, `formStyles` tokens, layout patterns, recipes, and how to extend the example component (new field types, sections, conditional fields).

The shipped `DynamicForm` is an **example** in [`apps/web/src/components.ts`](../../../apps/web/src/components.ts): copy it into your app and customize. It supports text/email/tel/url/number/date/time/textarea, half-width pairs, auto-grow textareas, required-asterisk marking, inline validation, a success recap card with sensitive-field masking, and edit-after-submit. See [DYNAMIC-FORMS.md](./DYNAMIC-FORMS.md) for the full surface area.

## Directive postprocessor (Deprecated)

> **⚠️ Deprecated:** The `directivePostprocessor` approach is deprecated in favor of the component middleware with `DynamicForm`. The old approach only supports predefined form templates ("init" and "followup"), while the new approach allows AI-generated forms with any fields.

`directivePostprocessor` looks for either `<Form type="init" />` tokens or
`<Directive>{"component":"form","type":"init"}</Directive>` blocks and swaps them for placeholders that the widget upgrades into interactive UI. This approach is limited to the predefined form templates in `formDefinitions`.

