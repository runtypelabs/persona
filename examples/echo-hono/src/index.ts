import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
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
const app = new Hono();

// The whole point of the matrix: mount the SAME handler with one line. Hono
// hands us the underlying Web Request via `c.req.raw`, and the adapter returns a
// Web Response. No host-specific streaming glue needed.
app.post("/dispatch", (c) => dispatch(c.req.raw));

// Serve the IIFE and any sibling runtime chunks it imports. `basename` keeps
// the route inside the package dist directory.
app.get("/persona/:asset", (c) => {
  try {
    const asset = readFileSync(join(distDir, basename(c.req.param("asset"))));
    return c.body(asset, 200, { "content-type": contentTypeFor(c.req.path) });
  } catch {
    return c.text("not found", 404);
  }
});

app.get("/", (c) => c.html(PAGE));

function contentTypeFor(pathname: string): string {
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

const port = Number(process.env.PORT ?? 3110);
serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`▶ echo-hono: http://localhost:${port}`);
});
