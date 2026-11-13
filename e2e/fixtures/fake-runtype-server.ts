import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";

/**
 * Deterministic stand-in for the Runtype API's client-token plane, speaking
 * the SERVER side of `runtype-client-session-v1` (the client-session socket
 * contract) plus the HTTP routes that go with it:
 *
 *   POST /v1/client/init      advertises `realtime` (unless `advertise: false`)
 *   POST /v1/client/chat      `delivery:"socket"` => 202 JSON, else 200 SSE
 *   POST /v1/client/resume    same split; continues a paused turn
 *   GET  /v1/client/conversations/:cid/executions/:eid/events?after  SSE fallback
 *   WS   /ws/client/conversations/:cid?protocol&sessionId&clientVersion
 *
 * Socket auth follows core's voice socket: subprotocols `runtype.bearer`, the
 * `ct_` client token, the `cvt_` visitor token; only the marker is echoed.
 * Every execution keeps a journal of SSE blocks whose `id:` is the cursor, so
 * an attach (or the events route) replays strictly after a cursor.
 *
 * Turns are scripted by the last user message (see `scriptFor`):
 *   "long ..."      30 numbered words, one delta each (`frameDelayMs` apart)
 *   "navigate ..."  awaits the page tool `go_to_page`, then pauses for /resume
 *   "ask ..."       awaits `ask_user_question` (Basic / Pro), then replies with the answer
 *   anything else   "Echo: <text>" in a few deltas
 *
 * `fake-runtype-server-cli.ts` runs it standalone for the MPA demo pages.
 */

export interface FakeRuntypeServerOptions {
  /** Include `realtime` in init. @default true */
  advertise?: boolean;
  /** Honor `delivery:"socket"` with a 202. @default true */
  honorSocketDelivery?: boolean;
  /** Answer every explicit `attach` with `error{execution_not_found}`. @default false */
  refuseAttach?: boolean;
  /** Delay between scripted frames. @default 40 */
  frameDelayMs?: number;
  /** `hello.beatIntervalMs`. @default 25000 */
  beatIntervalMs?: number;
  /** Echo the chat body's `turnId` as `execution.clientTurnId` and `hello.activeClientTurnId`. @default true, or false when FAKE_RUNTYPE_CLIENT_TURN_IDS=0 */
  clientTurnIds?: boolean;
  /** Host the advertised `wss?://` URL uses. @default the bound address */
  publicHost?: string;
  port?: number;
}

export interface RecordedHttp {
  method: string;
  path: string;
  query: Record<string, string>;
  body: Record<string, unknown> | null;
  status: number;
}

export interface RecordedSocket {
  url: URL;
  offeredProtocols: string[];
  /** Every JSON frame the client sent, in order. */
  frames: Array<{ type?: string; [key: string]: unknown }>;
  closed: boolean;
  closeCode: number | null;
}

export interface FakeRuntypeServer {
  readonly url: string;
  readonly http: RecordedHttp[];
  readonly sockets: RecordedSocket[];
  /** Full assistant text of an execution's script (what the transcript must show). */
  expectedText(executionId: string): string;
  /** Execution ids in creation order. */
  executionIds(): string[];
  /** Drop every open socket without a close frame (the client sees 1006). */
  killSockets(): void;
  /** Close every open socket with a code. */
  closeSockets(code: number, reason?: string): void;
  /** Refuse upgrades with this HTTP status (null accepts again). */
  rejectUpgrades(status: number | null): void;
  /** Hold the running scripts until `release()` (frames already sent stay sent). */
  hold(): { release(): void };
  /** Resolves when an execution has emitted at least `count` text deltas. */
  deltas(executionId: string, count: number): Promise<void>;
  close(): Promise<void>;
}

const PROTOCOL = "runtype-client-session-v1";
const BEARER = "runtype.bearer";
const FUTURE = "2099-01-01T00:00:00.000Z";

type Block = { id: number; sse: string };
type Execution = {
  id: string;
  conversationId: string;
  journal: Block[];
  state: "running" | "paused" | "ended";
  expected: string;
  deltaCount: number;
  deltaWaiters: Array<{ count: number; resolve: () => void }>;
  httpStreams: Set<ServerResponse>;
  onResume?: (outputs: Record<string, unknown>) => Promise<void>;
  clientTurnId?: string;
};
type Conn = { ws: WebSocket; record: RecordedSocket; conversationId: string; attached: Set<string> };

