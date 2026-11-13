# Stream transports and the WebSocket transport

Every widget request that yields a stream (a send, a `/resume`, an approval, a
durable reconnect) goes through one seam, `config.transport`. Without one the
widget uses `fetch` + SSE exactly as before. A transport can deliver the same
streams over another channel, such as a WebSocket.

There are three ways the seam is used:

| Setup | What carries the stream |
| --- | --- |
| No `transport`, not client-token mode | HTTP + SSE (unchanged) |
| Runtype client token, init advertises `realtime` | The Runtype client-session socket, automatically (below) |
| `config.transport` set | Your transport; Runtype's socket is not used |

## The transport contract

```ts
import type { PersonaTransport } from "@runtypelabs/persona";

const transport: PersonaTransport = {
  // Return next(request) to use HTTP, or a Response whose body is
  // `text/event-stream` in Persona's SSE wire format.
  async request(request, next) {
    return next(request);
  },
  warm(reason) {},   // optional: "intent" | "open" | "resume" | "visible"
  destroy() {},      // optional
};
```

`request.kind` is `dispatch`, `resume`, `approve`, or `reconnect`. A reconnect
carries `executionId` and `after` (the last applied SSE `id:`). Because a
transport returns an SSE `Response`, the rest of the widget (parsing, tool
pauses, approvals, durable reconnect, persistence) is unchanged. Reject with
`PersonaTransportError` (`code`: `unavailable`, `unauthorized`, `disabled`,
`rate_limited`, `protocol`, `stream_error`, `aborted`) for failures the widget
should report.

## `createWebSocketTransport`

A generic socket transport ships as the lazy `websocket-transport` chunk. It is
not in the core bundle; load it from the package subpath or, on the CDN build,
with `AgentWidget.loadWebSocketTransport()`.

```ts
import { createWebSocketTransport } from "@runtypelabs/persona/websocket-transport";

const transport = createWebSocketTransport({
  url: () => mintSocketUrl(),             // string or (async) function, called per connect
  protocols: () => ["my-proto", token],   // optional, also per connect
  codec,                                   // maps your wire format (below)
  awaitReady: true,                        // wait for a codec "ready" message
  idleCloseMs: 180_000,                    // close while the page is hidden this long
});

initAgentWidget({ target: "#chat", config: { apiUrl: "/unused", transport } });
```

The transport connects on the first `warm()` or request, reconnects with
backoff, multiplexes streams by id, closes on `pagehide` (so the page stays
bfcache-eligible) and reconnects on `pageshow`, and does not connect while the
document is prerendering.

A codec adapts a backend in one of two shapes:

- **Duplex** (the socket carries the request): implement `encode(request,
  { streamId })` to return the outbound message(s), and `decode` to return
  `{ kind: "events", streamId, events }` (Persona unified events) or
  `{ kind: "sse", streamId, sse }` (raw SSE text), then `{ kind: "end", streamId }`.
- **HTTP up, socket down** (HTTP starts the turn, the socket streams it):
  implement `prepare` to mark the HTTP request, `accept(response)` to return the
  stream id when the HTTP response hands the stream to the socket, and
  `attach(streamId, after)` / `detach(streamId)` for cursor replay.

`classifyClose(code, reason)` maps a close to `reconnect`, `reauth`, `disable`
(fall back to HTTP for good), or `stop`. A full duplex example against the
OpenAI Realtime API is in
[`examples/openai-realtime-websocket`](../examples/openai-realtime-websocket).

## The Runtype client-session socket

In client-token mode the widget uses the socket on its own when all of these
hold: `/v1/client/init` returns `realtime: { protocol:
"runtype-client-session-v1", url }`, durable recovery is enabled, the browser
has `WebSocket`, `config.realtime` is not `false`, and no `config.transport` is
set. Otherwise every stream stays on HTTP + SSE.

- Sends still POST to `/v1/client/chat`. When the socket is ready the request
  asks for socket delivery; a `202 { executionId, delivery: "socket" }` hands
  the stream to the socket, and a `200` SSE response is consumed as before.
- By default the socket connects on intent, not on page load: launcher hover
  or focus, opening the widget, composer focus, the first send, the tab
  becoming visible while open, or a turn to recover at boot. `realtime.connect`
  changes the trigger (see below). A `preconnect` hint for the API origin is
  added at mount.
- Turns started in another tab of the same conversation render live while this
  tab is idle. A tab treats a turn as its own only when it can name it: by the
  execution id it was given, or by the turn id the server echoes back
  (`clientTurnId`). When the server does not echo the turn id, a send that was
  stopped or failed after it left, and whose turn started anyway, renders as a
  watched read-only turn.
