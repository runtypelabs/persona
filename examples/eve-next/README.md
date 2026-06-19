# eve: Persona + eve

Mounts the **real Persona widget** against an **[eve](https://github.com/vercel/eve)** agent
(`eve`, by Vercel). The `/dispatch` route streams an eve agent session and re-emits
each `message.appended` delta as Persona's SSE.

The only SDK-specific file is `app/lib/eve-adapter.ts`; everything else is the vendored
`createPersonaSSEStream` wire helper (`app/lib/persona-wire.ts`).

> **Note on the wire helper:** `app/lib/persona-wire.ts` is a zero-dependency, copy-pasteable utility that maps your framework's stream onto Persona's SSE protocol. Lift it straight into your own codebase.

> **eve is beta and filesystem-first.** It runs its own server (default
> `127.0.0.1:3000`) and requires **Node ≥ 24**. This example's route connects via the `eve/client`
> SDK: `Client().session().send(prompt)` resolves to a `MessageResponse` that is itself an
> `AsyncIterable` of typed session events (verified against `eve@0.11.4`), and we forward each
> `message.appended` / `data.messageDelta`. APIs may still shift while eve is beta; the validation
> path does not depend on a running server.

## Run

```bash
pnpm install                       # from the repo root

# 1. scaffold + start an eve agent in a separate terminal (needs Node >= 24)
npx eve@latest init my-agent && cd my-agent && npx eve dev   # serves on 127.0.0.1:3000

# 2. point this example at it and run the widget
cp examples/eve-next/.env.example examples/eve-next/.env.local
# edit .env.local: set EVE_HOST (and AI_GATEWAY_API_KEY for eve's model)
pnpm --filter eve-next dev
# open http://localhost:3100  (this example runs on :3100 so it doesn't collide with eve's :3000)
```

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

Copy two files into your app:

1. `persona-wire.ts` (`createPersonaSSEStream` + `personaMessagesToChat`; it has **no dependencies**)
2. `eve-adapter.ts`

Run an eve dev server, then export the handler:

```bash
npm i eve   # requires Node >= 24; run an eve agent separately (npx eve dev)
```

```ts
// app/api/chat/dispatch/route.ts (Web POST handler)
import { createEvePersonaHandler } from "@/lib/eve-adapter";
import { personaMessagesToChat } from "@/lib/persona-wire";

export const runtime = "nodejs";

export const POST = createEvePersonaHandler({
  host: process.env.EVE_HOST, // your running eve server
  getMessages: (body) => personaMessagesToChat((body as any).messages),
});
```

Then point the Persona widget at it: `createAgentExperience(host, { apiUrl: "/api/chat/dispatch" })` (the widget auto-detects the wire from the leading `execution_start` frame).
The session stream is injected, so you can supply your own `AsyncIterable` of eve events (or a mock)
instead of the default `eve/client` connection.

## What this intentionally does not show

Plain streaming chat. No WebMCP, local tools, the `await` pause, or `/resume`. eve has its own
tools / skills / channels / schedules model; this example only forwards assistant text deltas.
