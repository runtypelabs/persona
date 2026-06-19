# runtype-hono-proxy: Runtype API proxy on Hono

A **backend-only** Hono server that proxies Persona chat requests to **Runtype**. No frontend: just API routes. Your `RUNTYPE_API_KEY` stays on the server, never in the browser.

This is the Runtype counterpart to the BYO **[`echo-hono`](../echo-hono)** host-matrix example: same portable `app.fetch` pattern, but backed by `@runtypelabs/persona-proxy`. It powers root `pnpm dev` locally and the deployed proxy at `https://proxy.persona-chat.dev`.

## The whole integration

All routes live in **`src/app.ts`**. Host wrappers only differ in how they supply env and call `fetch`:

| Host | Entry | Dev command |
|------|-------|-------------|
| **Node** | `src/node.ts` | `pnpm dev` (port 43111) |
| **Vercel** | `api/index.ts` | deploy with root `examples/runtype-hono-proxy` |
| **Cloudflare Workers** | `src/worker.ts` | `pnpm dev:workers` (port 8787) |

```ts
// src/app.ts: shared by every host
export function createRuntypeProxyApp(env: ProxyEnv) { /* all routes */ }

// src/node.ts
const app = createRuntypeProxyApp(process.env);
serve({ fetch: app.fetch.bind(app), port });

// src/worker.ts
router.all("*", (c) => createRuntypeProxyApp(c.env).fetch(c.req.raw, c.env));
```

## Local development (Node)

From the repo root:

```bash
pnpm install
cp examples/runtype-hono-proxy/.env.example examples/runtype-hono-proxy/.env   # add RUNTYPE_API_KEY
pnpm dev   # starts this proxy + apps/web
```

Or from this directory: `pnpm dev` (after `pnpm install` at the root).

See [`.env.example`](./.env.example) for all supported variables.

## Cloudflare Workers

```bash
cp .dev.vars.example .dev.vars   # add RUNTYPE_API_KEY
pnpm dev:workers                 # http://localhost:8787
pnpm deploy:workers              # wrangler deploy
```

Set production secrets with `wrangler secret put RUNTYPE_API_KEY` (and optionally `ALLOWED_ORIGINS`).

## Deploying to Vercel

1. Import the project with root directory **`examples/runtype-hono-proxy`**
2. Set `RUNTYPE_API_KEY` on **Production, Preview, and Development** scopes
3. Optionally set `ALLOWED_ORIGINS`, `STRIPE_SECRET_KEY`, `FRONTEND_URL`, etc.

> **Preview CORS:** Vercel preview URLs are dynamic. The proxy reflects matching origins when `VERCEL_ENV === "preview"` or when the caller matches `PREVIEW_ORIGIN_PATTERN` (default `https://*.vercel.app`).

## Other Node hosts

Railway, Fly.io, or a plain Node server: run `pnpm build` then `node dist/node.js`, with the same env vars as `.env.example`.

## Key endpoints

| Endpoint | Description |
|----------|-------------|
| `/api/chat/dispatch` | Basic conversational assistant |
| `/api/chat/dispatch-directive` | Directive-enabled form demo |
| `/api/chat/dispatch-action` | Shopping assistant with JSON actions |
| `/api/chat/dispatch-metadata` | Metadata-based shopping assistant |
| `/api/chat/dispatch-*` | Demo-specific routes (WebMCP, bakery, theme copilot, …) |
| `/api/checkout` | Stripe checkout |
| `/api/tts` | OpenAI PCM streaming TTS (needs `OPENAI_API_KEY`) |
| `/form`, `/api/form` | Directive form handler |
| `/health` | Health check |

Full route list: [`src/app.ts`](./src/app.ts).

## Adding a demo route

Edit **`src/app.ts` only**. Node, Vercel, and Workers pick it up automatically. See [`CLAUDE.md`](../../CLAUDE.md) for the checklist (define flow in `packages/proxy`, mount in `app.ts`, rebuild proxy, point demo `apiUrl`).

## Shared package

Flow configs and helpers come from `@runtypelabs/persona-proxy` (`SHOPPING_ASSISTANT_FLOW`, `createCheckoutSession`, etc.).
