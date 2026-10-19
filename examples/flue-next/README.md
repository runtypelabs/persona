# Persona + Flue: Orbit release room

A release workspace with Persona's **v5 defaults** and a persistent **composer bar**. Ask a question from the bottom of the page; the bar expands into a conversation above it. Minimize the conversation to return to the release. Change releases, filter changes, or ask about an individual change.

The assistant connects to [Flue](https://flueframework.com/), the agent framework from `withastro/flue`, through its official `@flue/sdk`. The included Flue service uses `@flue/runtime` and two read-only tools. No Persona proxy or hosted account is required.

## Run the keyless preview

From the repository root, with Node.js 24 and pnpm installed:

```sh
pnpm install
pnpm build:widget
pnpm --filter flue-next dev
```

Open **http://localhost:3300**. Preview is selected by default and requires no credentials. It produces deterministic release reviews and release-note drafts from the sample workspace. A labeled preview activity summary, two tool results and streamed answer pass through the **same materialized-conversation projector** as Live mode. Preview is clearly labeled; it does not run a model or call Flue.

## Run the live Flue service

1. Copy `.env.example` to `.env.local` in this directory. Set `FLUE_TOKEN` to a long random secret; keep `FLUE_AGENT_URL=http://127.0.0.1:3301/agents/releases`.
2. Create `agent/.env` with the **same** `FLUE_TOKEN`, a valid `OPENAI_API_KEY`, and optionally `FLUE_MODEL` (defaults to `openai/gpt-5.5`). Provider credentials belong to the Flue process; Next only needs the URL and bearer token.
3. Run both processes in separate terminals from the repository root:

```sh
pnpm --filter flue-next dev:agent
pnpm --filter flue-next dev
```

Choose **Live** in the workspace. It becomes available when Next has its URL and token; availability does not imply the service or provider credentials were health-checked. A failed live request shows an error and never silently falls back to Preview.

`agent/src/agents/release-assistant.ts` is a real Flue agent, registered with `"use agent"`, `useModel`, and `useTool`. `inspect_release` reads readiness checks; `read_changes` reads release changes. Both return the same sample data shown in the UI. The agent can review and draft; it cannot approve, publish, or mutate a release. Configure your own tools to connect a real product.

The service mounts `createAgentRouter(ReleaseAssistant)` at `/agents/releases` in `agent/src/app.ts`. Bearer authentication guards every agent route, including history, streams and abort. The service refuses requests if `FLUE_TOKEN` is missing. Development binds to loopback.

## Adapter contract

`app/api/flue/dispatch/route.ts` validates the request, reads the latest user message and current release, and constructs one `createFlueClient` per conversation URL. An HttpOnly, signed cookie selects an opaque browser session. The frontend creates a UUID for each conversation and regenerates it on Clear chat, release/mode changes, or reload. The route validates that UUID and derives an upstream identifier from the signed session, selected release, and UUID using HMAC. This keeps visible conversation resets aligned with fresh Flue history. The client cannot supply an upstream URL or arbitrary Flue conversation ID. This example does not implement history hydration.

`app/lib/flue-adapter.ts` uses the supported `send`, `observe`, `read` and `history` APIs:

1. `send` admits the new user message.
2. `observe({ live: "sse" })` exposes materialized messages and parts. Only visible assistant parts belonging to that submission are projected.
3. Appended `text` becomes Persona text deltas; repeated snapshots are deduplicated. `dynamic-tool` input/result/error states become matching tool lifecycle frames, preserving IDs and failure status. Actual Flue `reasoning` parts project into separate reasoning lifecycle frames, including completion and reconnect deduplication. Hidden messages, files, and named data parts are intentionally not rendered by this minimal adapter.
4. `read` waits for settlement; a final `history` snapshot flushes any late tools or text. For a submission coalesced into a busy response, `read` supplies a text fallback; coalesced tool replay is not implemented.
5. The observer closes on completion or failure. Upstream failures become a redacted Persona terminal error.

The adapter consumes materialized Flue state, **not** its explicitly unstable raw `ConversationStreamChunk` protocol. It expects text blocks to grow by appending, as ordinary streamed model output does. It cannot represent replacement edits to an already emitted text block.

Aborting the HTTP request or canceling the response reader stops local observation but **does not abort durable Flue work**. The SDK exposes `abort()` for applications that want to stop all in-flight and queued work for a conversation. This example does not expose that broad action as the widget's stop button. Preview requests do not persist conversation state.

`persona-wire.ts` and `tests/wire-testing.ts` are the repository's canonical vendored, zero-dependency protocol helpers. Copy them with the adapter when embedding it elsewhere.

## Build and test

```sh
pnpm --filter flue-next test
pnpm --filter flue-next lint
pnpm --filter flue-next build
pnpm --filter flue-next build:agent
```

Run the production web app with `pnpm --filter flue-next start`. Run the built Flue service with `PORT=3301 pnpm --filter flue-next start:agent`, supplying provider credentials and `FLUE_TOKEN` in its process environment. Production builds do not embed `.env` credentials. Flue's default production database is in memory; configure a durable database for conversations that must survive restarts.

This is a local integration example. Before exposing the Next route publicly, add your application's user authentication, authorization, request limits and abuse controls. The signed demo session selects a conversation; it does not authenticate a user. Configure durable storage and appropriate runtime request duration for long agent turns.

## Verified API references

The example pins `@flue/sdk`, `@flue/runtime` and `@flue/vite` to **2.3.0**, the registry's latest stable versions when implemented. It uses Next 16.4, React 19.3, TypeScript 7 and Vite 8.3.

- [Flue Agent SDK overview](https://flueframework.com/docs/sdk/overview/)
- [FlueClient methods and materialized conversation types](https://flueframework.com/docs/sdk/flue-client/)
- [Flue events and stable application surface](https://flueframework.com/docs/sdk/events/)
- [Building agents](https://flueframework.com/docs/guide/building-agents/)
- [Tool definitions and result envelopes](https://flueframework.com/docs/guide/tools/)
- [Routing and authentication](https://flueframework.com/docs/guide/routing/)
- [Node.js service setup and deployment](https://flueframework.com/docs/ecosystem/deploy/node/)
