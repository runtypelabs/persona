import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import express from "express";
import { createEchoPersonaHandler /*, openAiResponder */ } from "./lib/echo-adapter";
import { PAGE } from "./page";

// The canonical adapter: a plain Web `(Request) => Promise<Response>`. To stream
// a real model, set OPENAI_API_KEY and swap in:
//   createEchoPersonaHandler({ respond: openAiResponder(process.env.OPENAI_API_KEY!) })
const dispatch = createEchoPersonaHandler();

// Resolve the local workspace widget build so the page mounts with no network.
const distDir = dirname(createRequire(import.meta.url).resolve("@runtypelabs/persona"));
const widgetGlobalJs = readFileSync(join(distDir, "index.global.js"), "utf8");

const app = express();
app.use(express.json());

// The bridge. Express is callback-style (req, res), NOT Web Request/Response, so
// we wrap the parsed body into a Web Request, call the host-agnostic handler, and
// pipe its Web Response stream to `res`. (Hono and SvelteKit return the Response
// directly. No bridge needed.)
app.post("/dispatch", async (req, res) => {
  const webReq = new Request("http://localhost/dispatch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req.body ?? {}),
  });

  const webRes = await dispatch(webReq);
  res.status(webRes.status);
  webRes.headers.forEach((value, key) => res.setHeader(key, value));

  if (webRes.body) {
    Readable.fromWeb(webRes.body as NodeWebReadableStream<Uint8Array>).pipe(res);
  } else {
    res.end();
  }
});

// Serve the widget's self-contained IIFE build for the `<script>` tag in page.ts.
app.get("/persona/index.global.js", (_req, res) => {
  res.type("text/javascript").send(widgetGlobalJs);
});

app.get("/", (_req, res) => {
  res.type("html").send(PAGE);
});

const port = Number(process.env.PORT ?? 3120);
app.listen(port, () => {
  console.log(`▶ echo-express: http://localhost:${port}`);
});
