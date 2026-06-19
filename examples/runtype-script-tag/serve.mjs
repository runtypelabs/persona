// A 20-line zero-dependency static file server. This example has no backend:
// the widget talks directly to api.runtype.com via the clientToken, so all we
// need is something to serve index.html from a real origin (Runtype clientTokens
// are scoped to an allowedOrigins list, so `file://` won't do).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, extname, normalize } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const server = createServer(async (req, res) => {
  const rel = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]));
  if (rel.includes("..")) return void res.writeHead(403).end("forbidden");
  const file = join(root, rel === "/" ? "index.html" : rel);
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

const port = Number(process.env.PORT ?? 3150);
server.listen(port, () => {
  console.log(`▶ runtype-script-tag: http://localhost:${port}`);
});
