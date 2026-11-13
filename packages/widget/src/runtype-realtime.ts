/**
 * Runtype client-session socket (`runtype-client-session-v1`) on top of the
 * generic WebSocket transport. "Socket down, HTTP up": chat and resume stay on
 * `/v1/client/chat` and `/v1/client/resume`; while the socket is ready they
 * carry `delivery: "socket"`, and a `202` JSON answer means the execution's
 * frames arrive on the socket. A `200 text/event-stream` answer is consumed as
 * before, which is the whole fallback. Reconnects attach with a cursor.
 */
import {
  createWebSocketTransport,
  type WebSocketLikeConstructor,
  type WebSocketTransport,
  type WebSocketTransportCodec,
  type WebSocketTransportInbound,
  type WebSocketTransportOptions,
} from "./websocket-transport-core";
import type { PersonaTransport, PersonaTransportRequest } from "./transport";
import type { RuntypeClientChatRequest, RuntypeClientResumeRequest } from "./generated/runtype-openapi-contract";

export const RUNTYPE_CLIENT_SESSION_PROTOCOL = "runtype-client-session-v1";
export const RUNTYPE_BEARER_SUBPROTOCOL = "runtype.bearer";

/** The `realtime` advertisement from `POST /v1/client/init`. */
export type RuntypeRealtimeAdvertisement = { protocol: string; url: string };

export type RuntypeRealtimeHost = {
  advertisement: RuntypeRealtimeAdvertisement;
  clientToken: string;
  /** `persona/<version>`. */
  clientVersion: string;
  /** The live session id (read at every connect). */
  sessionId(): string;
  /** The visitor credential that owns the conversation. */
  visitorToken(): Promise<string | null>;
  /** Close code 4401: re-initialize the session before reconnecting. */
  renewSession(): Promise<void>;
  /**
   * A turn this tab did not start is streaming on the conversation. Call
   * `open()` to receive it as an SSE response; return false to ignore it.
   */
  onForeignExecution?(executionId: string, open: () => Response): boolean;
  /** `signal` frames (e.g. `conversation_changed`): refetch over HTTP. */
  onSignal?(name: string, revision?: string): void;
  /** Close code 4403 or a protocol mismatch: stop using the socket. */
  onDisabled?(): void;
  /** A turn handed to the socket that the socket cannot carry: serve it from its start over HTTP. */
  recoverStream?: WebSocketTransportOptions["recoverStream"];
  WebSocket?: WebSocketLikeConstructor;
  lifecycle?: WebSocketTransportOptions["lifecycle"];
  idleCloseMs?: number;
  connectTimeoutMs?: number;
  backoffMs?: number[];
};

export type RuntypeRealtimeTransport = PersonaTransport & {
  readonly socket: WebSocketTransport;
  readonly advertisement: RuntypeRealtimeAdvertisement;
  /** True once `hello` arrived on the current socket. */
  isReady(): boolean;
  /** True after a 4403 (or a protocol mismatch); the session must use SSE. */
  isDisabled(): boolean;
  /**
   * Tell the server the page is about to unload on purpose and wait (bounded)
   * for `navigating-ack`. Resolves false when the socket is closed or the ack
   * did not arrive in time; never rejects.
   */
  navigating(info: { executionId?: string; url?: string }, timeoutMs?: number): Promise<boolean>;
};

type ServerFrame = { type?: unknown; ch?: unknown; [key: string]: unknown };

const isSocketDeliveryRoute = (request: PersonaTransportRequest) =>
  (request.kind === "dispatch" || request.kind === "resume") &&
  !!request.body &&
  /\/v1\/client\/(chat|resume)$/.test(request.url.split("?")[0]);

/** Build the connect URL: credentials never ride the query string. */
export function runtypeRealtimeUrl(
  advertisement: RuntypeRealtimeAdvertisement,
  sessionId: string,
  clientVersion: string
): string {
  const url = new URL(advertisement.url);
  url.searchParams.set("protocol", RUNTYPE_CLIENT_SESSION_PROTOCOL);
  url.searchParams.set("sessionId", sessionId);
  url.searchParams.set("clientVersion", clientVersion);
  return url.toString();
}

