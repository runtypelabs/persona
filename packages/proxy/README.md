## Vanilla Agent Proxy

Proxy server library for `@runtypelabs/persona` widget. Handles flow configuration, CORS, feedback collection, WebMCP/client-tool forwarding, `/resume` continuations, and secure forwarding to Runtype.

### Installation

```bash
npm install @runtypelabs/persona-proxy
```

### Usage

The proxy server handles flow configuration and forwards requests to Runtype. It mounts both the dispatch endpoint (default `/api/chat/dispatch`) and a matching child resume endpoint (`/api/chat/dispatch/resume`) so browser-executed LOCAL tools such as WebMCP page tools, `ask_user_question`, and `suggest_replies` can resume a paused execution. You can configure dispatch in three ways:

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

### Configuration Options

| Option | Type | Description |
| --- | --- | --- |
| `upstreamUrl` | `string` | Runtype API endpoint (defaults to `https://api.runtype.com/v1/dispatch`) |
| `apiKey` | `string` | Runtype API key (defaults to `RUNTYPE_API_KEY` environment variable) |
| `path` | `string` | Proxy endpoint path (defaults to `/api/chat/dispatch`) |
| `allowedOrigins` | `string[]` | CORS allowed origins |
| `flowId` | `string` | Runtype flow ID to use |
| `flowConfig` | `RuntypeFlowConfig` | Custom flow configuration |
| `feedbackPath` | `string` | Message-feedback endpoint path. Default: `/api/feedback`. |
| `onFeedback` | `(feedback) => Promise<void> \| void` | Optional handler for upvote/downvote payloads. |
| `previewOriginPattern` | `RegExp \| false` | Additional dynamic preview-origin allowlist (defaults to `https://*.vercel.app`; disable with `false`). |

### WebMCP and built-in client tools

For flow-dispatch requests, the proxy preserves `clientTools[]` from the widget payload and forwards them upstream so Runtype can register browser-local tools for that turn. Tool results are sent by the widget to `${path}/resume`, and the proxy forwards that body to the upstream `/resume` endpoint using the same API key. Agent-mode payloads are forwarded as-is and also retain `clientTools[]`.

### CORS behavior

- If `allowedOrigins` is omitted or empty, the proxy reflects the request origin (or `*`).
- If `allowedOrigins` is set, exact matches are allowed.
- `NODE_ENV=development` reflects local dev origins even when they are not in `allowedOrigins`; an unset `NODE_ENV` is treated as production.
- Vercel preview deployments (`VERCEL_ENV=preview`) and origins matching `previewOriginPattern` are reflected so per-branch preview URLs work without enumerating them.

### Feedback endpoint

`messageActions` feedback can POST to `feedbackPath` (default `/api/feedback`). The built-in handler validates `type` (`upvote`/`downvote`) and `messageId`, adds a timestamp, logs in development, and then calls `onFeedback` if provided.

### Environment Setup

Add `RUNTYPE_API_KEY` to your environment. The proxy constructs the Runtype payload (including flow configuration/client tools) and streams the response back to the client.

### Building

```bash
pnpm build
```

This generates:
- `dist/index.js` (ESM)
- `dist/index.cjs` (CJS)
- Type definitions in `dist/index.d.ts`

