/**
 * Generic WebSocket stream transport (`@runtypelabs/persona/websocket-transport`,
 * the lazy `websocket-transport.js` chunk).
 *
 * One socket carries any number of logical streams. A pluggable codec maps
 * outbound requests to socket messages and inbound socket messages to stream
 * text. Two backend shapes are supported:
 *
 * - **duplex**: the codec's `encode` turns a widget request into socket
 *   message(s); replies stream back on the same socket.
 * - **socket down, HTTP up**: requests still go over HTTP (`next`). While the
 *   socket is ready the codec's `prepare` may rewrite the request (for example
 *   to ask for socket delivery) and `accept` reads the HTTP response; when it
 *   names a stream id, that stream's frames come from the socket.
 *
 * Every stream is returned as a synthetic `text/event-stream` `Response`, so
 * the widget's single SSE pipeline consumes it (cursor tracking, custom
 * parsers, and taps behave exactly as for HTTP).
 */
import {
  PersonaTransportError,
  type PersonaTransport,
  type PersonaTransportErrorCode,
  type PersonaTransportNext,
  type PersonaTransportRequest,
  type PersonaTransportWarmReason,
} from "./transport";

export { PersonaTransportError } from "./transport";
export type {
  PersonaTransport,
  PersonaTransportErrorCode,
  PersonaTransportNext,
  PersonaTransportRequest,
  PersonaTransportRequestKind,
  PersonaTransportWarmReason,
} from "./transport";

/** A unified stream event the codec produced from a socket message. */
export type WebSocketTransportEvent = { type: string; [key: string]: unknown };

/** What the codec makes of one inbound socket message. */
export type WebSocketTransportInbound =
  /** The backend is ready for requests (only needed with `awaitReady`). */
  | { kind: "ready"; heartbeatMs?: number }
  /** Complete SSE blocks for a stream, verbatim (`event:`/`data:`/`id:` lines). */
  | { kind: "sse"; streamId: string; sse: string }
  /** Stream events as objects; the transport serializes them to SSE. */
  | { kind: "events"; streamId: string; events: WebSocketTransportEvent[]; id?: string }
  /** The backend acknowledged an attach; with `acknowledgesAttach`, the replay follows. */
  | { kind: "attached"; streamId: string }
  /** The backend stopped relaying a stream. `complete`/`paused` end it normally. */
  | { kind: "end"; streamId: string; reason?: string }
  /** An error, for one stream (`streamId`) or the whole socket. */
  | { kind: "error"; streamId?: string; code?: string; message: string; fatal?: boolean }
  /** Anything else (control frames); handed to `onMessage`. */
  | { kind: "message"; message: unknown };

export type WebSocketTransportOutbound = string | ArrayBufferLike | Blob | ArrayBufferView;

/** What to do after the socket closed. */
export type WebSocketTransportCloseAction = "reconnect" | "reauth" | "disable" | "stop";

export interface WebSocketTransportCodec {
  /**
   * The backend sends an `attached` acknowledgement before replaying an attach.
   * Frames that arrive for a replay claim before it come from the relay the
   * attach replaced and are resent by the replay, so they are dropped.
   */
  acknowledgesAttach?: boolean;
  /**
   * Decode one inbound message. Text arrives as a string; binary frames as an
   * `ArrayBuffer` (or `Blob`). Return null to ignore it. A throw is reported
   * through `onError` and the socket stays up.
   */
  decode(data: string | ArrayBuffer | Blob):
    | WebSocketTransportInbound
    | WebSocketTransportInbound[]
    | null
    | undefined;
  /**
   * Duplex backends: the socket message(s) for a request, tagged with the
   * transport-assigned `streamId`. Return null to send this request over HTTP.
   */
  encode?(
    request: PersonaTransportRequest,
    context: { streamId: string }
  ): WebSocketTransportOutbound | WebSocketTransportOutbound[] | null;
  /** Socket-down/HTTP-up: rewrite a request while the socket is ready. */
  prepare?(request: PersonaTransportRequest): PersonaTransportRequest;
  /**
   * Socket-down/HTTP-up: the stream id when this HTTP response hands its
   * stream to the socket, or null to consume the HTTP body as usual.
   */
  accept?(response: Response, request: PersonaTransportRequest): string | null | Promise<string | null>;
  /** Message that (re)attaches a stream after a cursor; null when unsupported. */
  attach?(streamId: string, after: string | null): WebSocketTransportOutbound | null;
  /** Message that stops relaying a stream to this socket. */
  detach?(streamId: string): WebSocketTransportOutbound | null;
  /** Messages to send right after the socket opens (e.g. a session setup). */
  open?(): WebSocketTransportOutbound[];
  /** Exact heartbeat message. */
  heartbeat?: WebSocketTransportOutbound;
  /** Map a close to an action. Defaults: 1008/1009/1003 stop, else reconnect. */
  classifyClose?(code: number, reason: string): WebSocketTransportCloseAction;
}

