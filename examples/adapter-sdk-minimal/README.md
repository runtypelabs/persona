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

## Choosing a model/assistant with `target`

The routes above hardcode one model per route — the simplest setup, and all most
apps need. If you want the **browser to choose** the model or assistant, use the
widget's normalized `target` field plus a `targetProviders` resolver. The
resolver runs in the browser and maps a friendly string to extra wire fields;
your route reads them and constructs the model server-side. (The resolver is a
wire mapping, not a model factory — model instantiation stays on the server.)

Mount the widget with a `target` and a resolver:

```ts
import { createAgentExperience } from "@runtypelabs/persona";

createAgentExperience(host, {
  apiUrl: "/api/ai-sdk/dispatch",
  target: "openai:gpt-4.1-mini",
  targetProviders: {
    // "openai:gpt-4.1-mini" -> { model: "gpt-4.1-mini" } merged into the body
    openai: (id) => ({ payload: { model: id } }),
  },
});
```

The dispatch body becomes `{ messages, model: "gpt-4.1-mini" }`. Read it in the
route and **allowlist** it — never pass a client-supplied model straight to the
provider:

```ts
// app/api/ai-sdk/dispatch/route.ts
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { createPersonaSSEStream, personaMessagesToModelMessages } from "../../../lib/persona-wire";

export const runtime = "nodejs";

const ALLOWED = new Set(["gpt-4.1-mini", "gpt-4.1"]);

export async function POST(req: Request) {
  const body = await req.json();
  const modelId = ALLOWED.has(body.model) ? body.model : "gpt-4.1-mini";

  return createPersonaSSEStream(async ({ emit }) => {
    const result = streamText({
      model: openai(modelId),
      messages: personaMessagesToModelMessages(body.messages),
    });
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") emit.textDelta(part.text);
      else if (part.type === "error") {
        emit.error(part.error instanceof Error ? part.error.message : String(part.error));
        return;
      }
    }
    emit.complete();
  });
}
```

This route reads `req.json()` directly instead of using `createAISDKPersonaHandler()`,
because that helper takes a fixed `model`. For per-request selection, inline the
handler as above (or extend the helper to accept `model: (body) => LanguageModel`).

Notes:

- **OpenAI SDK** is the same shape: read `body.model` and pass it to
  `responses.create({ model, ... })`. To target a saved OpenAI assistant instead
  of a model, resolve to `{ payload: { assistantId: id } }` and read
  `body.assistantId` in the route.
- **Runtype TypeIDs** route automatically: `target: "agent_…"` / `"flow_…"` need
  no resolver (the prefix is self-describing).
- `target` is mutually exclusive with `agentId`, `flowId`, and inline `agent`.
- See `packages/widget/docs/CONFIGURATION-REFERENCE.md` ("Routing targets") for
  the full resolution rules.

## What this intentionally does not show

This example is plain streaming chat. It does not include WebMCP, local tools,
the `await` pause, or `/resume`. Those belong in the advanced example at
`examples/ai-sdk-webmcp`.

The split is deliberate:

- Start here to understand the base stream adapter contract.
- Move to `examples/ai-sdk-webmcp` when you need browser-executed page tools and
  pause/resume semantics.
