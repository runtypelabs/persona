# runtype: Persona with a hosted backend (no backend code)

Every other example in this repo has you write and host a small adapter. That's the whole point of
the [host matrix](../echo-hono) (it shows the work each framework needs). **This one has no backend at
all.** A browser-safe `clientToken` lets the widget talk **directly** to the Runtype API, which runs
your agent or flow. So there's no `/dispatch` route, no adapter, and no server logic: just a static
page.

It's the honest counterpart to [`echo-script-tag`](../echo-script-tag): the same `<script>` install, the same
inline mount. **The only meaningful difference is one config line:**

```diff
  window.siteAgentConfig = {
    target: "#persona-root",
-   apiUrl: "/dispatch",        // script-tag: your own backend
+   clientToken: "ct_live_…",   // runtype: no backend, straight to api.runtype.com
    launcher: { enabled: false },
  };
```

One has a server to run; one doesn't. That's the trade, laid out plainly. Pick whichever fits.

> Unlike the backend examples (which serve the local workspace build), this loads the **published**
> widget from the jsDelivr CDN: the real-world drop-in embed.

## Get a clientToken

A `clientToken` is browser-safe: it's scoped server-side to a single flow/agent and to the origins
allowed to embed it. Mint one with the Runtype CLI, the same command shown on
[persona-chat.dev](https://persona-chat.dev):

```bash
npx @runtypelabs/cli@latest persona init
```

Or grab one from the **Runtype Dashboard**. When you create it, set its **allowed origins** to wherever
you'll serve this page. For local dev that's `http://localhost:3150`.

## Run

```bash
# 1. paste your token into index.html, replacing ct_live_REPLACE_ME
# 2. serve the folder from an allowed origin
pnpm --filter runtype-script-tag dev
# open http://localhost:3150
```

(There's nothing to build or install: `dev` is a 20-line zero-dependency static file server. You
could serve `index.html` with any static host instead.)

## What this shows (and doesn't)

This is the fastest path to a working Persona chat: no adapter, no streaming glue, no key in the
browser beyond the scoped `clientToken`. Runtype handles the agent loop, tools, streaming, and ops.

To instead run your **own** backend and keep full control of the model and infrastructure, see the
[host matrix](../echo-hono) and the SDK adapter examples ([`eve-next`](../eve-next), [`langgraph-next`](../langgraph-next),
[`openai-agents-next`](../openai-agents-next), [`ai-sdk-next`](../ai-sdk-next)). The widget is identical either way. Only
where the bytes come from changes.