- A lost socket falls back to the durable events route for the open turn and
  reconnects. A turn the socket cannot reattach (`execution_not_found`)
  continues on the events route.
- A `1012` close reconnects right away with the same credentials and resumes
  each open turn after its cursor. A `4401` close renews the client session;
  when the renewed session belongs to another conversation (after a visitor
  reset) the old socket is dropped and the next request uses the new one. A
  `4403` close keeps the widget on SSE for that socket URL.

```ts
initAgentWidget({
  target: "#chat",
  config: {
    clientToken: "ct_...",
    persistState: true,
    realtime: { idleCloseMs: 180_000, preconnect: true }, // or false to opt out
  },
});
```

| `realtime` option | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | `false` keeps every stream on HTTP + SSE, like `realtime: false`. |
| `connect` | `"focus"` | When the socket connects. See the next table. |
| `idleCloseMs` | `180000` | Close the idle socket after the page has been hidden this long. |
| `preconnect` | `true` | Add a `preconnect` hint for the API origin at mount. |

| `connect` | The socket connects |
| --- | --- |
| `"load"` | When the widget mounts. This opens a socket for every page view, including visitors who never chat. |
| `"open"` | When the widget opens: a launcher click, or at mount for an inline widget, which is always open. |
| `"focus"` | On launcher hover or focus, when the widget opens, or on focus in the composer. |
| `"input"` | On the visitor's first typed character. |
| A function | When your code calls `connect()`. It receives `{ connect, mount }`, runs at mount and again when `update()` passes a different function, and may return a cleanup. Errors it throws are ignored. |

A send always connects, whatever the trigger. The tab-visibility, idle-close
and bfcache rules above apply to every trigger.

The socket needs a client session. When you set `realtime` yourself (`true` or
an object), the connect trigger also starts the session if none exists yet, so
`connect: "load"` creates a session on every page view. When `realtime` is not
set, a trigger only connects a session that already exists, and
[`sessionInit`](../packages/widget/docs/CONFIGURATION-REFERENCE.md#session-init-timing) alone decides when one starts.
Either way only one session is created: whichever trigger fires first starts
it, and the other reuses it.

With `config.transport`, the trigger calls your transport's `warm(reason)`
instead and never starts a session. `"load"` passes `"open"` for an inline
widget and `"intent"` otherwise; `"input"` and a function pass `"intent"`.

## Demo pages

`apps/web` serves two demos that run against a Runtype API:

- `realtime-mpa.html` and `realtime-mpa-next.html`: a reply that keeps
  streaming across a full page navigation, and a page tool that navigates.
- `realtime-compare.html`: one prompt sent to a socket widget and an SSE widget
  at once, with per-turn transport, acknowledgement, first-content and done
  times measured from the send.

The pages read their target from build-time environment variables:

| Variable | Value |
| --- | --- |
| `VITE_RUNTYPE_REALTIME_CLIENT_TOKEN` | Client token for the realtime demo agent. |
| `VITE_RUNTYPE_REALTIME_AGENT_ID` | The realtime demo agent's id. |
| `VITE_RUNTYPE_API_URL` | API base URL. Optional; defaults to `https://api.runtype.com`. |

The `apiUrl`, `clientToken` and `agentId` query parameters override these
variables. On the dev server with no token variable set, the pages use the local
fake (`node e2e/fixtures/fake-runtype-server-cli.ts`). A production build with
neither the variables nor the parameters shows a "not configured" line instead
of a widget.

The agent and its client token are defined in code
(`apps/web/runtype/realtime-demo.agent.ts`). The agent runs every turn durably,
and the token enables durable turns, so turns are delivered over the socket. To
create both, do these steps once:

1. Run `RUNTYPE_API_KEY=... pnpm --filter web runtype:ensure`. Add
   `RUNTYPE_DRY_RUN=1` to print the plan without writing anything.
2. Copy the printed `VITE_RUNTYPE_REALTIME_AGENT_ID` and
   `VITE_RUNTYPE_REALTIME_CLIENT_TOKEN` into the web app's environment
   (`apps/web/.env.local` and the hosting environment). The script prints the
   token value only when it creates the token.

## Multi-page sites

On a site that loads a new document per page, the socket does not survive
navigation. The durable cursor does: with `persistState`, the next page reattaches
to the open turn from the last applied event, so no text is duplicated or lost.
See [Durable session reconnect](durable-reconnect.md#page-navigation-and-the-bfcache)
for page tools that navigate and for the bfcache.
