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
SSE run, including a mocked `suggest_replies` tool-call chunk and the frame ordering it produces.
The graph runs for real; no provider and no `OPENAI_API_KEY` are touched.

## How it maps to the wire protocol

| Widget reads (SSE `event`) | Adapter emits from `streamEvents` |
| --- | --- |
| `execution_start` `{executionId, kind:"agent", agentId}` | run start |
| `turn_start` `{id:"turn_…", iteration:1}` | first token |
| `text_start`·`text_delta`·`text_complete` `{id:"text_…", delta}` | each `on_chat_model_stream` chunk |
| `tool_start` + `tool_complete` `{toolCallId, toolName, parameters}` | each `tool_calls` entry on `on_chat_model_end` |
| `turn_complete` + `execution_complete` `{kind:"agent", success}` | stream end |
| `execution_error` `{error:{message}}` | a thrown/failed run |

> This example uses a minimal `StateGraph` (one model node) to keep the focus on the wire adapter.
> A `createReactAgent` with tools would stream the same way: the `on_chat_model_stream` events the
> adapter reads are identical.

## Follow-up suggestions

The adapter binds the built-in `suggest_replies` tool to the model with `llm.bindTools([...])` and
adds a steering line to the system prompt. The tool has no `ToolNode` counterpart: the graph ends
after the model node, and each `tool_calls` entry on the closing `on_chat_model_end` event becomes
a fire-and-forget `tool_start` / `tool_complete` pair via `emit.toolCall(name, args)`. The widget
renders the items as tappable chips under the message. Nothing pauses, so no `/resume` endpoint is
needed.

```ts
if (event.event === "on_chat_model_end") {
  for (const call of event.data.output?.tool_calls ?? []) {
    emit.toolCall(call.name, call.args, { toolCallId: call.id });
  }
}
```

The tool is declared in LangChain's plain `{ name, description, schema }` shape with a JSON Schema,
so the example needs no zod dependency, and `bindTools` is called optionally, so a model without it
just streams text. Items are `{ label, prompt?, description? }`, max 4. The tool description alone
is weak steering: the system prompt line is what sets call frequency.

The steering line is opt-out. `followUpSteering: true` (the default) uses the built-in line, a
string replaces it, and `false` drops it. With no `systemPrompt` and no steering the run emits no
system message at all.

```ts
createLangGraphPersonaHandler({ llm, getMessages, followUpSteering: false });
```

For a keyless, offline version of the same wire, see [`echo-hono`](../echo-hono).

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

Streaming chat plus one fire-and-forget tool call. No WebMCP, no `await` pause, and no `/resume`
endpoint. A tool call the agent must wait on needs server-side state; see
[`ai-sdk-webmcp`](../ai-sdk-webmcp) for that.