export type WebSocketTransportState = "idle" | "connecting" | "open" | "closed" | "disabled";

/** Minimal `WebSocket` surface the transport uses (tests inject a fake). */
export interface WebSocketLike {
  readonly readyState: number;
  binaryType: string;
  send(data: WebSocketTransportOutbound): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason: string; wasClean?: boolean }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}
export type WebSocketLikeConstructor = new (url: string, protocols?: string | string[]) => WebSocketLike;

export type WebSocketTransportOptions = {
  /** Socket URL, or a function resolving it at each connect. */
  url: string | (() => string | Promise<string>);
  /** Subprotocols, or a function resolving them at each connect (credentials). */
  protocols?: string[] | (() => string[] | Promise<string[]>);
  codec: WebSocketTransportCodec;
  /** Ready on `open` (default) or only once the codec decodes a `ready`. */
  awaitReady?: boolean;
  /** Heartbeat interval; a `ready.heartbeatMs` overrides it. 0 disables. @default 0 */
  heartbeatMs?: number;
  /** Reconnect backoff (ms per attempt) while streams are open. @default [250, 1000, 2000, 4000] */
  backoffMs?: number[];
  /** Give up connecting after this long. @default 5000 */
  connectTimeoutMs?: number;
  /** Close an unused socket once the page has been hidden this long. @default 180000 */
  idleCloseMs?: number;
  /**
   * When a stream cannot be restored: `"error"` rejects its reader with a
   * {@link PersonaTransportError}; `"close"` ends it without a terminal, which a
   * durable session treats as a dropped connection. @default "error"
   */
  onStreamLost?: "error" | "close";
  /** Duplex only: send requests over HTTP when the socket is unavailable. @default false */
  httpFallback?: boolean;
  /** Called on close code `reauth` before reconnecting (refresh credentials). */
  reauthenticate?: () => Promise<void>;
  /**
   * HTTP up, socket down: serve a stream the backend handed to the socket
   * (`accept`) when the socket cannot carry it, from its start, e.g. over an
   * events route. Without it such a stream ends as lost.
   */
  recoverStream?: (streamId: string, signal?: AbortSignal) => Promise<Response>;
  onStateChange?: (state: WebSocketTransportState) => void;
  /** Control messages (`kind: "message"`). */
  onMessage?: (message: unknown) => void;
  /** Frames arrived for a stream nobody claimed yet. */
  onUnclaimedStream?: (streamId: string) => void;
  /** Non-fatal problems (decode failures, socket-level errors). */
  onError?: (error: PersonaTransportError) => void;
  /** Injected `WebSocket` constructor. @default globalThis.WebSocket */
  WebSocket?: WebSocketLikeConstructor;
  /** Page lifecycle source; null disables lifecycle handling. @default globalThis.window */
  lifecycle?: (Pick<Window, "addEventListener" | "removeEventListener"> & { document?: Document }) | null;
};

