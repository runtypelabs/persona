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
    semantic: { colors: { accent: '#2563eb' } }
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
  controller.update({
    theme: { semantic: { colors: { surface: '#0f172a', primary: '#f8fafc' } } }
  });
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
| `config` | `AgentWidgetConfig` | Widget configuration object (see the [Configuration Reference](./docs/CONFIGURATION-REFERENCE.md)). |
| `useShadowDom` | `boolean` | Use Shadow DOM for style isolation (default: `true`). |
| `onChatReady` | `() => void` | Callback fired when the widget is initialized and its API is callable. |
| `onReady` | `() => void` | **Deprecated** alias of `onChatReady`; still works, removed in the next major. |
| `windowKey` | `string` | If provided, stores the controller on `window[windowKey]` for global access. Automatically cleaned up on `destroy()`. |

When `config.launcher.mountMode` is `'docked'`, `target` is treated as the page container that Persona should wrap. Use a concrete element such as `#workspace-main`; `body` and `html` are rejected.

**Height contract:** the docked shell sizes itself with `height: 100%`, so give it a definite height — usually `html, body { height: 100% }` or a fixed-height app-shell container around the target. If no ancestor provides one, the panel is clamped to `dock.maxHeight` (default `100dvh`, sticky-pinned for in-flow reveals) so it stays viewport-sized and scrolls internally, and a console warning explains the fix. Override the cap with a CSS length or disable the guard with `dock.maxHeight: false`.

With **`dock.reveal: 'resize'`** (default), a **closed** dock uses a **`0px`** column. **`'emerge'`** uses the same **column width** animation (content reflows) but the chat panel stays **`dock.width`** wide and is **clipped** by the growing slot—like a normal-width widget emerging from the edge. **`'overlay'`** overlays with `transform`. **`'push'`** uses a sliding track (Shopify-style). The built-in launcher stays hidden in docked mode—open with **`controller.open()`** (or your own chrome).

**Rounded / card layout:** `initAgentWidget` inserts a flex **shell** as the **direct child** of your target’s **parent**, with your `target` in the content column and the dock beside it. Put border-radius, border, and `overflow: hidden` on that **parent** (or an ancestor that wraps only the shell) so the dock column sits inside the same visual card as your content.

**Inner push/overlay:** With `reveal: 'push'` or `'overlay'`, only the wrapped node moves. Use a **narrow `target`** (e.g. a main canvas div). For **`dock.side: 'left'`**, place a persistent rail **in flow** next to the stage (e.g. flex `[nav | stage]`) so the dock doesn’t open **under** the sidebar. For a **right** dock, you can instead use a **full-width** stage with an **absolute** left rail if you want the canvas to translate **behind** that rail.

> **Security note:** When you return HTML from `postprocessMessage`, make sure you sanitise it before injecting into the page. The provided postprocessors (`markdownPostprocessor`, `directivePostprocessor`) do not perform sanitisation.

### Documentation

The full reference lives in [`docs/`](./docs/) and the theming guide:

- [Programmatic Control & Events](./docs/PROGRAMMATIC-CONTROL.md) — controller API, message hooks and injection, enriched DOM context, WebMCP page tools, DOM and controller events, state loading
- [UI Features & Components](./docs/UI-COMPONENTS.md) — message actions and feedback, loading indicators, ask-user-question, dropdown menus, button utilities, dynamic forms
- [Script Tag Installation & Framework Integration](./docs/INSTALLATION-FRAMEWORKS.md) — automatic installer, manual script tag setup, React, Next.js, Remix, Gatsby, and Astro guides
- [Configuration Reference](./docs/CONFIGURATION-REFERENCE.md) — every config option: core, client token mode, agent mode, UI & theme, launcher, layout, voice, tool calls, suggestion chips, state & storage
- [Stream Parser Configuration](./docs/STREAM-PARSERS.md) — JSON, XML, and plain-text stream parsers and custom parser factories
- [THEME-CONFIG.md](./THEME-CONFIG.md) — the complete theme and design-token reference
- [Message Injection](./docs/MESSAGE-INJECTION.md) — full injection and component-directive reference
- [Dynamic Forms](./docs/DYNAMIC-FORMS.md) — field schema, form styles, and recipes

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