export function createRuntypeCodec(handlers: {
  onFrame?: (frame: ServerFrame) => void;
  onProtocolMismatch?: () => void;
} = {}): WebSocketTransportCodec {
  return {
    acknowledgesAttach: true,
    decode(data) {
      // Binary frames are reserved for voice on this socket.
      if (typeof data !== "string") return null;
      const frame = JSON.parse(data) as ServerFrame;
      if (!frame || typeof frame !== "object" || frame.ch !== undefined) return null;
      const executionId = typeof frame.executionId === "string" ? frame.executionId : undefined;
      switch (frame.type) {
        case "hello": {
          if (frame.protocolVersion !== RUNTYPE_CLIENT_SESSION_PROTOCOL) {
            handlers.onProtocolMismatch?.();
            return null;
          }
          const beat = typeof frame.beatIntervalMs === "number" && frame.beatIntervalMs > 0
            ? frame.beatIntervalMs : undefined;
          return [{ kind: "ready", heartbeatMs: beat }, { kind: "message", message: frame }];
        }
        case "frame":
          return executionId && typeof frame.sse === "string"
            ? { kind: "sse", streamId: executionId, sse: frame.sse }
            : null;
        case "attach_end":
          return executionId
            ? { kind: "end", streamId: executionId, reason: typeof frame.reason === "string" ? frame.reason : undefined }
            : null;
        case "error":
          // The socket cannot serve this execution (e.g. an attach before the server knew of it): use HTTP.
          if (executionId && frame.code === "execution_not_found") {
            return { kind: "end", streamId: executionId, reason: "refused" };
          }
          return {
            kind: "error",
            ...(executionId ? { streamId: executionId } : {}),
            code: typeof frame.code === "string" ? frame.code : "internal",
            message: typeof frame.message === "string" ? frame.message : "Socket error",
          } satisfies WebSocketTransportInbound;
        case "execution":
        case "signal":
        case "navigating-ack":
        case "beat-ack":
          return { kind: "message", message: frame };
        case "attached":
          return executionId
            ? [{ kind: "attached", streamId: executionId }, { kind: "message", message: frame }]
            : { kind: "message", message: frame };
        default:
          return null;
      }
    },
    prepare(request) {
      if (!isSocketDeliveryRoute(request)) return request;
      const body: Record<string, unknown> & Pick<RuntypeClientChatRequest & RuntypeClientResumeRequest, "delivery"> =
        { ...request.body, delivery: "socket" };
      return { ...request, body, init: { ...request.init, body: JSON.stringify(body) } };
    },
    async accept(response) {
      if (response.status !== 202) return null;
      if (!(response.headers.get("content-type") ?? "").includes("json")) return null;
      const data = (await response.clone().json().catch(() => null)) as
        | { executionId?: unknown; delivery?: unknown }
        | null;
      return data?.delivery === "socket" && typeof data.executionId === "string" ? data.executionId : null;
    },
    attach: (executionId, after) => JSON.stringify({ type: "attach", executionId, after: after ?? null }),
    detach: (executionId) => JSON.stringify({ type: "detach", executionId }),
    heartbeat: '{"type":"beat"}',
    classifyClose(code) {
      if (code === 4401) return "reauth";
      if (code === 4403) return "disable";
      if (code === 4429 || code === 1008 || code === 1009) return "stop";
      return "reconnect";
    },
  };
}

