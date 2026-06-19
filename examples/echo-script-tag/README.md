# script-tag: Persona with a bare `<script>` tag

The zero-framework baseline. No React, no bundler, no build step on the page: the **real Persona
widget** is installed with a single `<script>` tag plus a `window.siteAgentConfig` object, served by
a bare **`node:http`** backend. The `POST /dispatch` route runs the canonical **echo agent** and
streams its reply as Persona's SSE event vocabulary.

This is the most honest "works anywhere" host in Persona's **host matrix**. The same adapter is
re-hosted four ways ([this one](.), [`echo-hono`](../echo-hono),
[`echo-express`](../echo-express),
[`echo-sveltekit`](../echo-sveltekit)). `src/lib/persona-wire.ts` and
`src/lib/echo-adapter.ts` are **byte-identical across all four**.

## Two things to look at

**The frontend:** a plain HTML page (`public/index.html`):

```html
<div id="persona-root"></div>
<script>
  window.siteAgentConfig = {
    target: "#persona-root",
    apiUrl: "/dispatch",
    launcher: { enabled: false },   // inline embed instead of a floating launcher
  };
</script>
<script src="/persona/install.global.js"></script>
```

**The bridge:** bare Node uses the `(req, res)` callback style, *not* Web `Request`/`Response`, so
`src/index.ts` buffers the request into a Web `Request`, calls the host-agnostic handler, then pumps
its Web `Response` stream back onto `res`:

```ts
const webRes = await dispatch(webReq);
res.writeHead(webRes.status, Object.fromEntries(webRes.headers));
const reader = webRes.body.getReader();
for (;;) { const { done, value } = await reader.read(); if (done) break; res.write(value); }
res.end();
```

That manual pump is exactly what Web-standard hosts ([Hono](../echo-hono),
[SvelteKit](../echo-sveltekit)) give you for free, and a close cousin of the Express
bridge in [`echo-express`](../echo-express).

## Run

```bash
pnpm install                       # from the repo root
pnpm --filter echo-script-tag build   # builds the widget bundles the page loads
pnpm --filter echo-script-tag dev
# open http://localhost:3130
```

No API key needed. The default agent echoes your message back, streamed word by word.

## Validate without a server

```bash
pnpm --filter echo-script-tag test
```

Same adapter test as every host in the matrix: it drives the `(Request) => Response` handler
directly and asserts a well-formed SSE run.

## Swap in a real model

`echo-adapter.ts` ships a dependency-free `openAiResponder` (raw `fetch`). Set `OPENAI_API_KEY` and
pass it to `createEchoPersonaHandler({ respond: openAiResponder(process.env.OPENAI_API_KEY!) })` in
`src/index.ts`. Or write your own `Responder` over any SDK. The wire never changes.
