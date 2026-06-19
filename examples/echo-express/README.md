# express: Persona on Express

Mounts the **real Persona widget** against an **[Express](https://expressjs.com)** server. No
Runtype, no API key. The `POST /dispatch` route runs the canonical **echo agent** and streams its
reply as Persona's SSE event vocabulary, the same wire the Runtype API emits.

This is the **callback-host** entry in Persona's **host matrix**. The same adapter is re-hosted four
ways ([`echo-script-tag`](../echo-script-tag), [`echo-hono`](../echo-hono),
[this one](.), [`echo-sveltekit`](../echo-sveltekit)). `src/lib/persona-wire.ts`
and `src/lib/echo-adapter.ts` are **byte-identical across all four**.

## The one host that needs a real bridge

Express predates the Web `Request`/`Response` standard. Its handlers are `(req, res)` callbacks. So
unlike Hono and SvelteKit (which return the adapter's `Response` directly), Express has to bridge:

```ts
app.post("/dispatch", async (req, res) => {
  const webReq = new Request("http://localhost/dispatch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req.body ?? {}),
  });

  const webRes = await dispatch(webReq);                          // host-agnostic handler
  res.status(webRes.status);
  webRes.headers.forEach((v, k) => res.setHeader(k, v));
  Readable.fromWeb(webRes.body).pipe(res);                        // ← the bridge
});
```

`Readable.fromWeb(...).pipe(res)` is the Node-stream adapter for a Web `ReadableStream`. That extra
step is the whole difference between a callback host and a Web-standard one. The adapter and the
wire are otherwise unchanged. (See [`echo-script-tag`](../echo-script-tag) for the same
bridge written by hand with a `getReader()` loop.)

## Run

```bash
pnpm install                       # from the repo root
pnpm --filter echo-express build   # builds the widget so the page can mount it offline
pnpm --filter echo-express dev
# open http://localhost:3120
```

No API key needed. The default agent echoes your message back, streamed word by word.

## Validate without a server

```bash
pnpm --filter echo-express test
```

Same adapter test as every host in the matrix: it drives the `(Request) => Response` handler
directly, with no Express and no port. It asserts a well-formed SSE run.

## Swap in a real model

`echo-adapter.ts` ships a dependency-free `openAiResponder` (raw `fetch`). Set `OPENAI_API_KEY` and
pass it to `createEchoPersonaHandler({ respond: openAiResponder(process.env.OPENAI_API_KEY!) })` in
`src/index.ts`. Or write your own `Responder` over any SDK. The wire never changes.