export function createRuntypeRealtimeTransport(host: RuntypeRealtimeHost): RuntypeRealtimeTransport {
  const own = new Set<Promise<unknown>>();
  const ignored = new Set<string>();
  // Executions this tab's requests addressed (resume, approve, reconnect).
  const mine = new Set<string>();
  // `turnId`s this tab's dispatches carried; the server echoes them as `clientTurnId`.
  const turns = new Set<string>();
  // `clientTurnId` of each started execution, for frames that arrive before anything claims it.
  const turnOf = new Map<string, unknown>();
  // INVARIANT: a tab claims only an execution it can name, by execution id or by the turn id the server echoes.
  const ours = (executionId: string, clientTurnId: unknown): boolean =>
    mine.has(executionId) || (typeof clientTurnId === "string" && turns.has(clientTurnId));
  const ackWaiters = new Set<() => void>();
  let mismatch = false;

  const adoptLater = (executionId: string) => {
    if (ignored.has(executionId)) return;
    // Let this tab's own requests claim their executions first.
    const pending = [...own];
    void Promise.allSettled(pending).then(() => setTimeout(() => {
      if (socket.isClaimed(executionId) || ignored.has(executionId)) return;
      const adopted = !ours(executionId, turnOf.get(executionId)) && !!host.onForeignExecution?.(executionId, () =>
        socket.claim(executionId, { after: null }));
      if (!adopted) {
        ignored.add(executionId);
        const detach = codec.detach?.(executionId);
        if (detach) socket.send(detach);
      }
    }, 0));
  };

  const onFrame = (message: unknown) => {
    const frame = message as ServerFrame;
    const executionId = typeof frame.executionId === "string" ? frame.executionId : undefined;
    switch (frame.type) {
      case "hello":
        // A turn that started while this page was navigating: attach from the start.
        if (typeof frame.activeExecutionId === "string") {
          const active = frame.activeExecutionId;
          void Promise.allSettled([...own]).then(() => setTimeout(() => {
            if (socket.isClaimed(active) || ignored.has(active)) return;
            const adopted = !ours(active, frame.activeClientTurnId) && !!host.onForeignExecution?.(active, () => {
              const response = socket.claim(active, { after: null, replay: true });
              const attach = codec.attach?.(active, null);
              if (attach) socket.send(attach);
              return response;
            });
            if (!adopted) ignored.add(active);
          }, 0));
        }
        return;
      case "execution":
        if (executionId && frame.state === "started") {
          turnOf.set(executionId, frame.clientTurnId);
          adoptLater(executionId);
        }
        if (executionId && frame.state === "ended") {
          ignored.delete(executionId);
          turnOf.delete(executionId);
        }
        return;
      case "signal":
        if (typeof frame.name === "string") {
          host.onSignal?.(frame.name, typeof frame.revision === "string" ? frame.revision : undefined);
        }
        return;
      case "navigating-ack":
        for (const done of [...ackWaiters]) done();
        return;
    }
  };

  const codec = createRuntypeCodec({
    onProtocolMismatch: () => {
      mismatch = true;
      socket.close(4403, "protocol mismatch");
    },
  });

  const socket = createWebSocketTransport({
    url: () => runtypeRealtimeUrl(host.advertisement, host.sessionId(), host.clientVersion),
    protocols: async () => {
      const visitor = await host.visitorToken();
      if (!visitor) throw new Error("The realtime socket needs the visitor credential.");
      return [RUNTYPE_BEARER_SUBPROTOCOL, host.clientToken, visitor];
    },
    codec,
    awaitReady: true,
    onStreamLost: "close",
    reauthenticate: () => host.renewSession(),
    ...(host.recoverStream ? { recoverStream: host.recoverStream } : {}),
    onMessage: onFrame,
    onUnclaimedStream: adoptLater,
    onStateChange: (state) => {
      if (state === "disabled") host.onDisabled?.();
    },
    ...(host.WebSocket ? { WebSocket: host.WebSocket } : {}),
    ...(host.lifecycle !== undefined ? { lifecycle: host.lifecycle } : {}),
    ...(host.idleCloseMs !== undefined ? { idleCloseMs: host.idleCloseMs } : {}),
    ...(host.connectTimeoutMs !== undefined ? { connectTimeoutMs: host.connectTimeoutMs } : {}),
    ...(host.backoffMs ? { backoffMs: host.backoffMs } : {}),
  });

  return {
    socket,
    advertisement: host.advertisement,
    isReady: () => socket.isReady(),
    isDisabled: () => mismatch || socket.state === "disabled",
    request(request, next) {
      if (request.executionId) mine.add(request.executionId);
      const turnId = request.kind === "dispatch" ? request.body?.turnId : undefined;
      if (typeof turnId === "string") turns.add(turnId);
      const pending = socket.request(request, next);
      own.add(pending);
      const settle = () => own.delete(pending);
      pending.then(settle, settle);
      return pending;
    },
    warm: (reason) => socket.warm?.(reason),
    destroy: () => socket.destroy?.(),
    navigating(info, timeoutMs = 150) {
      if (!socket.isReady()) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        const done = (acked: boolean) => {
          ackWaiters.delete(onAck);
          clearTimeout(timer);
          resolve(acked);
        };
        const onAck = () => done(true);
        const timer = setTimeout(() => done(false), timeoutMs);
        ackWaiters.add(onAck);
        const sent = socket.send(JSON.stringify({
          type: "navigating",
          ...(info.executionId ? { executionId: info.executionId } : {}),
          ...(info.url ? { url: info.url } : {}),
        }));
        if (!sent) done(false);
      });
    },
  };
}