export async function startFakeRuntypeServer(options: FakeRuntypeServerOptions = {}): Promise<FakeRuntypeServer> {
  const frameDelayMs = options.frameDelayMs ?? 40;
  const echoTurnIds = options.clientTurnIds ?? process.env.FAKE_RUNTYPE_CLIENT_TURN_IDS !== "0";
  const http: RecordedHttp[] = [];
  const sockets: RecordedSocket[] = [];
  const conns = new Set<Conn>();
  const sessions = new Map<string, { conversationId: string; visitor: string }>();
  const visitors = new Map<string, string>();
  const executions = new Map<string, Execution>();
  let counter = 0;
  let upgradeStatus: number | null = null;
  let gate: Promise<void> | null = null;
  const next = (prefix: string) => `${prefix}_${++counter}`;

  const sleep = async (ms: number) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    while (gate) await gate;
  };

  const sendJson = (conn: Conn, frame: Record<string, unknown>) => {
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(frame));
  };

  const block = (id: number, type: string, data: Record<string, unknown>) =>
    `id: ${id}\nevent: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;

  const emit = (execution: Execution, type: string, data: Record<string, unknown> = {}) => {
    const id = execution.journal.length + 1;
    const sse = block(id, type, { executionId: execution.id, seq: id, ...data });
    execution.journal.push({ id, sse });
    for (const conn of conns) {
      if (conn.attached.has(execution.id)) sendJson(conn, { type: "frame", executionId: execution.id, sse });
    }
    for (const res of execution.httpStreams) res.write(sse);
    if (type === "text_delta") {
      execution.deltaCount += 1;
      execution.deltaWaiters = execution.deltaWaiters.filter((w) => {
        if (execution.deltaCount < w.count) return true;
        w.resolve();
        return false;
      });
    }
  };

  const stopRelay = (execution: Execution, reason: "terminal" | "paused") => {
    for (const conn of conns) {
      if (!conn.attached.has(execution.id)) continue;
      sendJson(conn, { type: "attach_end", executionId: execution.id, reason });
      if (reason === "terminal") {
        conn.attached.delete(execution.id);
        sendJson(conn, { type: "execution", executionId: execution.id, state: "ended" });
      }
    }
    for (const res of execution.httpStreams) res.end();
    execution.httpStreams.clear();
  };

  const textTurn = async (execution: Execution, chunks: string[]) => {
    emit(execution, "turn_start", { id: "turn_1", iteration: 1, role: "assistant" });
    const textId = next("text");
    emit(execution, "text_start", { id: textId, role: "assistant" });
    for (const delta of chunks) {
      await sleep(frameDelayMs);
      emit(execution, "text_delta", { id: textId, delta });
    }
    emit(execution, "text_complete", { id: textId });
    emit(execution, "turn_complete", { id: "turn_1", iteration: 1, role: "assistant", completedAt: new Date().toISOString() });
  };

  const complete = (execution: Execution) => {
    emit(execution, "execution_complete", { kind: "agent", success: true, completedAt: new Date().toISOString() });
    execution.state = "ended";
    stopRelay(execution, "terminal");
  };

  const scriptFor = (execution: Execution, text: string): (() => Promise<void>) => {
    if (/^long\b/i.test(text)) {
      const words = Array.from({ length: 30 }, (_, i) => `w${String(i + 1).padStart(2, "0")}`);
      const chunks = words.map((word, i) => (i === 0 ? word : ` ${word}`));
      execution.expected = chunks.join("");
      return async () => {
        await textTurn(execution, chunks);
        complete(execution);
      };
    }
    if (/^ask\b/i.test(text)) {
      execution.expected = "";
      return async () => {
        await sleep(frameDelayMs);
        emit(execution, "await", {
          toolName: "ask_user_question",
          origin: "local",
          toolCallId: "call_ask_1",
          toolId: "call_ask_1",
          parameters: { questions: [{ question: "Which plan?", options: [{ label: "Basic" }, { label: "Pro" }] }] },
          awaitedAt: new Date().toISOString(),
        });
        execution.state = "paused";
        execution.onResume = async (outputs) => {
          const reply = `You picked ${JSON.stringify(Object.values(outputs)[0])}.`;
          execution.expected = reply;
          await textTurn(execution, [reply]);
          complete(execution);
        };
        stopRelay(execution, "paused");
      };
    }
    if (/^navigate\b/i.test(text)) {
      execution.expected = "";
      return async () => {
        await sleep(frameDelayMs);
        emit(execution, "await", {
          toolName: "go_to_page",
          origin: "webmcp",
          toolCallId: "call_nav_1",
          toolId: "call_nav_1",
          parameters: { page: "next" },
          awaitedAt: new Date().toISOString(),
        });
        execution.state = "paused";
        execution.onResume = async (outputs) => {
          const output = outputs.call_nav_1 as { title?: string; navigated?: boolean } | undefined;
          const reply = output?.navigated ? `Arrived on ${output.title ?? "the next page"}.` : "Tool answered.";
          execution.expected = reply;
          await textTurn(execution, [reply]);
          complete(execution);
        };
        stopRelay(execution, "paused");
      };
    }
    const reply = `Echo: ${text}`;
    const chunks = reply.match(/.{1,6}/g) ?? [reply];
    execution.expected = reply;
    return async () => {
      await textTurn(execution, chunks);
      complete(execution);
    };
  };

  // ---------------------------------------------------------------- HTTP --

  const cors = (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Visitor-Token, X-Persona-Version, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Vary", "Origin");
  };

  const readBody = (req: IncomingMessage) =>
    new Promise<Record<string, unknown> | null>((resolve) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        try {
          resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : null);
        } catch {
          resolve(null);
        }
      });
    });

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  };

  const openSse = (res: ServerResponse) => {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.flushHeaders();
  };

  /** Stream an execution over HTTP from strictly after `after`, then live. */
  const streamHttp = (res: ServerResponse, execution: Execution, after: number) => {
    openSse(res);
    for (const b of execution.journal) if (b.id > after) res.write(b.sse);
    if (execution.state !== "running") {
      res.end();
      return;
    }
    execution.httpStreams.add(res);
    res.on("close", () => execution.httpStreams.delete(res));
  };

  const startExecution = (conversationId: string, run: (execution: Execution) => () => Promise<void>) => {
    const execution: Execution = {
      id: next("exec"),
      conversationId,
      journal: [],
      state: "running",
      expected: "",
      deltaCount: 0,
      deltaWaiters: [],
      httpStreams: new Set(),
    };
    executions.set(execution.id, execution);
    return { execution, script: run(execution) };
  };

  const turnOf = (execution: Execution) =>
    execution.clientTurnId ? { clientTurnId: execution.clientTurnId } : {};

  const announce = (execution: Execution) => {
    // Auto-attach: every socket already on the conversation relays from the start.
    for (const conn of conns) {
      if (conn.conversationId !== execution.conversationId) continue;
      sendJson(conn, { type: "execution", executionId: execution.id, state: "started", ...turnOf(execution) });
      conn.attached.add(execution.id);
      for (const b of execution.journal) sendJson(conn, { type: "frame", executionId: execution.id, sse: b.sse });
    }
  };

  const lastUserText = (body: Record<string, unknown> | null): string => {
    const messages = Array.isArray(body?.messages) ? (body!.messages as Array<Record<string, unknown>>) : [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.role !== "user") continue;
      if (typeof m.content === "string") return m.content;
      if (Array.isArray(m.content)) {
        return (m.content as Array<{ type?: string; text?: string }>)
          .filter((part) => part.type === "text")
          .map((part) => part.text ?? "")
          .join("");
      }
    }
    return "";
  };

  const route = async (req: IncomingMessage, res: ServerResponse) => {
    cors(req, res);
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    const body = req.method === "POST" ? await readBody(req) : null;
    const record: RecordedHttp = {
      method: req.method ?? "GET",
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body,
      status: 0,
    };
    http.push(record);
    const reply = (status: number, payload: unknown) => {
      record.status = status;
      json(res, status, payload);
    };
    const path = url.pathname.replace(/^\/e2e-runtype/, "");

    if (path === "/v1/client/init" && req.method === "POST") {
      const presented = typeof body?.visitorToken === "string" ? body.visitorToken : null;
      let visitor = presented && visitors.has(presented) ? presented : null;
      const minted = !visitor;
      if (!visitor) {
        visitor = next("cvt");
        visitors.set(visitor, next("vis"));
      }
      const resumeId = typeof body?.conversationId === "string" ? body.conversationId : null;
      const stored = typeof body?.sessionId === "string" ? sessions.get(body.sessionId) : undefined;
      const conversationId = resumeId ?? stored?.conversationId ?? next("rec");
      const sessionId = next("cs");
      sessions.set(sessionId, { conversationId, visitor });
      const host = options.publicHost ?? req.headers.host ?? "127.0.0.1";
      const durable = body?.durableRecovery === true;
      return reply(200, {
        sessionId,
        expiresAt: FUTURE,
        flow: { id: "flow_fake", name: "Fake", description: null },
        conversationId,
        targetId: "flow_fake",
        conversationRevision: "rev_1",
        visitor: {
          id: visitors.get(visitor),
          ...(minted ? { token: visitor } : {}),
          expiresAt: FUTURE,
          endUserId: null,
          identityStatus: "not_provided",
        },
        config: { welcomeMessage: null, placeholder: "Ask...", theme: null },
        ...(durable ? { durableRecovery: { enabled: true } } : {}),
        ...(durable && options.advertise !== false
          ? { realtime: { protocol: PROTOCOL, url: `ws://${host}/ws/client/conversations/${conversationId}` } }
          : {}),
      });
    }

    const session = typeof body?.sessionId === "string" ? sessions.get(body.sessionId) : undefined;
    const socketDelivery = body?.delivery === "socket" && options.honorSocketDelivery !== false;

    if (path === "/v1/client/chat" && req.method === "POST") {
      if (!session) return reply(401, { error: "Session not found or expired" });
      const { execution, script } = startExecution(session.conversationId, (e) => scriptFor(e, lastUserText(body)));
      if (echoTurnIds && typeof body?.turnId === "string") execution.clientTurnId = body.turnId;
      emit(execution, "execution_start", { kind: "agent", agentId: "virtual", agentName: "Fake", maxTurns: 1, startedAt: new Date().toISOString() });
      if (socketDelivery) {
        reply(202, { executionId: execution.id, conversationId: session.conversationId, delivery: "socket" });
      } else {
        record.status = 200;
        streamHttp(res, execution, 0);
      }
      announce(execution);
      void script();
      return;
    }

    if (path === "/v1/client/resume" && req.method === "POST") {
      if (!session) return reply(401, { error: "Session not found or expired" });
      const execution = executions.get(String(body?.executionId));
      if (!execution || execution.state !== "paused" || !execution.onResume) {
        return reply(409, { error: "Execution is not waiting for tool output" });
      }
      const resume = execution.onResume;
      execution.onResume = undefined;
      execution.state = "running";
      const after = Number(body?.after ?? execution.journal.length);
      if (socketDelivery) {
        reply(202, { executionId: execution.id, conversationId: session.conversationId, delivery: "socket" });
        // A socket that opened after the pause (a new page) is announced the resumed leg from `after`.
        for (const conn of conns) {
          if (conn.conversationId !== execution.conversationId || conn.attached.has(execution.id)) continue;
          sendJson(conn, { type: "execution", executionId: execution.id, state: "resumed" });
          conn.attached.add(execution.id);
          for (const b of execution.journal) {
            if (b.id > after) sendJson(conn, { type: "frame", executionId: execution.id, sse: b.sse });
          }
        }
      } else {
        record.status = 200;
        streamHttp(res, execution, Number.isFinite(after) ? after : execution.journal.length);
      }
      void resume((body?.toolOutputs ?? {}) as Record<string, unknown>);
      return;
    }

    const events = path.match(/^\/v1\/client\/conversations\/([^/]+)\/executions\/([^/]+)\/events$/);
    if (events && req.method === "GET") {
      const execution = executions.get(decodeURIComponent(events[2]));
      const visitor = req.headers["x-visitor-token"];
      const owner = sessions.get(url.searchParams.get("sessionId") ?? "");
      if (!execution || !owner || owner.visitor !== visitor || execution.conversationId !== decodeURIComponent(events[1])) {
        return reply(404, { error: "not_found" });
      }
      record.status = 200;
      streamHttp(res, execution, Number(url.searchParams.get("after") ?? 0));
      return;
    }

    return reply(404, { error: "not_found", path });
  };

  // ----------------------------------------------------------- WebSocket --

  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => (protocols.has(BEARER) ? BEARER : false),
  });

  const refuse = (socket: Duplex, status: number, error: string) => {
    socket.write(
      `HTTP/1.1 ${status} Refused\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n${JSON.stringify({ error })}`
    );
    socket.destroy();
  };

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "ws://localhost");
    const offered = String(req.headers["sec-websocket-protocol"] ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const record: RecordedSocket = { url, offeredProtocols: offered, frames: [], closed: false, closeCode: null };
    sockets.push(record);
    if (upgradeStatus !== null) return refuse(socket, upgradeStatus, "refused");
    const match = url.pathname.match(/^\/ws\/client\/conversations\/([^/]+)$/);
    if (!match) return refuse(socket, 404, "not_found");
    const conversationId = decodeURIComponent(match[1]);
    if (url.searchParams.get("protocol") !== PROTOCOL) return refuse(socket, 426, "unsupported_protocol");
    const session = sessions.get(url.searchParams.get("sessionId") ?? "");
    const visitor = offered.find((p) => p.startsWith("cvt_"));
    if (offered[0] !== BEARER || !offered.some((p) => p.startsWith("ct_")) || !visitor) {
      return refuse(socket, 401, "unauthorized");
    }
    if (!session || session.conversationId !== conversationId || session.visitor !== visitor) {
      return refuse(socket, 403, "forbidden");
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const conn: Conn = { ws, record, conversationId, attached: new Set() };
      conns.add(conn);
      const active = [...executions.values()].find(
        (e) => e.conversationId === conversationId && e.state !== "ended"
      );
      sendJson(conn, {
        type: "hello",
        protocolVersion: PROTOCOL,
        conversationId,
        connectionId: next("c"),
        beatIntervalMs: options.beatIntervalMs ?? 25_000,
        activeExecutionId: active?.id ?? null,
        ...(active?.clientTurnId ? { activeClientTurnId: active.clientTurnId } : {}),
        capabilities: [],
      });
      ws.on("message", (data, isBinary) => {
        if (isBinary) return;
        const text = String(data);
        if (text === '{"type":"beat"}') {
          record.frames.push({ type: "beat" });
          sendJson(conn, { type: "beat-ack" });
          return;
        }
        let frame: Record<string, unknown>;
        try {
          frame = JSON.parse(text) as Record<string, unknown>;
        } catch {
          sendJson(conn, { type: "error", code: "invalid_frame", message: "Not JSON" });
          return;
        }
        record.frames.push(frame as RecordedSocket["frames"][number]);
        const executionId = typeof frame.executionId === "string" ? frame.executionId : "";
        switch (frame.type) {
          case "attach": {
            const execution = executions.get(executionId);
            if (!execution || execution.conversationId !== conversationId || options.refuseAttach) {
              sendJson(conn, { type: "error", code: "execution_not_found", message: "Execution not found", executionId });
              return;
            }
            const after = frame.after == null ? 0 : Number(frame.after);
            sendJson(conn, { type: "attached", executionId, after: frame.after ?? null });
            const replay = execution.journal.filter((b) => b.id > after).map((b) => b.sse).join("");
            if (replay) sendJson(conn, { type: "frame", executionId, sse: replay });
            if (execution.state === "ended") {
              sendJson(conn, { type: "attach_end", executionId, reason: "terminal" });
            } else {
              conn.attached.add(executionId);
              if (execution.state === "paused") sendJson(conn, { type: "attach_end", executionId, reason: "paused" });
            }
            return;
          }
          case "detach":
            conn.attached.delete(executionId);
            sendJson(conn, { type: "attach_end", executionId, reason: "detached" });
            return;
          case "navigating":
            sendJson(conn, { type: "navigating-ack" });
            return;
          default:
            return;
        }
      });
      ws.on("close", (code) => {
        record.closed = true;
        record.closeCode = code;
        conns.delete(conn);
      });
    });
  };

  const server: Server = createServer((req, res) => {
    route(req, res).catch((error) => {
      if (!res.headersSent) json(res, 500, { error: String(error) });
    });
  });
  server.on("upgrade", onUpgrade);
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    http,
    sockets,
    expectedText: (id) => executions.get(id)?.expected ?? "",
    executionIds: () => [...executions.keys()],
    killSockets() {
      for (const conn of conns) conn.ws.terminate();
    },
    closeSockets(code, reason) {
      for (const conn of conns) conn.ws.close(code, reason);
    },
    rejectUpgrades(status) {
      upgradeStatus = status;
    },
    hold() {
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      gate = held;
      return {
        release() {
          if (gate === held) gate = null;
          release();
        },
      };
    },
    deltas(executionId, count) {
      const execution = executions.get(executionId);
      if (!execution) return Promise.reject(new Error(`Unknown execution ${executionId}`));
      if (execution.deltaCount >= count) return Promise.resolve();
      return new Promise((resolve) => execution.deltaWaiters.push({ count, resolve }));
    },
    async close() {
      for (const conn of conns) conn.ws.terminate();
      for (const execution of executions.values()) for (const res of execution.httpStreams) res.destroy();
      wss.close();
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
