# Persona SDK Adapter Minimal

This standalone example shows two minimal ways to plug an existing SDK stream
into Persona's SSE protocol without writing Persona frames in every route:

- **Vercel AI SDK**: wraps `streamText().fullStream`
- **OpenAI Responses SDK**: wraps `openai.responses.create({ stream: true })`

The adapters emit Persona's SSE event vocabulary
(`execution_start` / `turn_start` / `text_start`·`text_delta`·`text_complete` /
`turn_complete` / `execution_complete`). Any backend can speak this protocol, and it matches the
wire the Runtype API emits. The widget consumes the wire natively. The AI SDK
route adds the optional `tool_start` / `tool_complete` pair for follow-up
suggestions.

The local adapter helpers live in `app/lib/` so they are easy to lift into a
future package export such as `@runtypelabs/persona-proxy/adapters`.

## Run

```bash
pnpm --filter @runtypelabs/persona build
cp examples/ai-sdk-next/.env.example examples/ai-sdk-next/.env.local
# edit .env.local and set OPENAI_API_KEY
pnpm --filter ai-sdk-next dev
```

Open `http://localhost:3000`.

The adapter tests run offline against a mocked model, so they need no API key:

```bash
pnpm --filter ai-sdk-next test
```

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
authoritative. You don't need to re-send the full text at the end, and one
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

## Follow-up suggestions

The AI SDK route also shows the model-driven path to Persona's quick-reply
chips. Three pieces, all in `app/lib/ai-sdk-adapter.ts`:

1. A tool named `suggest_replies`, defined with the AI SDK's
   `tool({ inputSchema: jsonSchema(...) })` using the same parameters schema the
   widget ships: 1 to 4 items of `{ label, prompt?, description? }`. Its
   `execute` returns a canned "Suggestions shown to the user." result, because
   nothing actually runs.
2. A steering line appended to the system prompt: "after answering, offer 2-3
   follow-up suggestions with the suggest_replies tool, phrased in the user's
   voice". The tool description is passive; this instruction is what drives how
   often the model calls it.
3. A branch in the `fullStream` loop that maps the `tool-call` part onto
   `emit.toolCall(...)`, which writes `tool_start` (carrying the arguments on
   `parameters`) followed immediately by `tool_complete`.

The call is fire-and-forget: no pause, no `/resume` endpoint, and no widget
config. Chip rendering is transcript-derived, so any `suggest_replies` tool call
on the wire renders chips while `suggestions.followUps` is at its default
(`enabled: true`).

Four things worth knowing:

- Arguments must ride `tool_start.parameters`. The `tool_input_delta` frames are
  display-only, so streaming arguments incrementally never fills them in.
- Omit `origin` on these frames. The widget reads it on `await` frames only,
  where `origin: "webmcp"` renames the tool to `webmcp:suggest_replies` and
  routes it to the page-tool bridge; `tool_start` ignores the field, so omitting
  it is the rule that holds either way.
- The stream must reach `execution_complete`, otherwise the chips render but
  stay permanently disabled.
- `stopWhen: stepCountIs(1)` is `streamText`'s documented default. Passing it
  explicitly only makes the single-step loop visible: a fire-and-forget result
  has nothing to feed back to the model, so there is no second step to stop.

To let the widget advertise the tool instead (`suggestions.followUps.expose:
true`), read `body.clientTools` and build the tool set from it. See the comment
above `createAISDKPersonaHandler` and `buildTools()` in
`examples/ai-sdk-webmcp/app/api/chat/shim.ts`, minus its `origin: "webmcp"`
hardcode. For a keyless, offline version of the same wire, see
`examples/echo-hono`.

## Choosing a model/assistant with `target`

The routes above hardcode one model per route: the simplest setup, and all most
apps need. If you want the **browser to choose** the model or assistant, use the
widget's normalized `target` field plus a `targetProviders` resolver. The
resolver runs in the browser and maps a friendly string to extra wire fields;
your route reads them and constructs the model server-side. (The resolver is a
wire mapping, not a model factory: model instantiation stays on the server.)

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
route and **allowlist** it. Never pass a client-supplied model straight to the
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

This example is streaming chat plus one fire-and-forget tool call. It does not
include WebMCP, browser-executed tools, the `await` pause, or `/resume`. Those
belong in the advanced example at `examples/ai-sdk-webmcp`.

The split is deliberate:

- Start here to understand the base stream adapter contract.
- Move to `examples/ai-sdk-webmcp` when you need browser-executed page tools and
  pause/resume semantics.