/** The `AgentWidgetClient` members the client-session controller drives. */
export type RuntypeRealtimeClient = {
  getClientSession(): { sessionId: string; realtime?: { url: string } | undefined } | null;
  clearClientSession(): void;
  initSession(): Promise<unknown>;
  reconnectClientTokenStream(ctx: { executionId: string; after: string; signal: AbortSignal }): Promise<Response>;
};

/** Hooks a session installs for turns from other tabs and out-of-band signals. */
export type RuntypeRealtimeHandlers = Pick<RuntypeRealtimeHost, "onForeignExecution" | "onSignal">;

export type RuntypeRealtimeController = {
  /** The transport for `advertisement`, created on first use; null once disabled. */
  ensure(advertisement: RuntypeRealtimeAdvertisement): RuntypeRealtimeTransport | null;
  /** The live transport for `advertisement`, or null. Drops a transport for another URL. */
  current(advertisement: RuntypeRealtimeAdvertisement | null): RuntypeRealtimeTransport | null;
  /** True after the socket at `url` refused this session (4403). */
  disabled(url: string): boolean;
  destroy(): void;
};

/**
 * One `AgentWidgetClient`'s client-session socket: keyed by the advertised URL
 * (it changes with the conversation), renewing the session on 4401 and
 * remembering a 4403 so the client stays on SSE for that URL.
 */
export function createRuntypeRealtimeController(
  client: RuntypeRealtimeClient,
  options: {
    clientToken: string;
    clientVersion: string;
    visitorToken(): Promise<string | null>;
    handlers(): RuntypeRealtimeHandlers;
    idleCloseMs?: number;
  }
): RuntypeRealtimeController {
  let transport: RuntypeRealtimeTransport | null = null;
  const refused = new Set<string>();
  const current = (advertisement: RuntypeRealtimeAdvertisement | null) => {
    if (transport && (!advertisement || transport.isDisabled() || transport.advertisement.url !== advertisement.url)) {
      transport.destroy?.();
      transport = null;
    }
    return transport;
  };
  return {
    current,
    ensure(advertisement) {
      if (refused.has(advertisement.url)) return null;
      return current(advertisement) ?? (transport = createRuntypeRealtimeTransport({
        advertisement,
        clientToken: options.clientToken,
        clientVersion: options.clientVersion,
        sessionId: () => client.getClientSession()?.sessionId ?? "",
        visitorToken: options.visitorToken,
        renewSession: async () => {
          client.clearClientSession();
          await client.initSession();
          // A revoked visitor (4401 after a visitor reset) comes back with a new
          // conversation: this socket's URL is gone, so stop rather than retry it.
          if (client.getClientSession()?.realtime?.url !== advertisement.url) throw new Error("moved");
        },
        onForeignExecution: (id, open) => options.handlers().onForeignExecution?.(id, open) ?? false,
        onSignal: (name, revision) => options.handlers().onSignal?.(name, revision),
        onDisabled: () => refused.add(advertisement.url),
        // A 202 turn the socket cannot carry: read it over the events route from its start.
        recoverStream: (executionId, signal) =>
          client.reconnectClientTokenStream({ executionId, after: "", signal: signal ?? new AbortController().signal }),
        ...(options.idleCloseMs !== undefined ? { idleCloseMs: options.idleCloseMs } : {}),
      }));
    },
    disabled: (url) => refused.has(url),
    destroy() {
      transport?.destroy?.();
      transport = null;
    },
  };
}
