import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";

/**
 * Deterministic stand-in for core's GPT-Live browser voice socket
 * (`GET /ws/agents/:agentId/voice`, `voice-openai-live-browser-handler.ts`),
 * speaking the SERVER side of wire vocabulary v1 (gpt-live-contract.md,
 * Amendment 5):
 *
 *   - echoes the `runtype.bearer` subprotocol and records the bearer token;
 *   - like core, sends `session_config` only after the first client frame
 *     (core initializes the engine lazily on the first message);
 *   - `session_config.capabilities` is the intersection of what the client
 *     declared and what this server is configured for (`client_delegation`,
 *     `context`, `delegation_update`, `delegation_stream`, and opt-in
 *     `delegation_read_back`; the last two only with client delegation);
 *     `legacy: true` omits it (an old server);
 *   - streaming delegation: `delegation_delta` frames are accepted and checked
 *     against the contract (only before the delegation's first update/result;
 *     `streamedChars` must equal the streamed length and prefix the text);
 *     breaches land in `protocolErrors`;
 *   - an unknown or ungranted client frame type gets a non-fatal
 *     `warning{code:'UNKNOWN_FRAME'}` and the call goes on (Amendment 5.1);
 *     the frame is recorded in `rejected`, so specs still catch it.
 *
 * Everything after `session_config` is scripted by the spec through the
 * returned {@link FakeVoiceCall}: transcript/delegation frames, PCM audio, and
 * waits on client frames. Every client frame is recorded.
 */

export interface FakeVoiceServerOptions {
  /** Grant `client_delegation` when the client declares it. @default true */
  clientDelegation?: boolean;
  /** Grant `context` when the client declares it. @default true */
  contextFrames?: boolean;
  /** Grant `delegation_update` when the client declares it. @default true */
  delegationUpdate?: boolean;
  /** Grant `delegation_stream` when the client declares it (with client delegation). @default true */
  delegationStream?: boolean;
  /**
   * Grant `delegation_read_back` (with client delegation), as current core
   * does; the spec then tags read-backs itself. @default false
   */
  delegationReadBack?: boolean;
  /** An old server: `session_config` carries no `capabilities`. @default false */
  legacy?: boolean;
}

export type ClientJsonFrame = { type: string; [key: string]: unknown };

/** Client frame types today's core accepts on a GPT-Live call. */
const BASE_CLIENT_TYPES = new Set(["start", "cancel", "ping", "playback_progress"]);

export interface FakeVoiceCall {
  readonly url: URL;
  /** The negotiated subprotocol (`runtype.bearer`). */
  readonly protocol: string;
  /** Every subprotocol the client offered, in order. */
  readonly offeredProtocols: string[];
  /** The bearer token the client offered alongside `runtype.bearer`. */
  readonly token: string | null;
  readonly clientCapabilities: string[];
  /** Whether `session_config` granted client delegation on this call. */
  readonly delegationGranted: boolean;
  /** The capabilities `session_config` granted (empty for a legacy server). */
  readonly capabilities: string[];
  /** Every JSON frame the client sent, in arrival order. */
  readonly frames: ClientJsonFrame[];
  /** Binary (mic PCM) frames received. */
  readonly binaryFrames: number;
  /** The received mic PCM (16 kHz PCM16 LE mono), concatenated in arrival order. */
  micPcm(): Buffer;
  /** Unknown client frame types this server rejected. */
  readonly rejected: ClientJsonFrame[];
  /** Streaming-contract breaches seen (late deltas, a wrong `streamedChars`). */
  readonly protocolErrors: string[];
  /** The `delegation_delta` texts for a delegation, in arrival order. */
  deltasFor(delegationId: string): string[];
  /** Resolves once `session_config` went out. */
  readonly ready: Promise<void>;
  /** Resolves with the close code when the socket closes. */
  readonly closed: Promise<number>;
  framesOf(type: string): ClientJsonFrame[];
  /** Resolves with the first (already received or future) frame matching. */
  waitForFrame(
    type: string,
    predicate?: (frame: ClientJsonFrame) => boolean,
    timeoutMs?: number,
  ): Promise<ClientJsonFrame>;
  send(frame: Record<string, unknown>): void;
  /** `delegation_started` with `input`: the client runs this turn through its chat pipeline. */
  delegate(options: { delegationId: string; text: string; userUtteranceIds?: string[] }): void;
  /** `delegation_completed` for a spoken phase (`final: false` after an update's read-back). */
  completed(delegationId: string, options?: { final?: boolean; text?: string }): void;
  /** `delegation_progress`: a spoken chunk of this delegation went to the voice model. */
  progress(delegationId: string, text: string): void;
  /**
   * Stream one utterance the way core projects GPT-Live transcript deltas:
   * growing `final:false` frames for the same turnId, then a `final:true`.
   * `startMs` stays constant for the utterance; `endMs` grows.
   */
  utterance(options: {
    role: "user" | "assistant";
    turnId: string;
    text: string;
    startMs?: number;
    /** Split points (word count per frame). @default 2 words per frame */
    wordsPerFrame?: number;
    gapMs?: number;
  }): Promise<void>;
  /** Raw PCM16 LE mono 24 kHz (a quiet tone), `ms` long, in 20 ms frames. */
  sendAudio(ms: number): Promise<void>;
  /** Stream caller-supplied PCM16 LE mono 24 kHz (e.g. synthesized speech) in real-time 20 ms frames. */
  sendPcm(pcm: Buffer): Promise<void>;
  close(code?: number): void;
}

