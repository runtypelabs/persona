# Persona SDK Adapter Minimal

This standalone example shows two minimal ways to plug an existing SDK stream
into Persona's SSE protocol without writing Persona frames in every route:

- **Vercel AI SDK**: wraps `streamText().fullStream`
- **OpenAI Responses SDK**: wraps `openai.responses.create({ stream: true })`

The adapters emit Persona's neutral **agent** vocabulary
(`agent_start` / `agent_turn_delta` / `agent_complete`) — the protocol any
backend can speak. (The `step_*` / `flow_complete` events you may see elsewhere
are Runtype's flow-automation dialect; you don't need them here.)

The local adapter helpers live in `app/lib/` so they are easy to lift into a
future package export such as `@runtypelabs/persona-proxy/adapters`.

## Run

```bash
pnpm --filter @runtypelabs/persona build
cp examples/adapter-sdk-minimal/.env.example examples/adapter-sdk-minimal/.env.local
# edit .env.local and set OPENAI_API_KEY
pnpm --filter adapter-sdk-minimal dev
```

Open `http://localhost:3000`.

## Routes

| Route | SDK | Adapter |
| --- | --- | --- |
| `/api/ai-sdk/dispatch` | Vercel AI SDK | `createAISDKPersonaHandler()` |
| `/api/openai-responses/dispatch` | Official OpenAI SDK | `createOpenAIResponsesPersonaHandler()` |

Both routes accept the normal Persona proxy-mode dispatch body:

```ts
{
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
```

Both routes return Persona-compatible SSE. The streamed `agent_turn_delta`s are
authoritative — there's no need to re-send the full text at the end, and one
`executionId` (`exec_…`) is carried across every event of the run:

```txt
event: agent_start
data: {"type":"agent_start","executionId":"exec_...","agentId":"virtual","startedAt":"..."}

event: agent_turn_delta
data: {"type":"agent_turn_delta","executionId":"exec_...","iteration":1,"turnId":"turn_...","contentType":"text","delta":"..."}

event: agent_complete
data: {"type":"agent_complete","executionId":"exec_...","success":true,"completedAt":"..."}
```

## What this intentionally does not show

This example is plain streaming chat. It does not include WebMCP, local tools,
`agent_await`, or `/resume`. Those belong in the advanced example at
`examples/ai-sdk-webmcp`.

The split is deliberate:

- Start here to understand the base stream adapter contract.
- Move to `examples/ai-sdk-webmcp` when you need browser-executed page tools and
  pause/resume semantics.
