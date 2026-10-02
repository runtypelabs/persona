/**
 * Local host for the live GPT-Live harness: core's REAL browser handler
 * (`createOpenAILiveBrowserEngineHandler` from a core checkout, so
 * VoiceCallEngine + the GPT-Live session over Vercel AI Gateway) behind
 * `/ws/agents/:agentId/voice`. It follows core's `examples/gpt-live-demo`
 * host, minus that demo's origin and protocol pins, and passes
 * `clientDelegation` through exactly as core's route does.
 *
 * Without core's route it skips the database, auth, Flagship and agent voice
 * config. Run the harness against a deployed core (LIVE_VOICE_HOST) to cover
 * those.
 *
 * It also serves a deterministic `/v1/client/*` chat agent (init + chat SSE)
 * for LIVE_API=local, so the voice path can run with no staging credentials.
 *
 *   CORE_DIR=<core checkout on the client-delegation branch> \
 *     <core>/node_modules/.bin/tsx e2e/live/gpt-live-host.mts
 *
 * Needs `pnpm --filter @runtypelabs/runtime build:internal` in CORE_DIR, and
 * AI_GATEWAY_API_KEY (or PLATFORM_VERCEL_GATEWAY_KEY from core's apps/api/.dev.vars,
 * read the same way the core demo reads it; CORE_DEV_VARS points elsewhere, e.g.
 * the main checkout's file when CORE_DIR is a fresh worktree). Never logged.
 *
 * GET /frames returns every frame of every call (binary as byte counts) for
 * the spec to assert on. POST /frames/reset clears them.
 *
 * Binds 127.0.0.1 only, and answers only the harness page's origin
 * (http://127.0.0.1:$E2E_PORT, default 4317; LIVE_ALLOWED_ORIGINS overrides,
 * comma-separated). Other origins get 403 on every route and WebSocket; the
 * frame log also accepts Origin-less local tooling such as curl.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { pathToFileURL } from "node:url";
import WebSocket, { WebSocketServer } from "ws";

const CORE_DIR = process.env.CORE_DIR;
if (!CORE_DIR) throw new Error("Set CORE_DIR to a core checkout (feat/gpt-live-client-delegation).");
const PORT = Number(process.env.LIVE_HOST_PORT ?? 4399);
/** Delay before the local chat agent answers, to mimic a real agent turn. */
const CHAT_DELAY_MS = Number(process.env.LIVE_CHAT_DELAY_MS ?? 0);