export interface FakeVoiceServer {
  /** `ws://127.0.0.1:<port>`: the widget's `voiceRecognition.provider.runtype.host`. */
  readonly host: string;
  readonly calls: FakeVoiceCall[];
  /** Prewarm POSTs (`/v1/client/agents/:id/voice/prewarm`) received. */
  readonly prewarms: string[];
  /** Resolves with the next call (or one already accepted but not yet taken). */
  nextCall(timeoutMs?: number): Promise<FakeVoiceCall>;
  setOptions(options: FakeVoiceServerOptions): void;
  close(): Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function pcmTone(ms: number): Buffer {
  const samples = Math.round((24_000 * ms) / 1000);
  const buf = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / 24_000) * 800), i * 2);
  }
  return buf;
}

export async function startFakeVoiceServer(
  initial: FakeVoiceServerOptions = {},
): Promise<FakeVoiceServer> {
  let options: Required<FakeVoiceServerOptions> = {
    clientDelegation: true,
    contextFrames: true,
    delegationUpdate: true,
    delegationStream: true,
    delegationReadBack: false,
    legacy: false,
    ...initial,
  };
  const prewarms: string[] = [];
  const calls: FakeVoiceCall[] = [];
  const untaken: FakeVoiceCall[] = [];
  const callWaiters: Array<(call: FakeVoiceCall) => void> = [];

  const http: Server = createServer((req, res) => {
    // CORS for the widget's prewarm POST (default `prewarmMode: 'request'`).
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    if (req.method === "POST" && /\/voice\/prewarm$/.test(req.url ?? "")) {
      prewarms.push(req.url ?? "");
    }
    res.writeHead(req.method === "OPTIONS" || req.method === "POST" ? 204 : 404);
    res.end();
  });

  const wss = new WebSocketServer({
    server: http,
    // Echo the bearer marker; browsers fail the handshake otherwise.
    handleProtocols: (protocols) => (protocols.has("runtype.bearer") ? "runtype.bearer" : false),
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const call = createCall(ws, req, options);
    calls.push(call);
    const waiter = callWaiters.shift();
    if (waiter) waiter(call);
    else untaken.push(call);
  });

  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const { port } = http.address() as AddressInfo;

  return {
    host: `ws://127.0.0.1:${port}`,
    calls,
    prewarms,
    nextCall(timeoutMs = 10_000) {
      const ready = untaken.shift();
      if (ready) return Promise.resolve(ready);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = callWaiters.indexOf(onCall);
          if (index >= 0) callWaiters.splice(index, 1);
          reject(new Error(`no voice call within ${timeoutMs}ms`));
        }, timeoutMs);
        const onCall = (call: FakeVoiceCall) => {
          clearTimeout(timer);
          resolve(call);
        };
        callWaiters.push(onCall);
      });
    },
    setOptions(next) {
      options = { ...options, ...next };
    },
    async close() {
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}

