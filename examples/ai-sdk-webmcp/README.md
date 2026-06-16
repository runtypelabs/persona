# ai-sdk-webmcp: Persona + WebMCP on a direct AI SDK backend

A Next.js port of the **Switchback** WebMCP storefront demo that drives the
**real Persona widget** against a **direct [Vercel AI SDK](https://ai-sdk.dev)
backend**: **no Runtype**.

**Live demo:** [ai-sdk-webmcp.persona-chat.dev](https://ai-sdk-webmcp.persona-chat.dev)

The storefront publishes its own page tools via WebMCP
(`document.modelContext.registerTool`). The Persona widget snapshots them each
turn, ships them as `clientTools[]`, and when the agent calls one the widget runs
it here on the page and posts the result back via `/resume`. The catalog, cart,
and wire log react live. The only difference from the hosted demo is what's
behind the widget: instead of Runtype, an AI SDK route handler running Claude.

## What this shows / what it costs

The Persona widget's WebMCP loop runs over **Persona's agent wire protocol** (an
`agent_await` SSE pause → `/resume` round-trip) — the neutral vocabulary any
backend can speak, not Runtype's flow-automation dialect. To keep the widget UI
while talking directly to the AI SDK, this example ships a **protocol shim**: two
route handlers that emit that agent protocol on top of `streamText`
(`app/api/chat/shim.ts`). The widget is unchanged and never learns it isn't
talking to a hosted agent runtime.

- **You keep:** the full Persona widget UI, WebMCP page-tool discovery,
  per-call approval gating, and parallel/multi-step tool calls.
- **You add:** the shim (`app/api/chat/shim.ts`). The dispatch pause and the
  later `/resume` are separate requests that can hit different serverless
  instances, so the in-flight conversation is held in a small store
  (`app/api/chat/execution-store.ts`) keyed by `executionId`: backed by the
  **Vercel Runtime Cache** (`@vercel/functions`), with an in-memory fallback for
  local dev. ⚠️ The Runtime Cache is an **ephemeral, region-scoped cache**: fine
  for a demo/preview, but **swap it for a durable store (Redis/Upstash, Vercel
  KV, a DB, or a Durable Object) in production**. The store interface is one tiny
  file so the backend is a one-place change.

> Prefer **not** to use the widget UI? You can instead reuse just
> `WebMcpBridge` from `@runtypelabs/persona` and drive the loop with the AI SDK's
> native client-tool model (`useChat` + `onToolCall`): no shim, no `/resume`.
> See `docs/webmcp-without-runtype.md` at the repo root.

## Run

Model calls route through the **Vercel AI Gateway** (the shim uses a bare
`nvidia/nemotron-3-ultra-550b-a55b` model id). On Vercel this authenticates
automatically via the deployment's OIDC token: **no key to set**. For local dev
you need an `AI_GATEWAY_API_KEY`:

```bash
# from the repo root: builds the workspace widget the example imports
pnpm --filter @runtypelabs/persona build

cp examples/ai-sdk-webmcp/.env.local.example examples/ai-sdk-webmcp/.env.local
# edit .env.local: set AI_GATEWAY_API_KEY=vck_...  (or run `vercel env pull`)

pnpm --filter ai-sdk-webmcp dev
# open http://localhost:3000
```

> Want to call Anthropic directly instead of through the gateway? Install
> `@ai-sdk/anthropic`, and in `app/api/chat/shim.ts` use
> `model: anthropic("claude-sonnet-4-6")` with `ANTHROPIC_API_KEY`.

## Try it

1. **Browse (read-only):** _"find a waterproof trail shoe under $170"_ →
   `search_products` auto-approves; matching cards light up.
2. **Inspect (read-only):** _"tell me about SHOE-005"_ → `view_product`; the card
   flashes.
3. **Parallel (the headline):** _"add SHOE-001 and SHOE-007 at the same time"_ →
   two `add_to_cart` calls in one turn, each with its own approval bubble, batched
   into a single `/resume`.
4. **Promo:** _"apply code TRAIL10 and show my cart total"_ → `apply_promo`,
   gated; the discount line appears.

## How it maps to the wire protocol

`app/lib/widget.ts` mounts the widget in **proxy mode** (`apiUrl:
"/api/chat/dispatch"`, no `clientToken`); resume is POSTed to `${apiUrl}/resume`.

| Widget expects (SSE `event`) | Shim emits from `streamText` |
| --- | --- |
| `agent_start` `{executionId, agentId}` | run start (dispatch only) |
| `agent_turn_delta` `{contentType:"text", delta}` | `text-delta` parts |
| `agent_await` `{toolName:"<bare>", origin:"webmcp", toolCallId, parameters, executionId}` | `tool-call` parts (paused: no `agent_complete`) |
| `agent_complete` `{executionId, success}` | end of a turn with no tool calls |
| POST `/resume` `{executionId, toolOutputs}` | tool-result message appended → `streamText` continues at `iteration + 1` |

One `exec_…` `executionId` is carried across the whole run — dispatch, every
`agent_await`, every `/resume`, and `agent_complete` — and `iteration` advances
on each resume.

## Deploy on Vercel

There's no Vercel project for this example in-repo: to get a PR preview, create
a Vercel project pointed at this subdirectory:

- **Root Directory:** `examples/ai-sdk-webmcp`
- **Build Command:** `pnpm --filter @runtypelabs/persona build && next build`
- **Env:** none required: model calls go through the AI Gateway, authenticated
  automatically by the deployment's OIDC token. (Locally you set
  `AI_GATEWAY_API_KEY`; on Vercel you don't.)

Notes that matter for the WebMCP tool loop:

- The paused-execution store uses the **Vercel Runtime Cache**, which is
  **region-scoped**. Keep the project on a **single function region** so the
  dispatch pause and the `/resume` that follows share the same cache. The cache
  is also **ephemeral**: a long delay before resuming (or an eviction) yields an
  "unknown executionId" error. Fine for a demo; use a durable store for prod
  (see `app/api/chat/execution-store.ts`).

## Files

- `app/lib/catalog.ts`: product catalog + search (ported verbatim).
- `app/lib/store.ts`: observable cart/highlight/wire store (React + tools share it).
- `app/lib/webmcp-tools.ts`: registers the 5 page tools on `document.modelContext`.
- `app/lib/widget.ts`: Switchback theme + widget config (proxy mode → local shim).
- `app/page.tsx`: storefront UI + widget mount.
- `app/api/chat/shim.ts`: the Runtype-proxy-protocol shim over the AI SDK.
- `app/api/chat/execution-store.ts`: paused-execution store (Runtime Cache; **swap for a durable store in prod**).
- `app/api/chat/dispatch/route.ts`, `.../resume/route.ts`: the two endpoints.