type StreamEntry = {
  controller: ReadableStreamDefaultController<Uint8Array> | null;
  /** Highest cursor delivered into this stream. */
  cursor: string | null;
  /** Socket generation the backend is relaying this stream on. */
  generation: number;
  release: () => void;
  /**
   * A replay claim waiting for the backend's attach acknowledgement. Until it
   * arrives, frames and ends belong to the relay the attach replaces (the
   * replay resends them) and are dropped; only a refusal ends the stream.
   */
  replaying?: boolean;
  /** A backend handoff (`accept`): until a frame arrives, only its id says where to recover it from. */
  handedOff?: boolean;
  delivered?: boolean;
  signal?: AbortSignal;
  /** Cancels this stream's HTTP recovery. */
  stop?: () => void;
};

type Unclaimed = {
  chunks: string[];
  cursor: string | null;
  ended: string | null;
  error?: PersonaTransportError;
  expires: number;
};

const OPEN = 1;
const unavailable = (message: string, retryable?: boolean) => new PersonaTransportError("unavailable", message, retryable);
const UNCLAIMED_TTL_MS = 30_000;
/** How long an HTTP request that the socket could carry waits for an in-progress open. */
const PREPARE_CONNECT_WAIT_MS = 1500;
const MAX_UNCLAIMED_CHUNKS = 2048;
const MAX_ENDED_CURSORS = 64;
const encoder = new TextEncoder();

const cursorOf = (block: string): string | null => {
  for (const line of block.split("\n")) {
    if (line.startsWith("id:")) return line.slice(3).trim() || null;
  }
  return null;
};

/** `row` or `row.part` as [row, part]; a bare row is the row's last part. */
const cursorKey = (id: string): [number, number] | null => {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(id);
  return match ? [Number(match[1]), match[2] === undefined ? Infinity : Number(match[2])] : null;
};

/**
 * True when `next` is at or before `current`. Numeric cursors, with optional
 * sub-row parts (`42.0`, `42.1`, then `42`), are ordered; other ids only match exactly.
 */
const notAfter = (next: string, current: string | null): boolean => {
  if (current === null) return false;
  const a = cursorKey(next);
  const b = cursorKey(current);
  if (!a || !b) return next === current;
  return a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]);
};

export const sseFromEvents = (events: WebSocketTransportEvent[], id?: string): string =>
  events
    .map((event, index) =>
      `event: ${event.type}\ndata: ${JSON.stringify(event)}\n` +
      (id !== undefined && index === events.length - 1 ? `id: ${id}\n` : "") + "\n")
    .join("");

const abortError = () => new DOMException("The stream was aborted.", "AbortError");

export type WebSocketTransport = PersonaTransport & {
  readonly state: WebSocketTransportState;
  /** True once the socket is open and (with `awaitReady`) the backend is ready. */
  isReady(): boolean;
  /** Open (or join the opening of) the socket. */
  connect(): Promise<void>;
  /** Close the socket on purpose; streams end per `onStreamLost`. */
  close(code?: number, reason?: string): void;
  /** Send a raw message; false when the socket is not open. */
  send(message: WebSocketTransportOutbound): boolean;
  /**
   * Claim a stream by id (buffered frames included) as an SSE `Response`. With
   * `replay`, an attach from `after` follows and resends them, so the buffer is dropped.
   */
  claim(streamId: string, options?: { signal?: AbortSignal; after?: string | null; replay?: boolean }): Response;
  /** Whether a stream id is currently claimed. */
  isClaimed(streamId: string): boolean;
  /** Ids of the open streams. */
  streams(): string[];
  /** The last cursor delivered for a stream, open or ended, or null. */
  cursor(streamId: string): string | null;
};

