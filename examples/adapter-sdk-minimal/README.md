# Persona SDK Adapter Minimal

This standalone example shows two minimal ways to plug an existing SDK stream
into Persona's SSE protocol without writing Persona frames in every route:

- **Vercel AI SDK**: wraps `streamText().fullStream`
- **OpenAI Responses SDK**: wraps `openai.responses.create({ stream: true })`

The adapters emit Persona's neutral **unified** vocabulary
(`execution_start` / `turn_start` / `text_start`·`text_delta`·`text_complete` /
`turn_complete` / `execution_complete`) — the one protocol any backend can
speak, and the same wire the Runtype API emits. The widget consumes the unified
vocabulary natively.

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

Both routes return Persona-compatible SSE. The streamed `text_delta`s are
authoritative — there's no need to re-send the full text at the end, and one
`executionId` (`exec_…`) plus `kind:"agent"` are carried across the run:

```txt
event: execution_start
data: {"type":"execution_start","executionId":"exec_...","seq":0,"kind":"agent","agentId":"virtual","startedAt":"..."}

event: turn_start
data: {"type":"turn_start","executionId":"exec_...","seq":1,"id":"turn_...","iteration":1}

event: text_start
data: {"type":"text_start","executionId":"exec_...","seq":2,"id":"text_..."}

event: text_delta
data: {"type":"text_delta","executionId":"exec_...","seq":3,"id":"text_...","delta":"...","iteration":1}

event: text_complete
data: {"type":"text_complete","executionId":"exec_...","seq":4,"id":"text_..."}

event: turn_complete
data: {"type":"turn_complete","executionId":"exec_...","seq":5,"id":"turn_...","iteration":1,"stopReason":"end_turn","completedAt":"..."}

event: execution_complete
data: {"type":"execution_complete","executionId":"exec_...","seq":6,"kind":"agent","success":true,"completedAt":"..."}
```

## What this intentionally does not show

This example is plain streaming chat. It does not include WebMCP, local tools,
the `await` pause, or `/resume`. Those belong in the advanced example at
`examples/ai-sdk-webmcp`.

The split is deliberate:

- Start here to understand the base stream adapter contract.
- Move to `examples/ai-sdk-webmcp` when you need browser-executed page tools and
  pause/resume semantics.
