import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createEchoPersonaHandler /*, openAiResponder */ } from "./lib/echo-adapter";
import { PAGE } from "./page";

// The canonical adapter: a plain Web `(Request) => Promise<Response>`. To stream
// a real model instead of the echo, set OPENAI_API_KEY and swap in:
//   createEchoPersonaHandler({ respond: openAiResponder(process.env.OPENAI_API_KEY!) })
const dispatch = createEchoPersonaHandler();

// Resolve the local workspace widget build so the demo page mounts with no CDN
// and no network. `@runtypelabs/persona`'s main entry lives in `dist/`, so its
// directory is where the IIFE build sits too.
const distDir = dirname(createRequire(import.meta.url).resolve("@runtypelabs/persona"));
const widgetGlobalJs = readFileSync(join(distDir, "index.global.js"), "utf8");

const app = new Hono();

// The whole point of the matrix: mount the SAME handler with one line. Hono
// hands us the underlying Web Request via `c.req.raw`, and the adapter returns a
// Web Response. No host-specific streaming glue needed.
app.post("/dispatch", (c) => dispatch(c.req.raw));

// Serve the widget's self-contained IIFE build for the `<script>` tag in page.ts.
app.get("/persona/index.global.js", (c) =>
  c.body(widgetGlobalJs, 200, { "content-type": "text/javascript; charset=utf-8" }),
);

app.get("/", (c) => c.html(PAGE));

const port = Number(process.env.PORT ?? 3110);
serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`▶ echo-hono: http://localhost:${port}`);
});