export function createWebSocketTransport(options: WebSocketTransportOptions): WebSocketTransport {
  const { codec } = options;
  const backoff = options.backoffMs ?? [250, 1000, 2000, 4000];
  const connectTimeoutMs = options.connectTimeoutMs ?? 5000;
  const idleCloseMs = options.idleCloseMs ?? 180_000;
  const Ctor: WebSocketLikeConstructor | undefined =
    options.WebSocket ?? (globalThis as { WebSocket?: WebSocketLikeConstructor }).WebSocket;
  const lifecycle = options.lifecycle === undefined
    ? (typeof window !== "undefined" ? window : null)
    : options.lifecycle;
  const doc: Document | undefined = lifecycle?.document ?? (typeof document !== "undefined" ? document : undefined);

  let state: WebSocketTransportState = "idle";
  let ws: WebSocketLike | null = null;
  let ready = false;
  let generation = 0;
  let connecting: Promise<void> | null = null;
  let settleConnect: ((error?: PersonaTransportError) => void) | null = null;
  let disabled: PersonaTransportError | null = null;
  let destroyed = false;
  let suspended = false;
  let wanted = false;
  let attempt = 0;
  let heartbeatMs = options.heartbeatMs ?? 0;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let lastInbound = 0;
  let streamCounter = 0;
  const entries = new Map<string, StreamEntry>();
  const unclaimed = new Map<string, Unclaimed>();
  /** Streams the server said it cannot serve: their reconnects go over HTTP. */
  const refused = new Set<string>();
  /** Last cursor of each ended stream, so a later attach to the same stream resumes after it. */
  const endedCursors = new Map<string, string>();

  const setState = (next: WebSocketTransportState) => {
    if (state === next) return;
    state = next;
    options.onStateChange?.(next);
  };

  const report = (code: PersonaTransportErrorCode, message: string) =>
    options.onError?.(new PersonaTransportError(code, message));

  const sendRaw = (message: WebSocketTransportOutbound | null | undefined): boolean => {
    if (!message || !ws || ws.readyState !== OPEN) return false;
    try {
      ws.send(message);
      return true;
    } catch {
      return false;
    }
  };

  const stopHeartbeat = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  };

  const startHeartbeat = () => {
    stopHeartbeat();
    if (!heartbeatMs || !codec.heartbeat) return;
    heartbeatTimer = setInterval(() => {
      // A socket that stopped answering is dead even if the browser has not noticed.
      if (Date.now() - lastInbound > heartbeatMs * 2 + 5000) {
        ws?.close(4000, "heartbeat timeout");
        handleClose(4000, "heartbeat timeout");
        return;
      }
      sendRaw(codec.heartbeat);
    }, heartbeatMs);
  };

  const enqueue = (entry: StreamEntry, sse: string) => {
    let out = "";
    for (const block of sse.split(/\n\n/)) {
      if (!block.trim()) continue;
      const id = cursorOf(block);
      if (id !== null) {
        // Never deliver a cursor twice: a reattach can overlap the live relay.
        if (notAfter(id, entry.cursor)) continue;
        entry.cursor = id;
      }
      out += `${block}\n\n`;
    }
    if (out) {
      entry.delivered = true;
      entry.controller?.enqueue(encoder.encode(out));
    }
  };

  const finish = (streamId: string, outcome: "close" | PersonaTransportError | DOMException) => {
    const entry = entries.get(streamId);
    if (!entry) return;
    entries.delete(streamId);
    if (entry.cursor) {
      endedCursors.delete(streamId);
      endedCursors.set(streamId, entry.cursor);
      if (endedCursors.size > MAX_ENDED_CURSORS) endedCursors.delete(endedCursors.keys().next().value!);
    }
    entry.release();
    const controller = entry.controller;
    entry.controller = null;
    try {
      if (outcome === "close") controller?.close();
      else controller?.error(outcome);
    } catch {
      // already closed by the consumer
    }
    maybeIdle();
  };

  /** A handoff lost before its first frame gave the session no execution id to resume: read it over HTTP from the start. */
  const recoverable = (entry: StreamEntry | undefined): entry is StreamEntry =>
    !!entry?.controller && !!entry.handedOff && !entry.delivered && !!options.recoverStream && !entry.signal?.aborted;

  const loseStream = (streamId: string, error: PersonaTransportError) => {
    const entry = entries.get(streamId);
    if (!recoverable(entry) || !options.recoverStream) {
      finish(streamId, options.onStreamLost === "close" ? "close" : error);
      return;
    }
    const controller = entry.controller!;
    entries.delete(streamId);
    entry.release();
    maybeIdle();
    const stop = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    entry.stop = () => {
      stop.abort();
      reader?.cancel().catch(() => {});
    };
    entry.signal?.addEventListener("abort", entry.stop, { once: true });
    options.recoverStream(streamId, stop.signal)
      .then(async (response) => {
        if (stop.signal.aborted) throw abortError();
        reader = response.body?.getReader();
        for (let chunk = await reader?.read(); chunk && !chunk.done; chunk = await reader!.read()) {
          controller.enqueue(chunk.value);
        }
        controller.close();
      })
      .catch((failure: unknown) => {
        try {
          controller.error(stop.signal.aborted ? abortError() : failure);
        } catch {
          // the reader is gone
        }
      });
  };

  const loseAll = (error: PersonaTransportError) => {
    for (const id of [...entries.keys()]) loseStream(id, error);
  };

  /** Buffer for a stream the socket heard about before anyone claimed it. */
  const pendingFor = (streamId: string) => {
    let pending = unclaimed.get(streamId);
    if (!pending) {
      pending = { chunks: [], cursor: null, ended: null, expires: 0 };
      unclaimed.set(streamId, pending);
    }
    pending.expires = Date.now() + UNCLAIMED_TTL_MS;
    return pending;
  };

  const deliver = (streamId: string, sse: string) => {
    const entry = entries.get(streamId);
    if (entry) {
      if (!entry.replaying) enqueue(entry, sse);
      return;
    }
    const stale = unclaimed.get(streamId);
    // A frame after an unclaimed stream ended starts its next leg (a resumed turn): the claim reads both legs, unended.
    if (stale) {
      stale.ended = null;
      stale.error = undefined;
    }
    const first = !stale?.chunks.length;
    const pending = pendingFor(streamId);
    if (pending.chunks.length < MAX_UNCLAIMED_CHUNKS) pending.chunks.push(sse);
    if (first) options.onUnclaimedStream?.(streamId);
  };

  const isLost = (reason: string | null | undefined) =>
    reason === "error" || reason === "detached" || reason === "refused";

  const endStream = (streamId: string, reason: string | undefined) => {
    if (reason === "refused") refused.add(streamId);
    const entry = entries.get(streamId);
    // INVARIANT: before the ack, only a refusal is the attach's own; other ends are the replaced relay's.
    if (entry?.replaying && reason !== "refused") return;
    if (entry) {
      if (isLost(reason)) {
        loseStream(streamId, unavailable(`Stream ${reason}`, true));
      } else {
        finish(streamId, "close");
      }
      return;
    }
    pendingFor(streamId).ended = reason ?? "complete";
  };

  const handleInbound = (item: WebSocketTransportInbound) => {
    switch (item.kind) {
      case "ready":
        if (item.heartbeatMs) heartbeatMs = item.heartbeatMs;
        markReady();
        return;
      case "sse":
        deliver(item.streamId, item.sse);
        return;
      case "events":
        deliver(item.streamId, sseFromEvents(item.events, item.id));
        return;
      case "end":
        endStream(item.streamId, item.reason);
        return;
      case "attached": {
        const entry = entries.get(item.streamId);
        if (entry) entry.replaying = false;
        return;
      }
      case "error": {
        const error = new PersonaTransportError("stream_error", item.message || item.code || "Stream error", true);
        if (item.streamId && recoverable(entries.get(item.streamId))) loseStream(item.streamId, error);
        else if (item.streamId && entries.has(item.streamId)) finish(item.streamId, error);
        else if (item.streamId) pendingFor(item.streamId).error = error;
        else options.onError?.(error);
        if (item.fatal) ws?.close(1011, "fatal error");
        return;
      }
      case "message":
        options.onMessage?.(item.message);
        return;
    }
  };

  const onMessage = (event: { data: unknown }) => {
    lastInbound = Date.now();
    const data = event.data;
    if (typeof data !== "string" && !(data instanceof ArrayBuffer) &&
        !(typeof Blob !== "undefined" && data instanceof Blob)) return;
    let decoded: ReturnType<WebSocketTransportCodec["decode"]>;
    try {
      decoded = codec.decode(data);
    } catch (error) {
      report("protocol", `Could not decode a socket message: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (!decoded) return;
    for (const item of Array.isArray(decoded) ? decoded : [decoded]) handleInbound(item);
  };

  const markReady = () => {
    if (ready || !ws) return;
    ready = true;
    attempt = 0;
    setState("open");
    startHeartbeat();
    // Streams opened before this socket existed must be attached explicitly.
    for (const [id, entry] of entries) {
      if (entry.generation === generation) continue;
      if (codec.attach && sendRaw(codec.attach(id, entry.cursor))) entry.generation = generation;
      else loseStream(id, unavailable("The stream could not be reattached.", true));
    }
    settleConnect?.();
  };

  const scheduleReconnect = () => {
    if (destroyed || disabled || suspended || reconnectTimer || connecting) return;
    if (attempt >= backoff.length) {
      loseAll(unavailable("The socket could not be re-established.", true));
      return;
    }
    const delay = backoff[attempt++];
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect().catch(() => scheduleReconnect());
    }, delay);
  };

  const handleClose = (code: number, reason: string) => {
    if (!ws) return;
    const closing = ws;
    closing.onopen = closing.onmessage = closing.onclose = closing.onerror = null;
    ws = null;
    ready = false;
    stopHeartbeat();
    const action: WebSocketTransportCloseAction = codec.classifyClose?.(code, reason) ??
      (code === 1008 || code === 1009 || code === 1003 ? "stop" : "reconnect");
    const failure = new PersonaTransportError(
      action === "disable" ? "disabled" : action === "reauth" ? "unauthorized" : "unavailable",
      `Socket closed (${code}${reason ? `: ${reason}` : ""})`,
      action !== "disable" && action !== "stop"
    );
    settleConnect?.(failure);
    if (action === "disable") {
      disabled = failure;
      setState("disabled");
      loseAll(failure);
      return;
    }
    setState("closed");
    if (suspended || destroyed) return;
    if (action === "stop") {
      loseAll(failure);
      return;
    }
    if (!entries.size && !wanted) return;
    if (action === "reauth" && options.reauthenticate) {
      options.reauthenticate().then(scheduleReconnect, () => {
        loseAll(new PersonaTransportError("unauthorized", "Credentials could not be renewed."));
      });
      return;
    }
    scheduleReconnect();
  };

  const waitForPrerender = (): Promise<void> => {
    const d = doc as (Document & { prerendering?: boolean }) | undefined;
    if (!d?.prerendering) return Promise.resolve();
    return new Promise((resolve) =>
      d.addEventListener("prerenderingchange", () => resolve(), { once: true }));
  };

  const connect = (): Promise<void> => {
    if (destroyed) return Promise.reject(unavailable("The transport was destroyed."));
    if (disabled) return Promise.reject(disabled);
    if (ready) return Promise.resolve();
    if (connecting) return connecting;
    if (!Ctor) return Promise.reject(unavailable("WebSocket is not available."));
    suspended = false;
    setState("connecting");
    const pending = new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let socket: WebSocketLike | null = null;
      const settle = (error?: PersonaTransportError) => {
        if (settleConnect !== settle) return;
        settleConnect = null;
        if (timer) clearTimeout(timer);
        if (connecting === pending) connecting = null;
        if (error) reject(error);
        else resolve();
      };
      settleConnect = settle;
      const current = () => settleConnect === settle && !destroyed;
      (async () => {
        await waitForPrerender();
        if (!current()) return;
        timer = setTimeout(() => {
          settle(unavailable("Timed out opening the socket.", true));
          if (socket && ws === socket) handleClose(4008, "connect timeout");
          socket?.close(4008, "connect timeout");
        }, connectTimeoutMs);
        const url = typeof options.url === "function" ? await options.url() : options.url;
        const protocols = typeof options.protocols === "function" ? await options.protocols() : options.protocols;
        if (!current()) return;
        // pagehide while the URL or credentials resolved: opening now would keep the page out of the bfcache.
        if (suspended) throw unavailable("The page was hidden.", true);
        const opened = new Ctor(url, protocols);
        socket = opened;
        opened.binaryType = "arraybuffer";
        ws = opened;
        generation += 1;
        lastInbound = Date.now();
        opened.onopen = () => {
          if (ws !== opened) return;
          for (const message of codec.open?.() ?? []) sendRaw(message);
          if (!options.awaitReady) markReady();
        };
        opened.onmessage = (event) => {
          if (ws === opened) onMessage(event);
        };
        opened.onerror = () => {
          // The close event that follows carries the code; nothing to do here.
        };
        opened.onclose = (event) => {
          if (ws === opened) handleClose(event.code, event.reason);
        };
      })().catch((error: unknown) => {
        settle(error instanceof PersonaTransportError
          ? error
          : unavailable(error instanceof Error ? error.message : String(error), true));
      });
    });
    connecting = pending;
    return pending;
  };

  const close = (code = 1000, reason = "client closed") => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    const socket = ws;
    if (socket) {
      handleClose(code, reason);
      try {
        socket.close(code, reason);
      } catch {
        // ignore
      }
    }
  };

  const claim = (
    streamId: string,
    claimOptions: { signal?: AbortSignal; after?: string | null; replay?: boolean; handedOff?: boolean } = {}
  ): Response => {
    const { signal } = claimOptions;
    const existing = entries.get(streamId);
    if (existing) finish(streamId, abortError());
    const pending = claimOptions.replay ? undefined : unclaimed.get(streamId);
    unclaimed.delete(streamId);
    let entry!: StreamEntry;
    const onAbort = () => {
      sendRaw(codec.detach?.(streamId));
      finish(streamId, abortError());
    };
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        entry = {
          controller,
          cursor: claimOptions.after ?? null,
          generation: ready ? generation : -1,
          release: () => signal?.removeEventListener("abort", onAbort),
          replaying: !!claimOptions.replay && !!codec.acknowledgesAttach,
          handedOff: claimOptions.handedOff,
          signal,
        };
      },
      cancel() {
        entry.stop?.();
        if (entries.get(streamId) !== entry) return;
        sendRaw(codec.detach?.(streamId));
        entries.delete(streamId);
        entry.release();
        maybeIdle();
      },
    });
    entries.set(streamId, entry);
    if (pending) {
      for (const chunk of pending.chunks) enqueue(entry, chunk);
      if (pending.error) finish(streamId, pending.error);
      else if (pending.ended) endStream(streamId, pending.ended);
    }
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
    if (entries.has(streamId) && !ready) {
      // The socket dropped before this stream was claimed: reattach on reconnect, if it can come back.
      if (disabled || destroyed) loseStream(streamId, disabled ?? unavailable("The transport was destroyed."));
      else if (!connecting) scheduleReconnect();
    }
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream", "X-Persona-Transport": "websocket" },
    });
  };

  const withTimeout = <T,>(promise: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(unavailable("Timed out opening the socket.", true)),
          connectTimeoutMs);
      }),
    ]).finally(() => clearTimeout(timer));
  };

  const request = async (req: PersonaTransportRequest, next: PersonaTransportNext): Promise<Response> => {
    req.init.signal?.throwIfAborted();
    // Reattach: replay strictly after the cursor over the socket when possible.
    if (req.kind === "reconnect" && req.executionId && refused.has(req.executionId)) return next(req);
    if (req.kind === "reconnect" && req.executionId && codec.attach && !disabled) {
      try {
        await withTimeout(connect());
      } catch {
        return next(req);
      }
      const response = claim(req.executionId, { signal: req.init.signal ?? undefined, after: req.after ?? null, replay: true });
      const entry = entries.get(req.executionId);
      if (entry) {
        sendRaw(codec.attach(req.executionId, req.after ?? null));
        entry.generation = generation;
      }
      return response;
    }
    if (codec.encode) {
      try {
        await withTimeout(connect());
      } catch (error) {
        if (options.httpFallback) return next(req);
        throw error;
      }
      req.init.signal?.throwIfAborted();
      const streamId = `s${++streamCounter}`;
      const messages = codec.encode(req, { streamId });
      if (!messages) return next(req);
      const response = claim(streamId, { signal: req.init.signal ?? undefined });
      for (const message of Array.isArray(messages) ? messages : [messages]) {
        if (!sendRaw(message)) {
          finish(streamId, unavailable("The socket closed before the request was sent.", true));
          break;
        }
      }
      return response;
    }
    // A request that races the socket's open (a resume right after a page
    // load, a send after the idle close) waits briefly instead of going to SSE.
    if (!ready && !disabled && !destroyed && codec.prepare) {
      const opening = connect().catch(() => undefined);
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([opening, new Promise((resolve) => (timer = setTimeout(resolve, PREPARE_CONNECT_WAIT_MS)))]);
      clearTimeout(timer);
    }
    const socketReady = ready && !disabled;
    const prepared = socketReady && codec.prepare ? codec.prepare(req) : req;
    const response = await next(prepared);
    if (!socketReady || !codec.accept || prepared === req && codec.prepare) return response;
    const streamId = await codec.accept(response, prepared);
    if (!streamId) return response;
    const signal = req.init.signal ?? undefined;
    const early = unclaimed.get(streamId);
    // The socket can no longer carry a stream the backend handed it (disabled, or refused before any data).
    if (options.recoverStream && (disabled || destroyed || (early && !early.chunks.length && (early.error || isLost(early.ended))))) {
      unclaimed.delete(streamId);
      return options.recoverStream(streamId, signal);
    }
    return claim(streamId, { signal, handedOff: true });
  };

  // ---- Idle and page lifecycle ----------------------------------------------

  const clearIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  };

  function maybeIdle() {
    clearIdle();
    if (!doc || doc.visibilityState !== "hidden" || entries.size || !ws) return;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (!entries.size && doc?.visibilityState === "hidden") {
        wanted = false;
        close(1000, "idle");
      }
    }, idleCloseMs);
  }

  const onVisibility = () => {
    if (doc?.visibilityState === "hidden") {
      maybeIdle();
      return;
    }
    clearIdle();
    if ((wanted || entries.size) && !ws && !disabled) connect().catch(() => {});
  };
  const onPageHide = () => {
    // An open socket keeps a page out of the back/forward cache.
    suspended = true;
    clearIdle();
    close(1000, "pagehide");
  };
  const onPageShow = (event: Event) => {
    if (!(event as PageTransitionEvent).persisted) return;
    suspended = false;
    if (wanted && !disabled) connect().catch(() => {});
  };
  const onOnline = () => {
    if (entries.size && !ws && !disabled && !connecting) {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      attempt = 0;
      connect().catch(() => scheduleReconnect());
    }
  };
  lifecycle?.addEventListener("pagehide", onPageHide);
  lifecycle?.addEventListener("pageshow", onPageShow);
  lifecycle?.addEventListener("online", onOnline);
  doc?.addEventListener("visibilitychange", onVisibility);

  const pruneUnclaimed = setInterval(() => {
    const now = Date.now();
    for (const [id, pending] of unclaimed) if (pending.expires < now) unclaimed.delete(id);
  }, UNCLAIMED_TTL_MS);

  return {
    get state() {
      return state;
    },
    isReady: () => ready && !disabled,
    connect,
    close,
    send: sendRaw,
    claim,
    isClaimed: (streamId) => entries.has(streamId),
    streams: () => [...entries.keys()],
    cursor: (streamId) => entries.get(streamId)?.cursor ?? endedCursors.get(streamId) ?? null,
    request,
    warm(_reason: PersonaTransportWarmReason) {
      if (destroyed || disabled) return;
      wanted = true;
      connect().catch(() => {});
    },
    destroy() {
      if (destroyed) return;
      wanted = false;
      close(1000, "destroyed");
      destroyed = true;
      clearIdle();
      clearInterval(pruneUnclaimed);
      lifecycle?.removeEventListener("pagehide", onPageHide);
      lifecycle?.removeEventListener("pageshow", onPageShow);
      lifecycle?.removeEventListener("online", onOnline);
      doc?.removeEventListener("visibilitychange", onVisibility);
      loseAll(unavailable("The transport was destroyed."));
      unclaimed.clear();
    },
  };
}
