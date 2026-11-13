import { createServer, type IncomingMessage, type Server } from "node:http";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { createFakeOpenAIRealtime, FAKE_PATH } from "./fake-openai";
import { DEFAULT_MODEL, mintClientSecret, type RealtimeSession } from "./mint";

const INSTRUCTIONS = "You are a concise assistant embedded in a website chat widget. Answer in plain text.";

/**
 * The example's whole backend: the page, the codec, the local Persona build,
 * and `POST /session`, which mints an ephemeral OpenAI client secret. With no
 * `apiKey` it mints fake secrets for the bundled fake Realtime server instead.
 */
export async function startServer(options: { port?: number; apiKey?: string; model?: string } = {}) {
  const distDir = dirname(createRequire(import.meta.url).resolve("@runtypelabs/persona"));
  const publicDir = new URL("../public/", import.meta.url);
  const fakeSecrets = new Set<string>();
  const fake = options.apiKey
    ? null
    : createFakeOpenAIRealtime({ isValidSecret: (secret) => fakeSecrets.has(secret) });

  const mint = async (host: string): Promise<RealtimeSession> => {
    if (options.apiKey) {
      return mintClientSecret({ apiKey: options.apiKey, model: options.model ?? DEFAULT_MODEL, instructions: INSTRUCTIONS });
    }
    const value = `ek_fake_${randomUUID()}`;
    fakeSecrets.add(value);
    return { value, expiresAt: Math.floor(Date.now() / 1000) + 600, url: `ws://${host}${FAKE_PATH}?model=fake` };
  };

  const server: Server = createServer(async (req: IncomingMessage, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "POST" && url.pathname === "/session") {
        // Gate this route in a real app (your own auth, rate limits): every call spends your key.
        const session = await mint(req.headers.host ?? "localhost");
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(session));
        return;
      }
      if (url.pathname === "/" || url.pathname === "/openai-realtime-codec.js") {
        const file = url.pathname === "/" ? "index.html" : "openai-realtime-codec.js";
        res.writeHead(200, { "content-type": contentTypeFor(file) });
        res.end(readFileSync(new URL(file, publicDir)));
        return;
      }
      if (url.pathname.startsWith("/persona/")) {
        res.writeHead(200, { "content-type": contentTypeFor(url.pathname) });
        res.end(readFileSync(join(distDir, basename(url.pathname))));
        return;
      }
      res.writeHead(404).end("not found");
    } catch (error) {
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
      res.end(error instanceof Error ? error.message : String(error));
    }
  });
  server.on("upgrade", (req, socket, head) => {
    if (!fake?.handleUpgrade(req, socket, head)) socket.destroy();
  });
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    fake: !options.apiKey,
    async close() {
      fake?.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function contentTypeFor(pathname: string): string {
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}
