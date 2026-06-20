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
`execution_error`). No running eve server and no model key are needed.

## How it maps to the wire protocol

| Widget reads (SSE `event`) | Adapter emits from the eve session |
| --- | --- |
| `execution_start` `{executionId, kind:"agent", agentId}` | run start |
| `turn_start` `{id:"turn_…", iteration:1}` | first delta |
| `text_start`·`text_delta`·`text_complete` `{id:"text_…", delta}` | each `message.appended` / `messageDelta` |
| `turn_complete` + `execution_complete` `{kind:"agent", success}` | session end |
| `execution_error` `{error:{message}}` | a thrown/failed session |

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

Plain streaming chat. No WebMCP, local tools, the `await` pause, or `/resume`. eve has its own
tools / skills / channels / schedules model; this example only forwards assistant text deltas.
