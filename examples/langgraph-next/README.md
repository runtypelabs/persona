# langgraph: Persona + LangGraph.js

Mounts the **real Persona widget** against a **[LangGraph.js](https://langchain-ai.github.io/langgraphjs/)**
graph (`@langchain/langgraph`). The `/dispatch` route builds a minimal single-node
`StateGraph`, streams it with `graph.streamEvents(input, { version: "v2" })`, and re-emits each
`on_chat_model_stream` token as Persona compatible SSE.

The only SDK-specific file is `app/lib/langgraph-adapter.ts`; everything else is the vendored
`createPersonaSSEStream` wire helper (`app/lib/persona-wire.ts`).

> **Note on the wire helper:** `app/lib/persona-wire.ts` is a zero-dependency, copy-pasteable utility that maps your framework's stream onto Persona's SSE protocol. Lift it straight into your own codebase.

## Run

```bash
pnpm install                       # from the repo root
cp examples/langgraph-next/.env.example examples/langgraph-next/.env.local
# edit .env.local: set OPENAI_API_KEY (https://platform.openai.com/api-keys)

pnpm --filter langgraph-next dev
# open http://localhost:3000
```

## Validate without a key

```bash
pnpm --filter langgraph-next test
```

The chat model is an **injected dependency**, so the test drives the graph with a **mock LLM**:
LangChain's `FakeStreamingChatModel` (`@langchain/core/utils/testing`), which streams known chunks
that LangGraph surfaces as `on_chat_model_stream` events. It asserts the emitted SSE is a valid
SSE run. The graph runs for real; no provider and no `OPENAI_API_KEY` are touched.

## How it maps to the wire protocol

| Widget reads (SSE `event`) | Adapter emits from `streamEvents` |
| --- | --- |
| `execution_start` `{executionId, kind:"agent", agentId}` | run start |
| `turn_start` `{id:"turn_…", iteration:1}` | first token |
| `text_start`·`text_delta`·`text_complete` `{id:"text_…", delta}` | each `on_chat_model_stream` chunk |
| `turn_complete` + `execution_complete` `{kind:"agent", success}` | stream end |
| `execution_error` `{error:{message}}` | a thrown/failed run |

> This example uses a minimal `StateGraph` (one model node) to keep the focus on the wire adapter.
> A `createReactAgent` with tools would stream the same way: the `on_chat_model_stream` events the
> adapter reads are identical.

## Use it in your app

Copy two files into your app:

1. `persona-wire.ts` (`createPersonaSSEStream` + `personaMessagesToChat`; it has **no dependencies**)
2. `langgraph-adapter.ts`

Install LangGraph and a model, then export the handler:

```bash
npm i @langchain/langgraph @langchain/core @langchain/openai
```

```ts
// app/api/chat/dispatch/route.ts (Web POST handler)
import { ChatOpenAI } from "@langchain/openai";
import { createLangGraphPersonaHandler } from "@/lib/langgraph-adapter";
import { personaMessagesToChat } from "@/lib/persona-wire";

export const runtime = "nodejs";

export const POST = createLangGraphPersonaHandler({
  llm: new ChatOpenAI({ model: "gpt-4.1-mini", streaming: true }),
  getMessages: (body) => personaMessagesToChat((body as any).messages),
});
```

Then point the Persona widget at it: `createAgentExperience(host, { apiUrl: "/api/chat/dispatch" })` (the widget auto-detects the wire from the leading `execution_start` frame).
The chat model is injected, so any `BaseChatModel` (incl. a `FakeStreamingChatModel` mock) works.
You can swap the minimal `StateGraph` for `createReactAgent`: the `on_chat_model_stream` events
the adapter reads are identical.

## What this intentionally does not show

Plain streaming chat. No WebMCP, local tools, the `await` pause, or `/resume`.
