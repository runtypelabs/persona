# eve: Persona + eve

Mounts the **real Persona widget** against an **[eve](https://github.com/vercel/eve)** agent
(`eve`, by Vercel). The `/dispatch` route streams an eve agent session and re-emits
each `message.appended` delta as Persona's SSE.

The eve agent lives **in this repo** under [`agent/`](./agent), and
[`next.config.mjs`](./next.config.mjs) wraps the Next config with `withEve()`. That launches
eve alongside `next dev` and proxies same-origin `/eve/v1/...` requests to it, so there's
**no separate eve server to start and no `EVE_HOST` to set**.

The only SDK-specific file is `app/lib/eve-adapter.ts`; everything else is the vendored
`createPersonaSSEStream` wire helper (`app/lib/persona-wire.ts`).

> **Note on the wire helper:** `app/lib/persona-wire.ts` is a zero-dependency, copy-pasteable utility that maps your framework's stream onto Persona's SSE protocol. Lift it straight into your own codebase.

> **eve is beta, filesystem-first, and needs Node ≥ 24.** This example connects via the
> `eve/client` SDK: `Client({ host }).session().send(prompt)` resolves to a `MessageResponse`
> that is an `AsyncIterable` of typed session events (verified against `eve@0.11.6`), and we
> forward each `message.appended` / `data.messageDelta`. APIs may still shift while eve is beta;
> the validation path does not depend on a running server.

## Run

```bash
pnpm install                       # from the repo root (Node >= 24)

cp examples/eve-next/.env.example examples/eve-next/.env.local
# edit .env.local: set AI_GATEWAY_API_KEY for eve's model

pnpm --filter eve-next dev         # withEve() auto-starts the ./agent eve server
# open http://localhost:3100  (this example runs on :3100; eve picks a free port itself)
```

That's the whole flow: one command starts both Next and the in-repo eve agent. To point at an
already-running eve server instead, set `EVE_BASE_URL` and the route uses it directly.

## Validate without a server

```bash
pnpm --filter eve-next test
```

The session stream is an **injected dependency**, so the test drives the adapter with a **mock
LLM** (a fake event stream yielding eve's own `message.appended` / `messageDelta` shapes). It
asserts the emitted SSE is a valid SSE run (and that mid-stream errors surface as
`execution_error`). The follow-up cases stub an `actions.requested` event, since an offline
run cannot make a real model decide to call a tool. No running eve server and no model key
are needed.

## How it maps to the wire protocol

| Widget reads (SSE `event`) | Adapter emits from the eve session |
| --- | --- |
| `execution_start` `{executionId, kind:"agent", agentId}` | run start |
| `turn_start` `{id:"turn_…", iteration:1}` | first delta |
| `text_start`·`text_delta`·`text_complete` `{id:"text_…", delta}` | each `message.appended` / `messageDelta` |
| `tool_start` + `tool_complete` `{toolCallId, toolName, parameters}` | each `actions.requested` / `kind:"tool-call"` action |
| `turn_complete` + `execution_complete` `{kind:"agent", success}` | session end |
| `execution_error` `{error:{message}}` | a thrown/failed session |

## Follow-up suggestions

After each answer the agent offers a couple of tappable quick replies. Three pieces
make that work, one per layer:

1. **The tool**, in eve's filesystem-first idiom: [`agent/tools/suggest_replies.ts`](./agent/tools/suggest_replies.ts).
   The filename is the model-facing name, which is exactly the name Persona's widget
   looks for. Its `inputSchema` is the widget's own JSON Schema, copied inline so the
   example stays zero-dependency, and `execute` just returns the canned "shown"
   result: the chips are rendered by the widget, not by the tool.
2. **The steering**, in [`agent/instructions.md`](./agent/instructions.md): a line
   telling the agent to offer 2-3 follow-ups in the user's voice after answering.
   Declaring the tool makes the call possible; the instructions make it happen.
3. **The mapping**, in [`app/lib/eve-adapter.ts`](./app/lib/eve-adapter.ts): eve's
   `actions.requested` events carry `{ kind: "tool-call", callId, toolName, input }`,
   and each one becomes `emit.toolCall(...)`, which puts a `tool_start` +
   `tool_complete` pair on the wire.

The call is fire-and-forget: eve runs the tool itself, so there is no pause, no
`/resume` endpoint, and no widget config to set. The widget renders chips from any
`suggest_replies` tool call it sees in the transcript. Two things to keep right if
you copy this: the arguments must ride `tool_start.parameters` (streamed argument
deltas are display-only), and no frame should carry `origin: "webmcp"`. The widget
reads `origin` on `await` frames only, where it renames the tool and routes it to
the page-tool bridge; `tool_start` ignores the field, so omitting it always holds.

For a keyless, offline version of the same wire frames see
[`echo-hono`](../echo-hono); for the AI SDK spelling of the same idea see
[`ai-sdk-next`](../ai-sdk-next).

## Use it in your app

1. Define an eve agent in `agent/` (`agent/agent.ts` + `agent/channels/eve.ts` + optional
   `agent/instructions.md`). See [`agent/`](./agent) here for the minimal shape.
2. Wrap your Next config with `withEve()`:

   ```ts
   // next.config.mjs
   import { withEve } from "eve/next";
   export default withEve({});
   ```

3. Copy two files into your app and export the dispatch handler:
   - `persona-wire.ts` (`createPersonaSSEStream` + `personaMessagesToChat`; **no dependencies**)
   - `eve-adapter.ts`

   ```ts
   // app/api/chat/dispatch/route.ts (Web POST handler)
   import { createEvePersonaHandler } from "@/lib/eve-adapter";
   import { personaMessagesToChat } from "@/lib/persona-wire";

   export const runtime = "nodejs";

   export const POST = createEvePersonaHandler({
     // No host: resolves EVE_BASE_URL or the request origin (the withEve rewrite).
     getMessages: (body) => personaMessagesToChat((body as any).messages),
   });
   ```

Then point the Persona widget at it: `createAgentExperience(host, { apiUrl: "/api/chat/dispatch" })`
(the widget auto-detects the wire from the leading `execution_start` frame). The session stream
is injected, so you can supply your own `AsyncIterable` of eve events (or a mock) instead of the
default `eve/client` connection.

## What this intentionally does not show

Streaming chat plus one fire-and-forget tool call. No WebMCP, no `await` pause, no `/resume`.
eve has its own tools / skills / channels / schedules model, and this example uses only the
smallest slice of it. For the pausing, resumable tool pattern see
[`ai-sdk-webmcp`](../ai-sdk-webmcp).
