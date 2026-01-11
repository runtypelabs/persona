## Vanilla Agent Proxy

Proxy server library for `@runtypelabs/persona` widget. Handles flow configuration and forwards requests to Runtype or other AI backends.

### Installation

```bash
npm install @runtypelabs/persona-proxy
```

### Usage

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

### Configuration Options

| Option | Type | Description |
| --- | --- | --- |
| `upstreamUrl` | `string` | Runtype API endpoint (defaults to `https://api.runtype.com/v1/dispatch`) |
| `apiKey` | `string` | Runtype API key (defaults to `RUNTYPE_API_KEY` environment variable) |
| `path` | `string` | Proxy endpoint path (defaults to `/api/chat/dispatch`) |
| `allowedOrigins` | `string[]` | CORS allowed origins |
| `flowId` | `string` | Runtype flow ID to use |
| `flowConfig` | `RuntypeFlowConfig` | Custom flow configuration |

### Environment Setup

Add `RUNTYPE_API_KEY` to your environment. The proxy constructs the Runtype payload (including flow configuration) and streams the response back to the client.

### Building

```bash
pnpm build
```

This generates:
- `dist/index.js` (ESM)
- `dist/index.cjs` (CJS)
- Type definitions in `dist/index.d.ts`

