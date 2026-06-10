# Script Tag Installation & Framework Integration

> Part of the [@runtypelabs/persona](../README.md) documentation.

## Script tag installation

The widget can be installed via a simple script tag, perfect for platforms where you can't compile custom code. There are two methods:

### Method 1: Automatic installer (recommended)

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
        semantic: {
          colors: { accent: '#2563eb', surface: '#ffffff' }
        }
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
- `clientToken` - Client token for authentication (alternative to proxy `apiUrl`)
- `flowId` - Flow ID for client token authentication
- `apiUrl` - API URL for the chat endpoint (can also be set inside `config`)
- `previewQueryParam` - Query parameter key that gates widget loading; widget only loads when the parameter is present and truthy
- `useShadowDom` - Use Shadow DOM for style isolation (default: `false`)
- `windowKey` - If provided, stores the widget handle on `window[windowKey]` for programmatic access
- `onScriptLoad` - Fired as soon as the installer script executes, before it loads or gates anything (diagnostics / timing); signature: `({ version }) => void`
- `onLauncherShown` - Fired when the floating launcher is painted on the page (page-load time — for "widget appeared" analytics); signature: `({ deferred, element? }) => void`
- `onChatReady` - Fired when the widget is initialized and its controller API is callable (after first open in a deferred install); signature: `(handle) => void`
- `onError` - Fired when a load step fails (`css` / `bundle` / `init`), so ad-blocked / timed-out installs don't fail silently; signature: `({ phase, error }) => void`
- `onReady` - **Deprecated** alias of `onChatReady`; still works, removed in the next major; signature: `(handle) => void`

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

### Programmatic access with the installer

The installer is fully asynchronous (it waits for framework hydration, then loads CSS and JS). To interact with the widget after it initializes, use one of these approaches:

**`onChatReady` callback** — best when config and access logic live in the same script:

```html
<script>
  window.siteAgentConfig = {
    clientToken: 'YOUR_TOKEN',
    windowKey: 'myChat',
    onChatReady(handle) {
      handle.on('message:sent', (e) => console.log('sent:', e));
      handle.on('message:received', (e) => console.log('received:', e));
    }
  };
</script>
<script src="https://cdn.jsdelivr.net/npm/@runtypelabs/persona@latest/dist/install.global.js"></script>
```

**`persona:chat-ready` event** — best for decoupled integration (e.g. tag managers, separate scripts):

```html
<script>
  window.addEventListener('persona:chat-ready', (e) => {
    const handle = e.detail;
    handle.on('message:sent', (e) => console.log('sent:', e));
  });
</script>

<!-- Can be in a different script, tag manager snippet, etc. -->
<script>
  window.siteAgentConfig = { clientToken: 'YOUR_TOKEN' };
</script>
<script src="https://cdn.jsdelivr.net/npm/@runtypelabs/persona@latest/dist/install.global.js"></script>
```

**`windowKey`** — stores the handle on `window[windowKey]` for persistent global access. Combine with `onChatReady` or `persona:chat-ready` to know when it's available:

```html
<script>
  window.siteAgentConfig = {
    clientToken: 'YOUR_TOKEN',
    windowKey: 'myChat'
  };
</script>
<script src="https://cdn.jsdelivr.net/npm/@runtypelabs/persona@latest/dist/install.global.js"></script>

<script>
  window.addEventListener('persona:chat-ready', () => {
    // window.myChat is now available and persists until destroy()
    window.myChat.open();
  });
</script>
```

### Method 2: Manual installation

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
        semantic: {
          colors: { accent: '#111827', surface: '#f5f5f5' }
        }
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

## React Framework Integration

The widget is fully compatible with React frameworks. Use the ESM imports to integrate it as a client component.

### Framework Compatibility

| Framework | Compatible | Implementation Notes |
|-----------|------------|---------------------|
| **Vite** | ✅ Yes | No special requirements - works out of the box |
| **Create React App** | ✅ Yes | No special requirements - works out of the box |
| **Next.js** | ✅ Yes | Requires `'use client'` directive (App Router) |
| **Remix** | ✅ Yes | Use dynamic import or `useEffect` guard for SSR |
| **Gatsby** | ✅ Yes | Use in `wrapRootElement` or check `typeof window !== 'undefined'` |
| **Astro** | ✅ Yes | Use `client:load` or `client:only="react"` directive |

### Quick Start with Vite or Create React App

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
          semantic: {
            colors: { primary: "#111827", accent: "#1d4ed8" }
          }
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

### Next.js Integration

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

### Remix Integration

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

### Gatsby Integration

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

### Astro Integration

Use Astro's client directives with React islands:

```astro
---
// src/components/ChatWidget.astro
import { ChatWidget } from './ChatWidget.tsx';
---

<ChatWidget client:load />
```

### Using the Theme Configurator

For easy configuration generation, use the [Theme Editor demo](https://github.com/runtypelabs/persona/tree/main/examples/embedded-app) (`theme.html` in the embedded-app example) which includes a "React (Client Component)" export option. It generates a complete React component with your custom theme, launcher settings, and all configuration options.

### Installation

```bash
npm install @runtypelabs/persona
# or
pnpm add @runtypelabs/persona
# or
yarn add @runtypelabs/persona
```

### Key Considerations

1. **CSS Import**: The CSS import (`import '@runtypelabs/persona/widget.css'`) works natively with all modern React build tools
2. **Client-Side Only**: The widget manipulates the DOM, so it must run client-side only
3. **Cleanup**: Always call `handle.destroy()` in the cleanup function to prevent memory leaks
4. **API Routes**: Ensure your `apiUrl` points to a valid backend endpoint
5. **TypeScript Support**: Full TypeScript definitions are included for all exports

