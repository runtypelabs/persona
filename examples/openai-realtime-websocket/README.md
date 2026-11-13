# Persona over the OpenAI Realtime WebSocket

The Persona widget with `createWebSocketTransport` and a codec for the
[OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime) in text
mode. The browser connects straight to the Realtime socket with an ephemeral
client secret; the real API key stays on the server.

## Run it

```bash
pnpm install
pnpm --filter @runtypelabs/persona build   # the example serves the local dist
cd examples/openai-realtime-websocket
OPENAI_API_KEY=sk-... pnpm start           # http://127.0.0.1:3140
```

Without `OPENAI_API_KEY` the server starts a fake Realtime server on the same
port that replies `You said: <text>`, so the page works offline.
`OPENAI_REALTIME_MODEL` overrides the model (default `gpt-realtime-2.1`; the
docs also list `gpt-realtime`, `gpt-realtime-1.5`, `gpt-realtime-2`, and
`gpt-realtime-2.1-mini`) and `PORT` the port.

## How it fits together

| File | Role |
| --- | --- |
| `src/mint.ts` | `POST https://api.openai.com/v1/realtime/client_secrets` with your key; returns the `ek_` secret, its expiry, and the socket URL. |
| `src/server.ts` | Serves the page, the codec, and the Persona build; `POST /session` mints a secret. Gate this route in a real app: each call spends your key. |
| `public/openai-realtime-codec.js` | The codec: `session.update` on open; each send becomes `conversation.item.create` + `response.create`; `response.output_text.delta` / `response.done` / `error` become Persona events. A detach sends `response.cancel`. |
| `public/index.html` | Loads the transport chunk (`AgentWidget.loadWebSocketTransport()`), builds the transport, passes it as `config.transport`. |
| `src/fake-openai.ts` | Offline stand-in for the Realtime socket, used by the tests and by `pnpm start` without a key. |

The socket authenticates with the subprotocols
`["realtime", "openai-insecure-api-key.<ek_ secret>"]`. That list comes from
OpenAI's voice-over-WebSocket guide; the API reference does not document it.
The page re-mints the secret when it is within a minute of expiry (`expires_at`,
Unix seconds), so a reconnect authenticates again.

OpenAI recommends WebRTC over WebSocket for browser clients, as it handles
unreliable networks better. This example uses a WebSocket because it
demonstrates `createWebSocketTransport`. For a production browser client,
evaluate WebRTC, or relay the socket through your own server.

## Limits

- Text only. The Realtime session is set to `output_modalities: ["text"]`.
- The conversation lives in the Realtime session. A reconnect starts a new
  session, so the model does not see earlier turns, and there is no cursor
  replay or durable resume.
- No tools: page tools (WebMCP) and approvals need Persona's `/resume`
  contract, which this backend does not have.

## Test

```bash
pnpm test   # against the fake server and a stubbed mint; needs the Persona dist build
pnpm lint   # tsc --noEmit, including the codec (checkJs)
```

The live OpenAI path is unverified: the tests and the browser check ran only
against the fake server. The request and event shapes follow the
`realtime-sessions` and `realtime-client-events` API reference pages, which were
read in part. The `error` event's shape was not confirmed, so the codec reads
`error.code` and `error.message` and falls back to defaults when either is missing.
