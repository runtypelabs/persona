# sveltekit: Persona on SvelteKit

Mounts the **real Persona widget** in a **[SvelteKit](https://svelte.dev/docs/kit)** app. No
Runtype, no API key. The `POST /api/dispatch` route runs the canonical **echo agent** and streams
its reply as Persona's SSE event vocabulary, the same wire the Runtype API emits.

This is the **full-stack Web-standard** entry in Persona's **host matrix**. The same adapter is
re-hosted four ways ([`echo-script-tag`](../echo-script-tag),
[`echo-hono`](../echo-hono), [`echo-express`](../echo-express),
[this one](.)). `src/lib/persona-wire.ts` and `src/lib/echo-adapter.ts` are **byte-identical across
all four**.

## The entire backend

```ts
// src/routes/api/dispatch/+server.ts
const dispatch = createEchoPersonaHandler();           // a Web (Request) => Response

export const POST: RequestHandler = ({ request }) => dispatch(request);
```

SvelteKit hands you a Web `Request` and accepts a Web `Response`, so the route is one line: the same
as [Hono](../echo-hono), and the opposite end of the spectrum from
[`echo-express`](../echo-express), where the `(req, res)` callback style forces
a hand-written bridge.

The frontend mounts the widget from the npm package in `onMount` (client-only, `ssr = false`):

```svelte
<!-- src/routes/+page.svelte -->
onMount(() => {
  const handle = createAgentExperience(host, { apiUrl: "/api/dispatch", launcher: { enabled: false } });
  return () => handle?.destroy();
});
```

## Run

```bash
pnpm install                       # from the repo root
pnpm --filter echo-sveltekit build   # builds the widget the page imports
pnpm --filter echo-sveltekit dev
# open http://localhost:3140
```

No API key needed. The default agent echoes your message back, streamed word by word.

## Validate without a server

```bash
pnpm --filter echo-sveltekit test
```

Same adapter test as every host in the matrix: it drives the `(Request) => Response` handler
directly, with no SvelteKit and no port. It asserts a well-formed SSE run.

## Swap in a real model

`echo-adapter.ts` ships a dependency-free `openAiResponder` (raw `fetch`). Set `OPENAI_API_KEY` and
pass it to `createEchoPersonaHandler({ respond: openAiResponder(process.env.OPENAI_API_KEY!) })` in
`src/routes/api/dispatch/+server.ts`. Or write your own `Responder` over any SDK. The wire never
changes.