async function gatewayKey(): Promise<string> {
  let local: Record<string, string | undefined> = {};
  try {
    local = parseEnv(await readFile(process.env.CORE_DEV_VARS ?? `${CORE_DIR}/apps/api/.dev.vars`, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const key =
    process.env.AI_GATEWAY_API_KEY ||
    process.env.VERCEL_AI_GATEWAY_API_KEY ||
    local.PLATFORM_VERCEL_GATEWAY_KEY;
  if (!key) throw new Error("No Vercel AI Gateway key (AI_GATEWAY_API_KEY or core .dev.vars).");
  return key;
}

const key = await gatewayKey();
const { createOpenAILiveBrowserEngineHandler } = (await import(
  pathToFileURL(`${CORE_DIR}/apps/api/src/services/voice-openai-live-browser-handler.ts`).href
)) as {
  // Core's signature (apps/api/src/services/voice-openai-live-browser-handler.ts);
  // typed loosely here because the module lives in another repo.
  createOpenAILiveBrowserEngineHandler: (...args: any[]) => {
    onMessage(event: { data: unknown }, ws: unknown): Promise<void>;
    onClose(): void;
    onError(event: unknown): void;
  };
};

// GPT-Live session instructions, built the way core's route builds them from the
// agent row (name, description, enabled tool names). Without an identity the
// generic default leaves "what are your opening hours?" reading as "when are
// YOU available", and GPT-Live answers it itself ("I'm available 24/7") instead
// of delegating: 6 of 10 live runs did so with no context frame.
const { buildOpenAILiveInstructions } = (await import(
  pathToFileURL(`${CORE_DIR}/packages/runtime/dist/internal/voice/call.mjs`).href
)) as { buildOpenAILiveInstructions(source: Record<string, unknown>): string };
// LIVE_AGENT_IDENTITY=generic passes no instructions (core's generic default), to
// measure delegation for agents with no name or description.
const GENERIC_IDENTITY = process.env.LIVE_AGENT_IDENTITY === "generic";
const INSTRUCTIONS = GENERIC_IDENTITY ? undefined : buildOpenAILiveInstructions({
  name: process.env.LIVE_AGENT_NAME ?? "Juniper Bakery",
  description:
    process.env.LIVE_AGENT_DESCRIPTION ??
    "Juniper Bakery is a neighborhood bakery; the backend agent knows its opening hours, location, and menu.",
  toolNames: ["get_opening_hours"],
});

// ---- The deterministic chat agent (LIVE_API=local) ---------------------------

const HOURS_MARKDOWN =
  "**Opening hours**\n\n- Monday to Friday: 8am to 6pm\n- Saturday: 9am to 4pm\n- Sunday: closed";

function sse(events: Array<[string, Record<string, unknown>]>): string {
  const executionId = `exec_${Date.now()}`;
  return events
    .map(([type, data], i) => `event: ${type}\ndata: ${JSON.stringify({ type, executionId, seq: i + 1, ...data })}\n\n`)
    .join("");
}

function chatAnswer(userText: string): string {
  const now = new Date().toISOString();
  const hours = /hour|open|close/i.test(userText);
  const text = hours ? HOURS_MARKDOWN : `You said: ${userText}`;
  return sse([
    ["execution_start", { kind: "agent", agentId: "agent_live", agentName: "Live", maxTurns: 2, startedAt: now }],
    ["turn_start", { id: "turn_1", iteration: 1, role: "assistant" }],
    ...(hours
      ? ([
          ["tool_start", { toolCallId: "call_hours", toolName: "get_opening_hours", toolType: "custom", parameters: {}, iteration: 1 }],
          ["tool_complete", { toolCallId: "call_hours", success: true, result: { weekdays: "8-18", saturday: "9-16", sunday: null } }],
        ] as Array<[string, Record<string, unknown>]>)
      : []),
    ["text_start", { id: "text_1", role: "assistant" }],
    ["text_delta", { id: "text_1", delta: text }],
    ["text_complete", { id: "text_1" }],
    ["turn_complete", { id: "turn_1", iteration: 1, role: "assistant", stopReason: "end_turn", completedAt: now }],
    ["execution_complete", { kind: "agent", success: true, completedAt: now }],
  ]);
}

// ---- Frame log ----------------------------------------------------------------

type LoggedFrame = { at: number; dir: "in" | "out"; json?: unknown; bytes?: number };
type AudioCount = { frames: number; bytes: number };
type UpstreamEvent = {
  at: number;
  type: string;
  /** Consecutive events of the same type (audio deltas) collapse into one entry. */
  count?: number;
  delegation?: { id?: unknown; target?: unknown };
};
type LoggedCall = {
  url: string;
  /** Every GPT-Live upstream event: type + time only (delegation id/target kept; no content). */
  upstream: UpstreamEvent[];
  protocols: string[];
  frames: LoggedFrame[];
  audio: { in: AudioCount; out: AudioCount };
  closedCode?: number;
};
const calls: LoggedCall[] = [];
const chats: unknown[] = [];

// SAFETY: the host records chat bodies and voice frames, so only the harness page
// may talk to it: any other page open in the browser gets a 403, not the log.
const ALLOWED_ORIGINS = new Set(
  (process.env.LIVE_ALLOWED_ORIGINS ?? `http://127.0.0.1:${process.env.E2E_PORT ?? 4317}`)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const originAllowed = (origin: string | undefined) => origin !== undefined && ALLOWED_ORIGINS.has(origin);

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  // Browsers always send Origin cross-origin; only local tooling (curl, the
  // spec's node side) may omit it, and only for the frame log.
  const isFrameLog = url.pathname === "/frames" || url.pathname === "/frames/reset";
  if (!(originAllowed(origin) || (isFrameLog && origin === undefined))) {
    return void res.writeHead(403).end();
  }
  res.setHeader("Vary", "Origin");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader(
      "Access-Control-Allow-Headers",
      String(req.headers["access-control-request-headers"] ?? "authorization, content-type"),
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Expose-Headers", "X-History-Identity-Status");
  }
  if (req.method === "OPTIONS") return void res.writeHead(204).end();
  let body = "";
  for await (const chunk of req) body += chunk;

  if (url.pathname === "/frames" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return void res.end(JSON.stringify({ calls, chats }));
  }
  if (url.pathname === "/frames/reset") {
    calls.length = 0;
    chats.length = 0;
    return void res.writeHead(204).end();
  }
  if (url.pathname.endsWith("/voice/prewarm")) return void res.writeHead(204).end();
  if (url.pathname.endsWith("/v1/client/init")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return void res.end(
      JSON.stringify({
        sessionId: `sess_${Date.now()}`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        flow: { id: "flow_live", name: "Live", description: null },
        conversationId: "conv_live",
        config: { welcomeMessage: null, placeholder: "Ask...", theme: null },
      }),
    );
  }
  if (url.pathname.endsWith("/v1/client/chat")) {
    const parsed = JSON.parse(body || "{}") as { messages?: Array<{ role: string; content: unknown }> };
    chats.push(parsed);
    const last = [...(parsed.messages ?? [])].reverse().find((m) => m.role === "user");
    if (CHAT_DELAY_MS > 0) await new Promise((resolve) => setTimeout(resolve, CHAT_DELAY_MS));
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    return void res.end(chatAnswer(typeof last?.content === "string" ? last.content : JSON.stringify(last?.content ?? "")));
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 1_048_576,
  handleProtocols: (protocols) => (protocols.has("runtype.bearer") ? "runtype.bearer" : false),
});

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
  const match = /^\/ws\/agents\/([^/]+)\/voice$/.exec(url.pathname);
  const protocols = String(request.headers["sec-websocket-protocol"] ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  // WebSockets bypass CORS: refuse any page but the harness outright.
  if (!originAllowed(request.headers.origin)) {
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return;
  }
  // Same GPT-Live admission rules core's route applies before the handler.
  if (!match || !protocols.includes("runtype.bearer") || url.searchParams.get("voiceCapabilities") !== "full-duplex-v1") {
    socket.end("HTTP/1.1 422 Unprocessable Entity\r\nConnection: close\r\n\r\n");
    return;
  }
  const capabilities = new Set(
    (url.searchParams.get("clientCapabilities") ?? "").split(",").map((c) => c.trim()).filter(Boolean),
  );
  wss.handleUpgrade(request, socket, head, (browser) => {
    const logged: LoggedCall = { url: url.pathname + url.search, protocols: protocols.filter((p) => p.startsWith("runtype.")), frames: [], upstream: [], audio: { in: { frames: 0, bytes: 0 }, out: { frames: 0, bytes: 0 } } };
    calls.push(logged);
    const log = (dir: "in" | "out", data: unknown) => {
      if (typeof data === "string") {
        try {
          logged.frames.push({ at: Date.now(), dir, json: JSON.parse(data) });
        } catch {
          logged.frames.push({ at: Date.now(), dir, json: data });
        }
      } else {
        const bytes = data instanceof ArrayBuffer ? data.byteLength : (data as Uint8Array).byteLength;
        // Audio is high-volume: count every binary frame, log every 50th.
        logged.audio[dir].frames += 1;
        logged.audio[dir].bytes += bytes;
        if (logged.audio[dir].frames % 50 === 1) logged.frames.push({ at: Date.now(), dir, bytes });
      }
    };
    const handler = createOpenAILiveBrowserEngineHandler(
      match[1]!,
      { voice: "marin", ...(INSTRUCTIONS ? { instructions: INSTRUCTIONS } : {}) },
      {
        connect: () =>
          new Promise((resolve, reject) => {
            const upstream = new WebSocket("wss://ai-gateway.vercel.sh/v1/live/sessions", {
              headers: { Authorization: `Bearer ${key}`, "User-Agent": "Persona-Live-E2E/1.0" },
              handshakeTimeout: 15_000,
            });
            upstream.on("message", (data, binary) => {
              if (binary) return;
              try {
                const event = JSON.parse(data.toString()) as { type?: unknown; delegation?: { id?: unknown; target?: unknown } };
                const last = logged.upstream.at(-1);
                if (last && last.type === event.type && event.type !== "session.delegation.created") {
                  last.count = (last.count ?? 1) + 1;
                  return;
                }
                logged.upstream.push({
                  at: Date.now(),
                  type: String(event.type),
                  ...(event.type === "session.delegation.created"
                    ? { delegation: { id: event.delegation?.id, target: event.delegation?.target } }
                    : {}),
                });
              } catch {
                logged.upstream.push({ at: Date.now(), type: "unparseable" });
              }
            });
            upstream.once("open", () => resolve(upstream as never));
            upstream.once("error", reject);
          }),
        // Server-side runner for clients that do not declare client-delegation.
        turnRunner: {
          async *execute() {
            yield { type: "text_final", text: HOURS_MARKDOWN };
          },
        },
        onUsage: async () => {},
      },
      (error: unknown) => console.error("[voice] engine error:", error instanceof Error ? error.message : error),
      {
        clientDelegation: capabilities.has("client-delegation"),
        logWarning: (message: string, fields: Record<string, unknown>) => console.warn("[voice]", message, fields),
      },
    );
    const context = {
      raw: browser,
      get readyState() {
        return browser.readyState;
      },
      send(data: string | ArrayBuffer) {
        log("out", data);
        if (browser.readyState === WebSocket.OPEN) browser.send(data);
      },
      close(code?: number, reason?: string) {
        browser.close(code, reason);
      },
    };
    browser.on("message", (bytes, binary) => {
      const data = binary ? Uint8Array.from(bytes as Buffer).buffer : bytes.toString();
      log("in", data);
      void handler.onMessage({ data }, context as never);
    });
    browser.on("close", (code) => {
      logged.closedCode = code;
      handler.onClose();
    });
    browser.on("error", (error) => handler.onError(error));
  });
});

server.listen(PORT, "127.0.0.1", () =>
  console.log(`gpt-live host ready on http://127.0.0.1:${PORT} (identity: ${GENERIC_IDENTITY ? "generic" : "agent"})`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    wss.close();
    server.close();
    setTimeout(() => process.exit(0), 3000).unref();
  });
