# openai-agents: Persona + OpenAI Agents SDK

Mounts the **real Persona widget** against the **[OpenAI Agents SDK](https://openai.github.io/openai-agents-js/)**
(`@openai/agents`). The `/dispatch` route runs an `Agent` with
`run(agent, input, { stream: true })` and re-emits each `output_text_delta` event as Persona compatible SSE.

The only SDK-specific file is `app/lib/openai-agents-adapter.ts`; everything else is the vendored
`createPersonaSSEStream` wire helper (`app/lib/persona-wire.ts`).

> **Note on the wire helper:** `app/lib/persona-wire.ts` is a zero-dependency, copy-pasteable utility that maps your framework's stream onto Persona's SSE protocol. Lift it straight into your own codebase.

## Run

```bash
pnpm install                       # from the repo root
cp examples/openai-agents-next/.env.example examples/openai-agents-next/.env.local
# edit .env.local: set OPENAI_API_KEY (https://platform.openai.com/api-keys)

pnpm --filter openai-agents-next dev
# open http://localhost:3000
```

## Validate without a key

```bash
pnpm --filter openai-agents-next test
```

The `Agent` is an **injected dependency**, so the test builds it with a **mock LLM**: an AI SDK
v6 `MockLanguageModelV3` (`ai/test`) wrapped via `aisdk()` from `@openai/agents-extensions`. It
asserts the emitted SSE is a valid run. The agent runs for real; no OpenAI provider and no
`OPENAI_API_KEY` are touched.

## How it maps to the wire protocol

| Widget reads (SSE `event`) | Adapter emits from `run(..., { stream:true })` |
| --- | --- |
| `execution_start` `{executionId, kind:"agent", agentId}` | run start |
| `turn_start` `{id:"turn_…", iteration:1}` | first text delta |
| `text_start`·`text_delta`·`text_complete` `{id:"text_…", delta}` | each `raw_model_stream_event` / `output_text_delta` |
| `turn_complete` + `execution_complete` `{kind:"agent", success}` | stream end |
| `execution_error` `{error:{message}}` | a thrown/failed run |

## Use it in your app

Copy two files into your app:

1. `persona-wire.ts` (`createPersonaSSEStream` + `personaMessagesToChat`; it has **no dependencies**)
2. `openai-agents-adapter.ts`

Install the SDK, build an `Agent`, and export the handler:

```bash
npm i @openai/agents
```

```ts
// app/api/chat/dispatch/route.ts (Web POST handler)
import { Agent } from "@openai/agents";
import { createOpenAIAgentsPersonaHandler } from "@/lib/openai-agents-adapter";
import { personaMessagesToChat } from "@/lib/persona-wire";

export const runtime = "nodejs";

const agent = new Agent({ name: "Assistant", instructions: "Be concise.", model: "gpt-4.1-mini" });

export const POST = createOpenAIAgentsPersonaHandler({
  agent,
  getMessages: (body) => personaMessagesToChat((body as any).messages),
});
```

Then point the Persona widget at it: `createAgentExperience(host, { apiUrl: "/api/chat/dispatch" })` (the widget auto-detects the wire from the leading `execution_start` frame).
The `Agent` is injected, so you can attach tools/handoffs or swap the model (incl. a mock via
`aisdk()`) without touching the adapter.

## What this intentionally does not show

Plain streaming chat. No WebMCP, local tools, the `await` pause, or `/resume`. The Agents SDK has
its own tools / handoffs / human-in-the-loop model; this example only forwards assistant text deltas.
