import { createServer, type IncomingMessage } from "node:http";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { createEchoPersonaHandler /*, openAiResponder */ } from "./lib/echo-adapter";

// The canonical adapter: a plain Web `(Request) => Promise<Response>`. To stream
// a real model, set OPENAI_API_KEY and swap in:
//   createEchoPersonaHandler({ respond: openAiResponder(process.env.OPENAI_API_KEY!) })
const dispatch = createEchoPersonaHandler();

// Resolve the local workspace widget build so the `<script>` installer and its
// sibling bundles are served with no CDN and no network.
const distDir = dirname(createRequire(import.meta.url).resolve("@runtypelabs/persona"));
const page = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  // The bridge. Bare Node uses the `(req, res)` callback style, NOT Web
  // `Request`/`Response`, so we buffer the body into a Web Request, call the
  // host-agnostic handler, then pump its Web Response stream back onto `res`.
  // (Hono and SvelteKit skip this: they already speak Web Request/Response.)
  if (req.method === "POST" && url.pathname === "/dispatch") {
    const webReq = new Request("http://localhost/dispatch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: await readBody(req),
    });
    const webRes = await dispatch(webReq);
    res.writeHead(webRes.status, Object.fromEntries(webRes.headers));

    const reader = webRes.body?.getReader();
    if (!reader) return void res.end();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
    return;
  }

  // Serve the widget's IIFE bundles. `install.global.js` lazy-loads its siblings
  // (`index.global.js`, `launcher.global.js`, `widget.css`) from the same path.
  if (url.pathname.startsWith("/persona/")) {
    try {
      const file = readFileSync(join(distDir, basename(url.pathname)));
      res.writeHead(200, { "content-type": contentTypeFor(url.pathname) });
      res.end(file);
    } catch {
      res.writeHead(404).end("not found");
    }
    return;
  }

  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page);
    return;
  }

  res.writeHead(404).end("not found");
});

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function contentTypeFor(pathname: string): string {
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

const port = Number(process.env.PORT ?? 3130);
server.listen(port, () => {
  console.log(`▶ echo-script-tag: http://localhost:${port}`);
});
