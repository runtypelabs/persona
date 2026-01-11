# Code Snippet Generation API

The `generateCodeSnippet` function programmatically generates ready-to-use code snippets for embedding the widget. This is useful for building configuration tools, documentation generators, or automated setup workflows.

## Basic Usage

```typescript
import { generateCodeSnippet } from '@runtypelabs/persona';
import type { CodeFormat, CodeGeneratorOptions } from '@runtypelabs/persona';

const config = {
  apiUrl: '/api/chat/dispatch',
  theme: {
    primary: '#111827',
    accent: '#1d4ed8',
  },
  launcher: {
    enabled: true,
    title: 'AI Assistant',
  },
};

// Generate ESM code (default)
const esmCode = generateCodeSnippet(config);

// Generate for different formats
const reactCode = generateCodeSnippet(config, 'react-component');
const scriptCode = generateCodeSnippet(config, 'script-manual');
```

## Available Formats

| Format | Description |
|--------|-------------|
| `esm` | ES Module import (default) |
| `react-component` | React component with `useEffect` |
| `react-advanced` | React component with DOM context collection and action handling |
| `script-installer` | Auto-installer script tag (JSON config only) |
| `script-manual` | Manual script tag with full control |
| `script-advanced` | Script tag with DOM context collection and action handling |

## Custom Hooks

The third parameter accepts options including custom hooks that inject code into the generated snippet. Hooks can be provided as strings or functions (functions are automatically serialized via `.toString()`).

```typescript
const code = generateCodeSnippet(config, 'esm', {
  hooks: {
    // Custom headers function
    getHeaders: async () => ({
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }),

    // Feedback callback
    onFeedback: (feedback) => {
      fetch('/api/feedback', {
        method: 'POST',
        body: JSON.stringify(feedback)
      });
    },

    // Copy callback
    onCopy: (message) => {
      console.log('Copied:', message.id);
    },

    // Request middleware (merged with DOM context in advanced formats)
    requestMiddleware: ({ payload }) => ({
      ...payload,
      metadata: { timestamp: Date.now() }
    }),

    // Custom action handlers (prepended to defaults in advanced formats)
    actionHandlers: [
      (action, context) => {
        if (action.type === 'show_modal') {
          showModal(action.payload);
          return { handled: true };
        }
      }
    ],

    // Custom message postprocessor
    postprocessMessage: ({ text }) => DOMPurify.sanitize(text),

    // Custom stream parser factory
    streamParser: () => createCustomParser()
  }
});
```

## Available Hooks

| Hook | Type | Description |
|------|------|-------------|
| `getHeaders` | `() => Record<string, string>` | Returns custom headers for API requests |
| `onFeedback` | `(feedback) => void` | Called when user provides feedback (upvote/downvote) |
| `onCopy` | `(message) => void` | Called when user copies a message |
| `requestMiddleware` | `(ctx) => payload` | Transforms request payload before sending |
| `actionHandlers` | `Array<(action, ctx) => result>` | Custom action handlers for structured responses |
| `actionParsers` | `Array<(ctx) => action>` | Custom parsers to extract actions from messages |
| `postprocessMessage` | `(ctx) => string` | Custom message postprocessor (overrides default) |
| `contextProviders` | `Array<() => context>` | Additional context providers for requests |
| `streamParser` | `() => StreamParser` | Custom stream parser factory |

## Hook Format Notes

- **String hooks**: Passed through directly into generated code
- **Function hooks**: Serialized via `.toString()` - must be self-contained (no closures)
- **Advanced formats** (`react-advanced`, `script-advanced`): Custom `actionHandlers` are prepended to built-in handlers; `requestMiddleware` is merged with DOM context collection

```typescript
// Both approaches work:

// As string
generateCodeSnippet(config, 'esm', {
  hooks: {
    getHeaders: "async () => ({ 'X-Custom': 'value' })"
  }
});

// As function (auto-serialized)
generateCodeSnippet(config, 'esm', {
  hooks: {
    getHeaders: async () => ({ 'X-Custom': 'value' })
  }
});
```

## TypeScript Types

```typescript
import type {
  CodeFormat,
  CodeGeneratorHooks,
  CodeGeneratorOptions
} from '@runtypelabs/persona';

// CodeFormat options
type CodeFormat =
  | 'esm'
  | 'react-component'
  | 'react-advanced'
  | 'script-installer'
  | 'script-manual'
  | 'script-advanced';

// Hook definitions (string or function)
type CodeGeneratorHooks = {
  getHeaders?: string | (() => Record<string, string> | Promise<Record<string, string>>);
  onFeedback?: string | ((feedback: { type: string; messageId: string; message: unknown }) => void);
  onCopy?: string | ((message: unknown) => void);
  requestMiddleware?: string | ((context: { payload: unknown; config: unknown }) => unknown);
  actionHandlers?: string | Array<(action: unknown, context: unknown) => unknown>;
  actionParsers?: string | Array<(context: unknown) => unknown>;
  postprocessMessage?: string | ((context: { text: string; message?: unknown; streaming?: boolean; raw?: string }) => string);
  contextProviders?: string | Array<() => unknown>;
  streamParser?: string | (() => unknown);
};

// Options object
type CodeGeneratorOptions = {
  hooks?: CodeGeneratorHooks;
  includeHookComments?: boolean;
};
```

## Example: Building a Configuration UI

```typescript
import { generateCodeSnippet, type CodeFormat } from '@runtypelabs/persona';

// User configures widget in a UI
const userConfig = {
  apiUrl: form.apiUrl.value,
  theme: {
    primary: colorPicker.primary.value,
    accent: colorPicker.accent.value,
  },
  launcher: {
    enabled: launcherToggle.checked,
    title: form.launcherTitle.value,
  },
};

// User selects output format
const format: CodeFormat = formatSelect.value as CodeFormat;

// User optionally adds custom hooks
const hooks = {
  getHeaders: headerEditor.value || undefined,
  onFeedback: feedbackEditor.value || undefined,
};

// Generate code snippet
const code = generateCodeSnippet(userConfig, format, { hooks });

// Display in code editor
codeEditor.setValue(code);
```
