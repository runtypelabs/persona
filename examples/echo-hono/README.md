# hono: Persona on Hono

Mounts the **real Persona widget** against a **[Hono](https://hono.dev)** server, no
Next.js, no API key. The `POST /dispatch` route runs the canonical **echo agent** and streams its
reply as Persona's neutral SSE.

This is the reference host in Persona's **host matrix**. The same adapter is re-hosted four ways
([`echo-script-tag`](../echo-script-tag), this one, [`echo-express`](../echo-express),
[`echo-sveltekit`](../echo-sveltekit)). The two files that do the real work,
`src/lib/persona-wire.ts` (the zero-dependency wire helper) and `src/lib/echo-adapter.ts` (the
agent), are **exact copies across all four**. Diff the examples and only the host wrapper moves.

Hono is the most portable host: the one `app.fetch` handler runs unchanged on Node, Bun, Deno, and
Cloudflare Workers.

## The whole integration

```ts
// src/index.ts
const dispatch = createEchoPersonaHandler();        // a Web (Request) => Response

app.post("/dispatch", (c) => dispatch(c.req.raw));  // ← mount it. that's the entire bridge.
```

Hono hands you the underlying Web `Request` (`c.req.raw`) and the adapter returns a Web `Response`,
so there is **no host-specific streaming glue**. (Contrast with
[`echo-express`](../echo-express), where Express's `(req, res)` callback style
forces a real bridge.)

## Run

```bash
pnpm install                       # from the repo root
pnpm --filter echo-hono build   # builds the widget so the page can mount it offline
pnpm --filter echo-hono dev
# open http://localhost:3110
```

No API key needed. The default agent echoes your message back, streamed word by word.

## Validate without a server

```bash
pnpm --filter echo-hono test
```

The test drives the adapter as a plain `(Request) => Response`, with no Hono, no port, and no
network. It asserts the emitted SSE is a well-formed SSE run (and that a mid-stream error surfaces as
`execution_error`). The same test file works in every host in the matrix because the adapter never
changes.

## How it maps to the wire protocol

| Widget reads (SSE `event`)                                 | Adapter emits                       |
| ------------------------------------------------------------------ | ----------------------------------- |
| `execution_start` `{executionId, kind:"agent", agentId}`           | run start                           |
| `turn_start` `{id:"turn_…", iteration:1}`                          | first delta                         |
| `text_start`·`text_delta`·`text_complete` `{id:"text_…", delta}`   | each streamed chunk from `respond`  |
| `tool_start` + `tool_complete` `{toolCallId, toolName, parameters}` | one fire-and-forget tool call       |
| `turn_complete` + `execution_complete` `{kind:"agent", success}`   | end of turn                         |
| `execution_error` `{error:{message}}`                              | a thrown/failed responder           |

## Follow-up suggestions

After the reply, the adapter calls `emit.suggestReplies([...])` (see `FOLLOW_UP_SUGGESTIONS` in
`src/lib/echo-adapter.ts`), and the widget renders the items as tappable chips under the message.
No widget config, no API key, no `/resume` endpoint: the chips are pure wire, a `suggest_replies`
tool call emitted as a `tool_start` / `tool_complete` pair that the run does not wait on.

```ts
for await (const chunk of respond(messages)) emit.textDelta(chunk);
emit.suggestReplies([
  { label: "Say that again" },
  { label: "Swap in a real model", prompt: "How do I swap in a real model?" },
]);
emit.complete();
```

Items are `{ label, prompt?, description? }` (or bare strings), max 4, and must be emitted after the
last `textDelta` and before `complete()`: chips stay disabled until the stream terminates. With a
real model, declare a `suggest_replies` tool in your SDK, ask for it in your system prompt, and map
the model's tool call onto the general form, `emit.toolCall(name, parameters)`. See
[`ai-sdk-next`](../ai-sdk-next) for that version.

## Swap in a real model

The agent is just a `Responder`: an async generator of text chunks. `echo-adapter.ts` ships a
dependency-free `openAiResponder` built on raw `fetch`:

```ts
// src/index.ts
import { createEchoPersonaHandler, openAiResponder } from "./lib/echo-adapter";

const dispatch = createEchoPersonaHandler({
  respond: openAiResponder(process.env.OPENAI_API_KEY!),
});
```

Or write your own `Responder` over any SDK (LangGraph, the OpenAI Agents SDK, the Vercel AI SDK).
The wire stays exactly the same. (See the SDK-specific examples
[`langgraph-next`](../langgraph-next), [`openai-agents-next`](../openai-agents-next),
and [`ai-sdk-next`](../ai-sdk-next).)

## What this intentionally does not show

Streaming text plus one fire-and-forget tool call. No WebMCP, no `await` pause, and no `/resume`
endpoint, to keep the host comparison clean. A tool call the agent must wait on needs server-side
state; see [`ai-sdk-webmcp`](../ai-sdk-webmcp) for that.
