# Persona + Cloudflare Agents: Relay support inbox

A support workspace with Persona's v5 defaults and a docked assistant, backed by a native [Cloudflare Agent](https://developers.cloudflare.com/agents/) Durable Object. Select a fictional ticket, investigate it, and draft a reply using three read-only tools.

This example uses the supported **`Agent.onRequest` HTTP/SSE API**. Persona consumes its own SSE vocabulary through a small adapter around AI SDK `streamText`. It does not implement `AIChatAgent`'s WebSocket chat protocol, and does not require a hosted Persona backend.

## Run locally, without credentials

From the monorepo root, with Node.js 24 and pnpm:

```sh
pnpm install
pnpm build:widget
pnpm --filter cloudflare-agents dev
```

Open **http://localhost:3400**. Preview is selected by default. The Cloudflare Vite plugin runs the Worker and its SQLite-backed Agent in local `workerd`; there is no Cloudflare account, model key, or external service call required for Preview.

Preview is deterministic, but exercises the real integration path:

1. The browser sends a Persona message to `/api/dispatch?mode=preview`.
2. The Worker validates the request and uses `getAgentByName` to select a `SupportAgent` Durable Object.
3. `SupportAgent.onRequest` starts AI SDK `streamText` with a local `LanguageModelV4` implementation.
4. The local model asks for `read_ticket`, `search_runbook`, and `check_service_status` in separate steps. AI SDK executes the actual tool functions and continues the model loop with their returned results.
5. The final answer uses those results. Investigation requests show the ticket, runbook steps, and service snapshot; reply requests use the runbook's customer-facing guidance and the selected customer. A labeled preview activity summary, tool states, and text stream through the same Persona adapter as Live.

The sample data is fictional. No reply is sent, ticket changed, refund issued, invitation resent, or live service checked. Switching tickets or modes and clearing the conversation creates a fresh browser conversation ID.

## Enable Live mode

Copy `.dev.vars.example` to `.dev.vars` in this directory and set `OPENAI_API_KEY`. Restart the development server. The workspace reads only `{ liveAvailable: boolean }` from `/api/config`; the key stays in the Worker environment.

Live uses `@ai-sdk/openai` with `OPENAI_MODEL` from `wrangler.jsonc` (default `gpt-5.5`). It runs the same three tools against the **same fictional sample data**. Live changes the model, not the ticket source or the read-only permissions. Availability means a server key is configured, not that the key or provider was health-checked. Missing credentials return HTTP 503; provider failures produce a redacted terminal error, never a silent Preview fallback.

## Project structure

- `src/server.ts`: `SupportAgent extends Agent`, durable state, Worker entry point, and `getAgentByName(...).fetch(...)` forwarding.
- `src/lib/routes.ts`: public API boundary and static asset routing.
- `src/lib/request.ts`: body, mode, ticket and UUID validation. Browser-authored system messages are discarded; the application owns the system prompt.
- `src/lib/assistant.ts`: real tools and the AI SDK → Persona SSE adapter.
- `src/lib/preview-model.ts`: deterministic streaming provider that requests tools and consumes their actual results.
- `src/lib/knowledge.ts`: sample runbooks and service-status snapshots.
- `src/shared/tickets.ts`: fictional tickets shared with the workspace.
- `src/client/`: product workspace and Persona mounting.
- `src/client/customer-transcript.ts`: a second, read-only Persona instance for the customer/support thread. Initial messages stay local; custom message renderers preserve human names, roles, avatars, and times. Layout slots keep the subject and note in the same scroll area. It has no API endpoint, composer, or message actions, and is destroyed when switching tickets.
- `src/lib/persona-wire.ts` and `tests/wire-testing.ts`: canonical vendored protocol helpers. Copy these alongside the adapter when reusing it.

The Worker exposes `/api/dispatch` and `/api/config`. It does not expose a general `/agents/*` router, RPC endpoint, or WebSocket endpoint. Agent instances are named by mode, ticket ID, and validated browser conversation UUID. `read_ticket` is closed over the selected server-side record, so model-generated arguments cannot select another ticket.

`SupportAgent` persists an accepted-request counter and the last ticket ID with `setState`. **Chat history is not stored in Agent state:** each request carries Persona's full visible user/assistant transcript, which is replayed to `streamText`. There is no server history hydration, resumable stream replay, or durable continuation of a disconnected model request. Client UUIDs separate local demo conversations; they are not authentication or authorization.

## Streaming contract

The adapter maps AI SDK text, genuine reasoning parts, tool-call/result/error events, and terminal errors into Persona frames. Tool IDs and results are preserved. Preview generates unique IDs per request so later messages cannot replace earlier tool rows. A stream is successful only when the model stops normally with final answer text; truncated or exhausted tool loops remain failures. Request abort and downstream reader cancellation propagate to the model through the canonical helper's combined abort signal.

Tools are fixed by the server; browser-supplied tool definitions and resume requests are unsupported. Tool errors are shown as failed calls with redacted messages. Provider response bodies, stack traces, and keys are never returned to the browser.

## Build, test, and inspect production locally

```sh
pnpm --filter cloudflare-agents test
pnpm --filter cloudflare-agents lint
pnpm --filter cloudflare-agents build
pnpm --filter cloudflare-agents preview
```

`vite build` generates static assets and the Worker deployment configuration. `vite preview` serves the built application in the local Cloudflare runtime. The Vite configuration uses both `agents/vite` and `@cloudflare/vite-plugin`; TypeScript extends `agents/tsconfig`. Wrangler binds `SupportAgent` and declares the required SQLite Durable Object migration.

## Deploy manually

Deployment is separate from local development and requires your Cloudflare account:

```sh
pnpm --filter cloudflare-agents exec wrangler login
pnpm --filter cloudflare-agents exec wrangler secret put OPENAI_API_KEY
pnpm --filter cloudflare-agents deploy
```

The deployment script builds before invoking Wrangler. Change the Worker name in `wrangler.jsonc` for your project. Keep `.dev.vars` out of version control and use Worker secrets in production. Before making Live mode public, add your application's authentication, ticket authorization, rate limits, and spending controls. The example intentionally supplies no production identity layer.

## Verified versions and API references

Current stable dependencies when implemented: Agents **0.28.1**, Cloudflare Vite plugin **1.64.0**, Wrangler **4.151.2**, AI SDK **7.0.143**, OpenAI provider **4.0.96**, Vite **8.3.4**, and TypeScript **7.0.2**.

- [Agents HTTP and Server-Sent Events](https://developers.cloudflare.com/agents/runtime/communication/http-sse/)
- [Agent routing and `getAgentByName`](https://developers.cloudflare.com/agents/runtime/communication/routing/)
- [Agents SDK repository](https://github.com/cloudflare/agents)
- [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/)
- [Vite static asset configuration](https://developers.cloudflare.com/workers/vite-plugin/reference/static-assets/)
- [AI SDK streaming and tool use](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
