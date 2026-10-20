import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { brotliCompress, gzip, constants } from "node:zlib";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dist = resolve(process.env.PERSONA_DIST_DIR ?? `${root}/packages/widget/dist`);
const port = Number(process.env.PERSONA_PREVIEW_PORT ?? 5204);
const compressBr = promisify(brotliCompress), compressGzip = promisify(gzip);
const assets = new Map();
console.log(`Preparing Brotli and gzip assets from ${dist}…`);
// Compress before listening: compression CPU time must not pollute load timings.
for (const name of await readdir(dist)) {
  if (!/\.(js|css)$/.test(name)) continue;
  const identity = await readFile(resolve(dist, name));
  const [br, gz] = await Promise.all([
    compressBr(identity, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }),
    compressGzip(identity, { level: 9 }),
  ]);
  assets.set(name, { identity, br, gzip: gz });
}
for (const name of ["install.global.js", "launcher.global.js", "index.global.js", "widget.css"]) {
  if (!assets.has(name)) throw new Error(`Missing ${name}; run pnpm build:widget first.`);
}
const html = await readFile(new URL("./index.html", import.meta.url));
const fullscreen = await readFile(new URL("./fullscreen.html", import.meta.url));
// Give this preview its own asset URLs so an older open tab cannot reuse a stale build.
const activityPrefix = `/dist/activity-${Date.now()}/`;
const activity = (await readFile(new URL("./activity.html", import.meta.url), "utf8")).replaceAll("/dist/", activityPrefix);
const quality = (header, encoding) => {
  const entries = header.split(",").map(part => part.trim().split(";"));
  const match = entries.find(([name]) => name === encoding) ?? entries.find(([name]) => name === "*");
  if (!match) return 0;
  const q = match.slice(1).find(param => param.trim().startsWith("q="));
  return q ? Number(q.trim().slice(2)) : 1;
};
const event = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
const runtypeProxy = process.env.PERSONA_RUNTYPE_PROXY_URL ?? "http://127.0.0.1:43111";
const liveRoutes = new Map([
  ["/api/openai-responses/dispatch", {url: "http://127.0.0.1:5205/api/openai-responses/dispatch", help: "Start the OpenAI Next.js example on port 5205."}],
  ...["", "/resume"].map(suffix => [`/api/runtype/dispatch${suffix}`, {
    url: new URL(`/api/chat/dispatch-activity${suffix}`, runtypeProxy).href,
    help: "Start the Runtype Hono proxy with RUNTYPE_API_KEY (port 43111 by default).",
  }]),
]);
createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  // Keep the existing example adapter and its API key on the server. Stream
  // through unchanged so this preview exercises the same real provider phases.
  const liveRoute = liveRoutes.get(url.pathname);
  if (liveRoute && req.method === "POST") {
    if (!req.headers["content-type"]?.startsWith("application/json")) {
      res.writeHead(415).end("Expected application/json"); return;
    }
    const abort = new AbortController();
    res.on("close", () => abort.abort());
    try {
      const upstream = await fetch(liveRoute.url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: Readable.toWeb(req), duplex: "half", signal: abort.signal,
      });
      res.writeHead(upstream.status, {
        "Content-Type": upstream.headers.get("content-type") ?? "text/plain",
        "Cache-Control": "no-store",
      });
      if (upstream.body) await pipeline(Readable.fromWeb(upstream.body), res);
      else res.end();
    } catch {
      if (!res.destroyed) {
        if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" });
        res.end(`Live example unavailable. ${liveRoute.help}`);
      }
    }
    return;
  }
  if (url.pathname === "/api/chat" && req.method === "POST") {
    req.resume();
    const executionId = "preview", now = new Date().toISOString();
    const events = [
      ["execution_start", { kind: "agent", agentId: "preview", agentName: "Preview", maxTurns: 1, startedAt: now }],
      ["turn_start", { id: "turn", iteration: 1, role: "assistant" }],
      ["text_start", { id: "text", role: "assistant" }],
      ["text_delta", { id: "text", delta: "Replies are mocked. This response uses the local compressed widget build." }],
      ["text_complete", { id: "text" }],
      ["turn_complete", { id: "turn", iteration: 1, role: "assistant", completedAt: now }],
      ["execution_complete", { kind: "agent", success: true, completedAt: now }],
    ];
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
    res.end(events.map(([type, data], i) => event(type, { executionId, seq: i + 1, ...data })).join(""));
    return;
  }
  if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405).end(); return; }
  if (url.pathname === "/" || url.pathname === "/fullscreen" || url.pathname === "/activity") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : url.pathname === "/activity" ? activity : url.pathname === "/fullscreen" ? fullscreen : html);
    return;
  }
  const name = url.pathname.startsWith(activityPrefix) ? url.pathname.slice(activityPrefix.length)
    : url.pathname.startsWith("/dist/") ? url.pathname.slice(6) : "";
  const asset = assets.get(name);
  if (!asset) { res.writeHead(404).end("Not found"); return; }
  const accept = req.headers["accept-encoding"] ?? "";
  const br = quality(accept, "br"), gz = quality(accept, "gzip");
  const encoding = br > 0 && br >= gz ? "br" : gz > 0 ? "gzip" : "identity";
  const body = asset[encoding];
  res.writeHead(200, {
    "Content-Type": extname(name) === ".css" ? "text/css" : "text/javascript",
    ...(encoding === "identity" ? {} : { "Content-Encoding": encoding }),
    "Content-Length": body.length,
    "Cache-Control": "public, max-age=3600",
    "Vary": "Accept-Encoding",
    "Server-Timing": `encoding;desc="${encoding}"`,
  });
  res.end(req.method === "HEAD" ? undefined : body);
}).listen(port, "127.0.0.1", () => {
  console.log(`Compressed preview: http://localhost:${port}/ (${assets.size} assets, built files held in memory)`);
});