function createCall(
  ws: WebSocket,
  req: IncomingMessage,
  options: Required<FakeVoiceServerOptions>,
): FakeVoiceCall {
  const url = new URL(req.url ?? "/", "http://fake");
  const offeredProtocols = String(req.headers["sec-websocket-protocol"] ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const token =
    offeredProtocols.find((p) => p !== "runtype.bearer" && !p.startsWith("runtype.")) ?? null;
  const clientCapabilities = (url.searchParams.get("clientCapabilities") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const supported = [
    ...(options.clientDelegation ? ["client_delegation"] : []),
    ...(options.contextFrames ? ["context"] : []),
    ...(options.delegationUpdate ? ["delegation_update"] : []),
    ...(options.delegationStream && options.clientDelegation ? ["delegation_stream"] : []),
    ...(options.delegationReadBack && options.clientDelegation ? ["delegation_read_back"] : []),
  ];
  const capabilities = options.legacy ? [] : supported.filter((c) => clientCapabilities.includes(c));
  const delegationGranted = capabilities.includes("client_delegation");
  const accepted = new Set(BASE_CLIENT_TYPES);
  if (capabilities.includes("context")) accepted.add("context");
  if (delegationGranted) accepted.add("delegation_result");
  if (delegationGranted && capabilities.includes("delegation_update")) accepted.add("delegation_update");
  if (delegationGranted && capabilities.includes("delegation_stream")) accepted.add("delegation_delta");

  const frames: ClientJsonFrame[] = [];
  const rejected: ClientJsonFrame[] = [];
  const protocolErrors: string[] = [];
  // Per delegation: its deltas, and whether its first update/result went out.
  const deltas = new Map<string, string[]>();
  const answered = new Set<string>();
  /** Check a frame against the streaming contract (core's browser handler rules). */
  const checkStreaming = (frame: ClientJsonFrame) => {
    const id = String(frame.delegationId);
    if (frame.type === "delegation_delta") {
      if (answered.has(id)) protocolErrors.push(`delegation_delta for ${id} after its first update/result`);
      if (typeof frame.text !== "string" || !frame.text) protocolErrors.push(`empty delegation_delta for ${id}`);
      deltas.set(id, [...(deltas.get(id) ?? []), String(frame.text ?? "")]);
      return;
    }
    if (frame.type !== "delegation_update" && frame.type !== "delegation_result") return;
    const first = !answered.has(id);
    answered.add(id);
    if (frame.streamedChars === undefined) return;
    const streamed = (deltas.get(id) ?? []).join("");
    const text = String(frame.text ?? "");
    if (!first) protocolErrors.push(`streamedChars on ${id}'s later ${frame.type}`);
    if (!Number.isInteger(frame.streamedChars) || (frame.streamedChars as number) < 0)
      protocolErrors.push(`bad streamedChars ${String(frame.streamedChars)} for ${id}`);
    else if ((frame.streamedChars as number) > text.length || text.slice(0, frame.streamedChars as number) !== streamed.slice(0, frame.streamedChars as number))
      protocolErrors.push(`streamedChars ${String(frame.streamedChars)} for ${id} is not a prefix of the text that was streamed`);
  };
  const frameWaiters: Array<() => void> = [];
  let binaryFrames = 0;
  const micChunks: Buffer[] = [];
  let configured = false;
  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => (resolveReady = resolve));
  const closed = new Promise<number>((resolve) => ws.on("close", (code) => resolve(code)));

  const send = (frame: Record<string, unknown>) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(frame));
  };

  const configure = () => {
    if (configured) return;
    configured = true;
    send({
      type: "session_config",
      interruptionMode: "barge-in",
      speechMode: "speech_to_speech",
      ...(options.legacy
        ? {}
        : { protocolVersion: "runtype-browser-v1", callId: "vc_fake", capabilities }),
    });
    resolveReady();
  };

  ws.on("message", (data, isBinary) => {
    configure();
    if (isBinary) {
      binaryFrames += 1;
      micChunks.push(Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data));
      return;
    }
    let frame: ClientJsonFrame;
    try {
      frame = JSON.parse(data.toString()) as ClientJsonFrame;
    } catch {
      return;
    }
    frames.push(frame);
    checkStreaming(frame);
    if (!accepted.has(frame.type)) {
      // v1: an unknown client frame is logged and refused, never fatal.
      rejected.push(frame);
      send({ type: "warning", code: "UNKNOWN_FRAME", message: `Unsupported voice message: ${frame.type}` });
    }
    for (const wake of frameWaiters.splice(0)) wake();
  });

  const call: FakeVoiceCall = {
    url,
    protocol: ws.protocol,
    offeredProtocols,
    token,
    clientCapabilities,
    delegationGranted,
    capabilities,
    frames,
    get binaryFrames() {
      return binaryFrames;
    },
    micPcm: () => Buffer.concat(micChunks),
    rejected,
    protocolErrors,
    deltasFor: (delegationId) => [...(deltas.get(delegationId) ?? [])],
    ready,
    closed,
    framesOf: (type) => frames.filter((f) => f.type === type),
    async waitForFrame(type, predicate = () => true, timeoutMs = 10_000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const hit = frames.find((f) => f.type === type && predicate(f));
        if (hit) return hit;
        const left = deadline - Date.now();
        if (left <= 0) {
          throw new Error(
            `no client "${type}" frame within ${timeoutMs}ms; got ${JSON.stringify(
              frames.map((f) => f.type),
            )}`,
          );
        }
        await Promise.race([
          new Promise<void>((resolve) => frameWaiters.push(resolve)),
          sleep(Math.min(left, 250)),
        ]);
      }
    },
    send,
    delegate({ delegationId, text, userUtteranceIds = [] }) {
      send({
        type: "delegation_started",
        delegationId,
        turnId: delegationId,
        input: { text, userUtteranceIds, messages: [{ role: "user", content: text }] },
      });
    },
    completed(delegationId, { final = true, text = "" } = {}) {
      send({ type: "delegation_completed", delegationId, turnId: delegationId, speak: true, text, final });
    },
    progress(delegationId, text) {
      send({ type: "delegation_progress", delegationId, text });
    },
    async utterance({ role, turnId, text, startMs, wordsPerFrame = 2, gapMs = 40 }) {
      const words = text.split(" ");
      let endMs = startMs;
      for (let n = wordsPerFrame; n < words.length; n += wordsPerFrame) {
        if (endMs !== undefined) endMs += 250 * wordsPerFrame;
        send({
          type: "transcript_update",
          role,
          text: words.slice(0, n).join(" "),
          utteranceId: turnId,
          turnId,
          final: false,
          ...(startMs !== undefined ? { startMs, endMs } : {}),
        });
        await sleep(gapMs);
      }
      if (endMs !== undefined) endMs += 250;
      send({
        type: "transcript_update",
        role,
        text,
        utteranceId: turnId,
        turnId,
        final: true,
        ...(startMs !== undefined ? { startMs, endMs } : {}),
      });
      await sleep(gapMs);
    },
    async sendAudio(ms) {
      for (let sent = 0; sent < ms; sent += 20) {
        if (ws.readyState !== ws.OPEN) return;
        ws.send(pcmTone(Math.min(20, ms - sent)));
      }
      await sleep(5);
    },
    async sendPcm(pcm) {
      const frameBytes = (24_000 / 1000) * 20 * 2;
      for (let at = 0; at < pcm.length; at += frameBytes) {
        if (ws.readyState !== ws.OPEN) return;
        ws.send(pcm.subarray(at, at + frameBytes));
        await sleep(20);
      }
    },
    close(code = 1000) {
      ws.close(code, "Voice call ended");
    },
  };
  return call;
}
