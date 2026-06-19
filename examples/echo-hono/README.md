# hono: Persona on Hono

Mounts the **real Persona widget** against a **[Hono](https://hono.dev)** server, no
Next.js, no API key. The `POST /dispatch` route runs the canonical **echo agent** and streams its
reply as Persona's neutral SSE.

This is the reference host in Persona's **host matrix**. The same adapter is re-hosted four ways
([`echo-script-tag`](../echo-script-tag), this one, [`echo-express`](../echo-express),
[`echo-sveltekit`](../echo-sveltekit)). The two files that do the real work,
`src/lib/persona-wire.ts` (the zero-dependency wire helper) and `src/lib/echo-adapter.ts` (the
agent), are **byte-identical across all four**. Diff the examples and only the host wrapper moves.

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
| `turn_complete` + `execution_complete` `{kind:"agent", success}`   | end of turn                         |
| `execution_error` `{error:{message}}`                              | a thrown/failed responder           |

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

Plain streaming chat only. No WebMCP, local tools, the `await` pause, or `/resume`: just assistant
text deltas, to keep the host comparison clean.
