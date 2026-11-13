import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRuntypeCodec,
  createRuntypeRealtimeController,
  createRuntypeRealtimeTransport,
  runtypeRealtimeUrl,
  type RuntypeRealtimeHost,
} from "./runtype-realtime";
import type { PersonaTransportRequest } from "./transport";
import { FakeWebSocket, readAvailable } from "./testing/fake-websocket";
import { readFileSync } from "node:fs";
import { fixturePath, socketFixture } from "./__fixtures__/runtype-client-session";
import { AgentWidgetClient } from "./client";
import type { AgentWidgetEvent, ClientSession } from "./types";
import { createVisitorStore } from "./utils/visitor-store";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
/** A server fixture re-stamped for this test's execution (fixtures use the server's ids). */
const frameJson = (name: string, executionId = "exec_1") => {
  const fixture = socketFixture<Record<string, unknown>>(name);
  return JSON.stringify("executionId" in fixture ? { ...fixture, executionId } : fixture);
};
const advertisement = socketFixture<{ protocol: string; url: string }>("http/init-realtime");

const sseFrame = (id: number, type: string, data: Record<string, unknown> = {}) =>
  `id: ${id}\nevent: ${type}\ndata: ${JSON.stringify({ type, executionId: "exec_1", ...data })}\n\n`;
const frame = (sse: string, executionId = "exec_1") => ({ type: "frame", executionId, sse });

const chatRequest = (turnId?: string, signal?: AbortSignal): PersonaTransportRequest => {
  const body = { sessionId: "sess_1", messages: [], ...(turnId ? { turnId } : {}) };
  return {
    kind: "dispatch",
    url: "https://api.example.test/v1/client/chat",
    body,
    init: { method: "POST", body: JSON.stringify(body), ...(signal ? { signal } : {}) },
  };
};
const abortedFetch = async () => {
  throw new DOMException("The operation was aborted.", "AbortError");
};
const started = (executionId: string, clientTurnId?: string) =>
  JSON.stringify({ type: "execution", executionId, state: "started", ...(clientTurnId ? { clientTurnId } : {}) });
const accepted = () =>
  new Response(JSON.stringify({ ...socketFixture("http/chat-202"), executionId: "exec_1" }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });

function makeTransport(overrides: Partial<RuntypeRealtimeHost> = {}) {
  const host: RuntypeRealtimeHost = {
    advertisement,
    clientToken: "ct_live_abc",
    clientVersion: "persona/9.9.9",
    sessionId: () => "sess_1",
    visitorToken: async () => "cvt_visitor",
    renewSession: vi.fn(async () => {}),
    WebSocket: FakeWebSocket,
    lifecycle: null,
    backoffMs: [5, 5],
    connectTimeoutMs: 500,
    ...overrides,
  };
  return { host, transport: createRuntypeRealtimeTransport(host) };
}

async function helloed(transport: ReturnType<typeof makeTransport>["transport"], hello = "server/hello") {
  const connected = transport.socket.connect();
  await flush();
  const socket = FakeWebSocket.last();
  socket.open();
  socket.receive(frameJson(hello));
  await connected;
  return socket;
}

beforeEach(() => FakeWebSocket.reset());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("runtype-client-session-v1: connect", () => {
  it("connects to the advertised URL with protocol, sessionId and clientVersion, and the bearer subprotocols in order", async () => {
    const { transport } = makeTransport();
    await helloed(transport);
    const socket = FakeWebSocket.last();
    const url = new URL(socket.url);
    expect(`${url.origin}${url.pathname}`).toBe(advertisement.url);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      protocol: "runtype-client-session-v1",
      sessionId: "sess_1",
      clientVersion: "persona/9.9.9",
    });
    expect(socket.protocols).toEqual(["runtype.bearer", "ct_live_abc", "cvt_visitor"]);
    expect(socket.url).not.toContain("ct_live_abc");
    expect(socket.url).not.toContain("cvt_visitor");
    transport.destroy?.();
  });

  it("keeps an existing query string on the advertised URL", () => {
    expect(runtypeRealtimeUrl({ protocol: "x", url: "wss://h.test/ws?region=us" }, "s", "persona/1")).toBe(
      "wss://h.test/ws?region=us&protocol=runtype-client-session-v1&sessionId=s&clientVersion=persona%2F1"
    );
  });

  it("is not ready until hello, and heartbeats exactly {\"type\":\"beat\"} every beatIntervalMs", async () => {
    vi.useFakeTimers();
    const { transport } = makeTransport();
    const connected = transport.socket.connect();
    await vi.advanceTimersByTimeAsync(0);
    const socket = FakeWebSocket.last();
    socket.open();
    expect(transport.isReady()).toBe(false);
    socket.receive({ ...socketFixture<Record<string, unknown>>("server/hello"), beatIntervalMs: 1000 });
    await connected;
    expect(transport.isReady()).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    socket.receive(frameJson("server/beat-ack"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(socket.sent.filter((f) => f === '{"type":"beat"}')).toHaveLength(2);
    expect(socket.sent.every((f) => f === '{"type":"beat"}')).toBe(true);
    transport.destroy?.();
  });

  it("disables itself on a hello with another protocol version", async () => {
    const onDisabled = vi.fn();
    const { transport } = makeTransport({ onDisabled });
    const connected = transport.socket.connect().catch((error) => error);
    await flush();
    FakeWebSocket.last().open();
    FakeWebSocket.last().receive({ ...socketFixture<Record<string, unknown>>("server/hello"), protocolVersion: "runtype-client-session-v2" });
    await flush();
    expect(transport.isDisabled()).toBe(true);
    expect(FakeWebSocket.last().closedWith?.code).toBe(4403);
    await connected;
    transport.destroy?.();
  });
});

describe("runtype-client-session-v1: frames", () => {
  it("decodes every server frame type from the fixtures", () => {
    const codec = createRuntypeCodec();
    const decode = (name: string) => codec.decode(JSON.stringify(socketFixture(name)));
    const exec = socketFixture<{ executionId: string }>("server/frame").executionId;
    expect(decode("server/hello")).toEqual([
      { kind: "ready", heartbeatMs: 25000 },
      { kind: "message", message: socketFixture("server/hello") },
    ]);
    for (const name of ["server/frame", "server/frame-batched"]) {
      expect(decode(name)).toEqual({ kind: "sse", streamId: exec, sse: socketFixture<{ sse: string }>(name).sse });
    }
    for (const reason of ["terminal", "paused", "detached", "error"]) {
      expect(decode(`server/attach_end-${reason}`)).toEqual({ kind: "end", streamId: exec, reason });
    }
    expect(decode("server/error-execution_not_found")).toEqual({ kind: "end", streamId: exec, reason: "refused" });
    for (const code of ["internal", "invalid_frame", "not_supported", "too_many_connections"]) {
      expect(decode(`server/error-${code}`)).toEqual({ kind: "error", code, message: code });
    }
    for (const name of [
      "execution-started",
      "execution-ended",
      "signal",
      "navigating-ack",
      "beat-ack",
    ]) {
      expect(decode(`server/${name}`)).toEqual({ kind: "message", message: socketFixture(`server/${name}`) });
    }
    for (const name of ["attached", "attached-from-start"]) {
      expect(decode(`server/${name}`)).toEqual([
        { kind: "attached", streamId: exec },
        { kind: "message", message: socketFixture(`server/${name}`) },
      ]);
    }
    expect(codec.decode(JSON.stringify({ type: "from_the_future" }))).toBeNull();
  });

  it("ignores binary frames and frames carrying a ch field (reserved for voice)", () => {
    const codec = createRuntypeCodec();
    expect(codec.decode(new ArrayBuffer(4))).toBeNull();
    expect(codec.decode(JSON.stringify({ ...socketFixture<Record<string, unknown>>("server/frame"), ch: "voice" }))).toBeNull();
  });

  it("encodes client frames exactly as the contract's fixtures", () => {
    const codec = createRuntypeCodec();
    const attach = socketFixture<{ executionId: string; after: string }>("client/attach");
    const fromStart = socketFixture<{ executionId: string }>("client/attach-from-start");
    const detach = socketFixture<{ executionId: string }>("client/detach");
    expect(JSON.parse(codec.attach!(attach.executionId, attach.after) as string)).toEqual(attach);
    expect(JSON.parse(codec.attach!(fromStart.executionId, null) as string)).toEqual(fromStart);
    expect(JSON.parse(codec.detach!(detach.executionId) as string)).toEqual(detach);
    expect(codec.heartbeat).toBe(readFileSync(fixturePath("client/beat"), "utf8"));
  });
});

describe("runtype-client-session-v1: delivery", () => {
  it("sends chat without delivery before hello and passes a 200 SSE answer through", async () => {
    const { transport } = makeTransport();
    const next = vi.fn(async (request: PersonaTransportRequest) => {
      expect(JSON.parse(String(request.init.body))).not.toHaveProperty("delivery");
      return new Response("data: {}\n\n", { status: 200, headers: { "Content-Type": "text/event-stream" } });
    });
    const response = await transport.request(chatRequest(), next);
    expect(await response.text()).toBe("data: {}\n\n");
    transport.destroy?.();
  });

  it("adds delivery:\"socket\" after hello and streams a 202 from socket frames in order", async () => {
    const { transport } = makeTransport();
    const socket = await helloed(transport);
    const next = vi.fn(async (request: PersonaTransportRequest) => {
      expect(JSON.parse(String(request.init.body))).toMatchObject({ delivery: "socket", sessionId: "sess_1" });
      expect(request.body).toMatchObject({ delivery: "socket" });
      // The socket can beat the HTTP answer: these frames are buffered until claimed.
      socket.receive(frameJson("server/execution-started"));
      socket.receive(frame(sseFrame(1, "text_delta", { id: "t", delta: "Hel" })));
      return accepted();
    });
    const response = await transport.request(chatRequest(), next);
    socket.receive(frame(sseFrame(2, "text_delta", { id: "t", delta: "lo" })));
    socket.receive(frame(sseFrame(3, "execution_complete", { success: true })));
    socket.receive(frameJson("server/attach_end-terminal"));
    const text = await response.text();
    expect(text).toMatch(/id: 1\n[\s\S]*id: 2\n[\s\S]*id: 3\n/);
    expect(text.indexOf("id: 1")).toBeLessThan(text.indexOf("id: 2"));
    expect(text.indexOf("id: 2")).toBeLessThan(text.indexOf("id: 3"));
    expect(text.match(/id: 1\n/g)).toHaveLength(1);
    transport.destroy?.();
  });

  it("consumes a 200 SSE answer even after hello (server chose not to use the socket)", async () => {
    const { transport } = makeTransport();
    await helloed(transport);
    const response = await transport.request(chatRequest(), async () =>
      new Response(sseFrame(1, "execution_complete"), { status: 200, headers: { "Content-Type": "text/event-stream" } })
    );
    expect(await response.text()).toContain("execution_complete");
    transport.destroy?.();
  });

  it("reads a socket-delivery /resume answered with a 200 SSE body to its end, claiming nothing on the socket", async () => {
    const onForeignExecution = vi.fn(() => true);
    const { transport } = makeTransport({ onForeignExecution });
    const socket = await helloed(transport);
    const next = vi.fn(async (_request: PersonaTransportRequest) => new Response(
      sseFrame(10, "text_delta", { id: "t", delta: "resumed reply" }) + sseFrame(11, "execution_complete"),
      { status: 200, headers: { "Content-Type": "text/event-stream" } }
    ));
    const response = await transport.request({
      kind: "resume",
      url: "https://api.example.test/v1/client/resume",
      executionId: "exec_1",
      body: { executionId: "exec_1", toolOutputs: {} },
      init: { method: "POST", body: JSON.stringify({ executionId: "exec_1", toolOutputs: {} }) },
    }, next);
    expect(JSON.parse(String(next.mock.calls[0][0].init.body))).toMatchObject({ delivery: "socket" });
    const text = await response.text();
    expect(text).toContain("resumed reply");
    expect(text).toContain("execution_complete");
    expect(transport.socket.isClaimed("exec_1")).toBe(false);
    // A started notice for the same execution is this tab's resume, not another tab's turn.
    socket.receive(frameJson("server/execution-started"));
    await flush();
    await flush();
    expect(onForeignExecution).not.toHaveBeenCalled();
    transport.destroy?.();
  });

  it("does not rewrite the history or events routes", async () => {
    const { transport } = makeTransport();
    await helloed(transport);
    const next = vi.fn(async (request: PersonaTransportRequest) => new Response(String(request.init.body ?? "")));
    await transport.request({ ...chatRequest(), kind: "approve", url: "https://api.example.test/v1/client/approve" }, next);
    expect(next.mock.calls[0][0].init.body).not.toContain("delivery");
    transport.destroy?.();
  });

  it("closes the stream on attach_end{paused} (the turn waits on /resume)", async () => {
    const { transport } = makeTransport();
    const socket = await helloed(transport);
    const response = await transport.request(chatRequest(), async () => accepted());
    socket.receive(frame(sseFrame(1, "await", { toolName: "navigate", toolCallId: "call_1" })));
    socket.receive(frameJson("server/attach_end-paused"));
    const text = await response.text();
    expect(text).toContain('"type":"await"');
    expect(transport.isReady()).toBe(true);
    transport.destroy?.();
  });

  it("ends the stream on a stream error frame and keeps the socket", async () => {
    const { transport } = makeTransport();
    const socket = await helloed(transport);
    const response = await transport.request(chatRequest(), async () => accepted());
    socket.receive(JSON.stringify({ type: "error", code: "internal", message: "boom", executionId: "exec_1" }));
    await expect(response.text()).rejects.toMatchObject({ code: "stream_error" });
    expect(transport.isReady()).toBe(true);
    transport.destroy?.();
  });
});

describe("runtype-client-session-v1: recovery", () => {
  it("reconnects after a drop and attaches after the last delivered cursor without duplicates", async () => {
    vi.useFakeTimers();
    const { transport } = makeTransport();
    const connected = transport.socket.connect();
    await vi.advanceTimersByTimeAsync(0);
    const first = FakeWebSocket.last();
    first.open();
    first.receive(frameJson("server/hello"));
    await connected;
    const response = await transport.request(chatRequest(), async () => accepted());
    const reader = response.body!.getReader();
    first.receive(frame(sseFrame(41, "text_delta", { id: "t", delta: "a" })));
    expect(await readAvailable(reader, 1)).toContain("id: 41");
    first.serverClose(1006);
    await vi.advanceTimersByTimeAsync(5);
    const second = FakeWebSocket.last();
    expect(second).not.toBe(first);
    second.open();
    expect(second.sentJson).toEqual([]);
    second.receive(frameJson("server/hello-active"));
    await vi.advanceTimersByTimeAsync(0);
    expect(second.sentJson).toContainEqual({ type: "attach", executionId: "exec_1", after: "41" });
    second.receive(frame(sseFrame(41, "text_delta", { id: "t", delta: "a" }) + sseFrame(42, "text_delta", { id: "t", delta: "b" })));
    second.receive(frameJson("server/attach_end-terminal"));
    const rest = await readAvailable(reader, 3);
    expect(rest).toContain("id: 42");
    expect(rest).not.toContain("id: 41");
    transport.destroy?.();
  });

  it("closes the stream with no terminal when the socket cannot come back (the session's reconnect takes over)", async () => {
    vi.useFakeTimers();
    const { transport } = makeTransport({ backoffMs: [5] });
    const connected = transport.socket.connect();
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.last().open();
    FakeWebSocket.last().receive(frameJson("server/hello"));
    await connected;
    const response = await transport.request(chatRequest(), async () => accepted());
    FakeWebSocket.last().receive(frame(sseFrame(1, "text_delta", { id: "t", delta: "a" })));
    FakeWebSocket.last().serverClose(1006);
    await vi.advanceTimersByTimeAsync(5);
    FakeWebSocket.last().serverClose(1006);
    await vi.advanceTimersByTimeAsync(10);
    const text = await response.text();
    expect(text).toContain("id: 1");
    expect(text).not.toContain("execution_complete");
    transport.destroy?.();
  });

  it("re-initializes the session on 4401 and reconnects with the new session id", async () => {
    vi.useFakeTimers();
    let sessionId = "sess_1";
    const renewSession = vi.fn(async () => {
      sessionId = "sess_2";
    });
    const { transport } = makeTransport({ renewSession, sessionId: () => sessionId });
    const connected = transport.socket.connect();
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.last().open();
    FakeWebSocket.last().receive(frameJson("server/hello"));
    await connected;
    await transport.request(chatRequest(), async () => accepted());
    FakeWebSocket.last().serverClose(4401, "session expired");
    await vi.advanceTimersByTimeAsync(10);
    expect(renewSession).toHaveBeenCalledTimes(1);
    expect(new URL(FakeWebSocket.last().url).searchParams.get("sessionId")).toBe("sess_2");
    transport.destroy?.();
  });

  it("stops, without reconnecting, when the 4401 re-init lands on another conversation", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const moved = { ...advertisement, url: advertisement.url.replace(/conversations\/[^/?]+/, "conversations/rec_new") };
    let session: { sessionId: string; realtime?: { url: string } } | null = { sessionId: "sess_1", realtime: advertisement };
    const client = {
      getClientSession: () => session,
      clearClientSession: () => {
        session = null;
      },
      initSession: vi.fn(async () => {
        session = { sessionId: "sess_2", realtime: moved };
      }),
      reconnectClientTokenStream: vi.fn(async () => new Response("")),
    };
    const controller = createRuntypeRealtimeController(client, {
      clientToken: "ct_live_abc",
      clientVersion: "persona/9.9.9",
      visitorToken: async () => "cvt_visitor",
      handlers: () => ({}),
    });
    const transport = controller.ensure(advertisement)!;
    const connected = transport.socket.connect();
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.last().open();
    FakeWebSocket.last().receive(frameJson("server/hello"));
    await connected;
    const response = await transport.request(chatRequest(), async () => accepted());
    const opened = FakeWebSocket.instances.length;
    FakeWebSocket.last().serverClose(4401, "Credentials revoked");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(client.initSession).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances.length).toBe(opened);
    // The open stream ends (no terminal), so the client's durable reconnect takes over over HTTP.
    await expect(response.text()).resolves.toBe("");
    controller.destroy();
  });

  it("reads a 202 turn over the events route from its start when a 4403 lands during the chat request", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const session = { sessionId: "sess_1", realtime: advertisement };
    const client = {
      getClientSession: () => session,
      clearClientSession: () => {},
      initSession: async () => {},
      reconnectClientTokenStream: vi.fn(async () => new Response(sseFrame(1, "execution_complete"))),
    };
    const controller = createRuntypeRealtimeController(client, {
      clientToken: "ct_live_abc",
      clientVersion: "persona/9.9.9",
      visitorToken: async () => "cvt_visitor",
      handlers: () => ({}),
    });
    const transport = controller.ensure(advertisement)!;
    const socket = await helloed(transport);
    const response = await transport.request(chatRequest(), async () => {
      socket.serverClose(4403, "forbidden");
      return accepted();
    });
    expect(await response.text()).toContain("execution_complete");
    expect(client.reconnectClientTokenStream).toHaveBeenCalledWith(
      expect.objectContaining({ executionId: "exec_1", after: "" })
    );
    controller.destroy();
  });

  it("stops using the socket on 4403 and sends later chats over plain SSE", async () => {
    const onDisabled = vi.fn();
    const { transport } = makeTransport({ onDisabled });
    await helloed(transport);
    FakeWebSocket.last().serverClose(4403, "forbidden");
    expect(onDisabled).toHaveBeenCalled();
    expect(transport.isDisabled()).toBe(true);
    const next = vi.fn(async (request: PersonaTransportRequest) => new Response(String(request.init.body)));
    await transport.request(chatRequest(), next);
    expect(next.mock.calls[0][0].init.body).not.toContain("delivery");
    transport.warm?.("intent");
    await flush();
    expect(FakeWebSocket.instances).toHaveLength(1);
    transport.destroy?.();
  });

  it("attaches a reconnect request on the socket with its cursor", async () => {
    const { transport } = makeTransport();
    const socket = await helloed(transport);
    const http = vi.fn(async () => new Response("http"));
    const response = await transport.request({
      kind: "reconnect",
      url: "https://api.example.test/v1/client/conversations/rec_1/executions/exec_1/events?after=7",
      executionId: "exec_1",
      after: "7",
      init: { method: "GET" },
    }, http);
    expect(http).not.toHaveBeenCalled();
    expect(socket.sentJson).toContainEqual({ type: "attach", executionId: "exec_1", after: "7" });
    socket.receive(JSON.stringify({ type: "attached", executionId: "exec_1", after: "7" }));
    socket.receive(frame(sseFrame(8, "execution_complete")));
    socket.receive(frameJson("server/attach_end-terminal"));
    expect(await response.text()).toContain("id: 8");
    transport.destroy?.();
  });

  it("ends a stream whose attach is refused with execution_not_found and reconnects it over HTTP", async () => {
    const { transport } = makeTransport();
    const socket = await helloed(transport);
    const reconnect = (after: string): PersonaTransportRequest => ({
      kind: "reconnect",
      url: `https://api.example.test/v1/client/conversations/rec_1/executions/exec_1/events?after=${after}`,
      executionId: "exec_1",
      after,
      init: { method: "GET" },
    });
    const first = await transport.request(reconnect("7"), async () => new Response("unused"));
    socket.receive(JSON.stringify({ type: "error", code: "execution_not_found", message: "Execution not found", executionId: "exec_1" }));
    await expect(first.text()).resolves.toBe("");
    const http = vi.fn(async () => new Response("id: 8\n\n"));
    const second = await transport.request(reconnect("7"), http);
    expect(http).toHaveBeenCalledTimes(1);
    expect(await second.text()).toBe("id: 8\n\n");
    expect(socket.sentJson.filter((f) => (f as { type?: string }).type === "attach")).toHaveLength(1);
    transport.destroy?.();
  });
});

describe("runtype-client-session-v1: other tabs and navigation", () => {
  it("surfaces execution{started} for a turn another tab started", async () => {
    const opened: Response[] = [];
    const onForeignExecution = vi.fn((_id: string, open: () => Response) => {
      opened.push(open());
      return true;
    });
    const { transport } = makeTransport({ onForeignExecution });
    const socket = await helloed(transport);
    socket.receive(frameJson("server/execution-started"));
    socket.receive(frame(sseFrame(1, "text_delta", { id: "t", delta: "from tab B" })));
    await flush();
    await flush();
    expect(onForeignExecution).toHaveBeenCalledWith("exec_1", expect.any(Function));
    socket.receive(frameJson("server/attach_end-terminal"));
    expect(await opened[0].text()).toContain("from tab B");
    transport.destroy?.();
  });

  it("does not treat this tab's own 202 as a foreign execution", async () => {
    const onForeignExecution = vi.fn(() => true);
    const { transport } = makeTransport({ onForeignExecution });
    const socket = await helloed(transport);
    await transport.request(chatRequest(), async () => {
      socket.receive(frameJson("server/execution-started"));
      await flush();
      return accepted();
    });
    await flush();
    await flush();
    expect(onForeignExecution).not.toHaveBeenCalled();
    transport.destroy?.();
  });

  it.each([
    ["answered 500", async () => new Response("{}", { status: 500 })],
    ["rejected after the request left", async () => {
      throw new TypeError("network error");
    }],
  ])("without clientTurnId, watches another tab's turn 1 s after this tab's dispatch %s", async (_label, fetchLike) => {
    const onForeignExecution = vi.fn(() => true);
    const { transport } = makeTransport({ onForeignExecution });
    const socket = await helloed(transport);
    await transport.request(chatRequest("turn_a"), fetchLike).catch(() => undefined);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 1_000);
    socket.receive(started("exec_2"));
    await flush();
    await flush();
    expect(onForeignExecution).toHaveBeenCalledWith("exec_2", expect.any(Function));
    expect(socket.sentJson).not.toContainEqual({ ...socketFixture("client/detach"), executionId: "exec_2" });
    vi.mocked(Date.now).mockRestore();
    transport.destroy?.();
  });

  it("without clientTurnId, shows a stopped send's own turn as a watched turn (it cannot be named)", async () => {
    const onForeignExecution = vi.fn(() => true);
    const { transport } = makeTransport({ onForeignExecution });
    const socket = await helloed(transport);
    await expect(transport.request(chatRequest("turn_a"), abortedFetch)).rejects.toThrow(/aborted/);
    socket.receive(started("exec_1"));
    await flush();
    await flush();
    expect(onForeignExecution).toHaveBeenCalledWith("exec_1", expect.any(Function));
    transport.destroy?.();
  });

  it("without clientTurnId, a started notice that arrives before this tab reads its 202 is claimed by the 202", async () => {
    const onForeignExecution = vi.fn(() => true);
    const { transport } = makeTransport({ onForeignExecution });
    const socket = await helloed(transport);
    const response = await transport.request(chatRequest("turn_a"), async () => {
      await flush();
      socket.receive(started("exec_1"));
      await new Promise((resolve) => setTimeout(resolve, 20));
      return accepted();
    });
    await flush();
    await flush();
    expect(onForeignExecution).not.toHaveBeenCalled();
    socket.receive(frame(sseFrame(1, "text_delta", { id: "t", delta: "mine" })));
    socket.receive(frameJson("server/attach_end-terminal"));
    expect(await response.text()).toContain("mine");
    transport.destroy?.();
  });

  it("does not watch a turn this tab's aborted resume addressed", async () => {
    const onForeignExecution = vi.fn(() => true);
    const { transport } = makeTransport({ onForeignExecution });
    const socket = await helloed(transport);
    await expect(transport.request({
      kind: "resume",
      url: "https://api.example.test/v1/client/executions/exec_1/resume",
      executionId: "exec_1",
      init: { method: "POST" },
    }, async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    })).rejects.toThrow(/aborted/);
    socket.receive(frameJson("server/execution-started"));
    await flush();
    await flush();
    expect(onForeignExecution).not.toHaveBeenCalled();
    transport.destroy?.();
  });

  it("watches another tab's turn after a dispatch aborted before it reached the network", async () => {
    const onForeignExecution = vi.fn(() => true);
    const { transport } = makeTransport({ onForeignExecution });
    const socket = await helloed(transport);
    const stop = new AbortController();
    stop.abort();
    const next = vi.fn(abortedFetch);
    await expect(transport.request(chatRequest(undefined, stop.signal), next)).rejects.toThrow(/abort/i);
    expect(next).not.toHaveBeenCalled();
    socket.receive(started("exec_1"));
    await flush();
    await flush();
    expect(onForeignExecution).toHaveBeenCalledWith("exec_1", expect.any(Function));
    transport.destroy?.();
  });

  it("watches another tab's turn after a dispatch aborted while it waited for the socket to open", async () => {
    const onForeignExecution = vi.fn(() => true);
    const { transport } = makeTransport({ onForeignExecution });
    const stop = new AbortController();
    const fetchLike = vi.fn(async (request: PersonaTransportRequest) => {
      request.init.signal?.throwIfAborted();
      return accepted();
    });
    const pending = transport.request(chatRequest(undefined, stop.signal), fetchLike);
    stop.abort();
    const socket = await helloed(transport);
    await expect(pending).rejects.toThrow(/abort/i);
    socket.receive(started("exec_1"));
    await flush();
    await flush();
    expect(onForeignExecution).toHaveBeenCalledWith("exec_1", expect.any(Function));
    transport.destroy?.();
  });

  it("decides ownership by clientTurnId alone: another tab's turn 2 s after this tab's aborted send is watched", async () => {
    const onForeignExecution = vi.fn(() => true);
    const { transport } = makeTransport({ onForeignExecution });
    const socket = await helloed(transport);
    await expect(transport.request(chatRequest("turn_a"), abortedFetch)).rejects.toThrow(/aborted/);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 2_000);
    socket.receive(started("exec_2", "turn_b"));
    await flush();
    await flush();
    expect(onForeignExecution).toHaveBeenCalledWith("exec_2", expect.any(Function));

    socket.receive(started("exec_1", "turn_a"));
    await flush();
    await flush();
    expect(onForeignExecution).not.toHaveBeenCalledWith("exec_1", expect.any(Function));
    expect(socket.sentJson).toContainEqual({ ...socketFixture("client/detach"), executionId: "exec_1" });
    vi.mocked(Date.now).mockRestore();
    transport.destroy?.();
  });

  it("decides hello.activeExecutionId by activeClientTurnId when the server sends it", async () => {
    const onForeignExecution = vi.fn(() => true);
    const { transport } = makeTransport({ onForeignExecution });
    await expect(transport.request(chatRequest("turn_a"), abortedFetch)).rejects.toThrow(/aborted/);
    const hello = (activeExecutionId: string, activeClientTurnId: string) =>
      JSON.stringify({ ...socketFixture<Record<string, unknown>>("server/hello"), activeExecutionId, activeClientTurnId });
    const connected = transport.socket.connect();
    await flush();
    const socket = FakeWebSocket.last();
    socket.open();
    socket.receive(hello("exec_2", "turn_b"));
    await connected;
    await flush();
    await flush();
    expect(onForeignExecution).toHaveBeenCalledWith("exec_2", expect.any(Function));

    socket.receive(hello("exec_1", "turn_a"));
    await flush();
    await flush();
    expect(onForeignExecution).not.toHaveBeenCalledWith("exec_1", expect.any(Function));
    transport.destroy?.();
  });

  it("re-watches a paused turn after a reconnect from the last frame it showed, not from the start", async () => {
    vi.useFakeTimers();
    const opened: Response[] = [];
    const onForeignExecution = vi.fn((_id: string, open: () => Response) => {
      opened.push(open());
      return true;
    });
    const { transport } = makeTransport({ onForeignExecution });
    const connected = transport.socket.connect();
    await vi.advanceTimersByTimeAsync(0);
    const first = FakeWebSocket.last();
    first.open();
    first.receive(frameJson("server/hello"));
    await connected;
    first.receive(started("exec_1"));
    first.receive(frame(sseFrame(1, "text_delta", { id: "t", delta: "watched " })));
    first.receive(frame(sseFrame(2, "text_delta", { id: "t", delta: "text" })));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    first.receive(frameJson("server/attach_end-paused"));
    expect(await opened[0].text()).toContain("watched ");

    // The owner answers the pause; this tab's socket drops and comes back while the turn runs.
    first.serverClose(1006);
    const reconnected = transport.socket.connect();
    await vi.advanceTimersByTimeAsync(0);
    const second = FakeWebSocket.last();
    expect(second).not.toBe(first);
    second.open();
    second.receive(JSON.stringify({ ...socketFixture<Record<string, unknown>>("server/hello"), activeExecutionId: "exec_1" }));
    await reconnected;
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(onForeignExecution).toHaveBeenCalledTimes(2);
    expect(second.sentJson).toContainEqual({ type: "attach", executionId: "exec_1", after: "2" });
    second.receive({ type: "attached", executionId: "exec_1" });
    second.receive(frame(sseFrame(1, "text_delta", { id: "t", delta: "watched " }) + sseFrame(2, "text_delta", { id: "t", delta: "text" }) + sseFrame(3, "text_delta", { id: "t2", delta: " more" })));
    second.receive(frameJson("server/attach_end-terminal"));
    const replay = await opened[1].text();
    expect(replay).toContain(" more");
    expect(replay).not.toContain("watched ");
    transport.destroy?.();
  });

  it("drops frames already shown when a watched turn's next leg resends them live", async () => {
    const opened: Response[] = [];
    const onForeignExecution = vi.fn((_id: string, open: () => Response) => {
      opened.push(open());
      return true;
    });
    const { transport } = makeTransport({ onForeignExecution });
    const socket = await helloed(transport);
    socket.receive(started("exec_1"));
    socket.receive(frame(sseFrame(1, "text_delta", { id: "t", delta: "first leg" })));
    await flush();
    await flush();
    socket.receive(frameJson("server/attach_end-paused"));
    expect(await opened[0].text()).toContain("first leg");
    socket.receive(frame(sseFrame(1, "text_delta", { id: "t", delta: "first leg" }) + sseFrame(2, "text_delta", { id: "t2", delta: "second leg" })));
    await flush();
    await flush();
    socket.receive(frameJson("server/attach_end-terminal"));
    const next = await opened[1].text();
    expect(next).toContain("second leg");
    expect(next).not.toContain("first leg");
    transport.destroy?.();
  });

  it("detaches a foreign execution the session declines", async () => {
    const { transport } = makeTransport({ onForeignExecution: () => false });
    const socket = await helloed(transport);
    socket.receive(frameJson("server/execution-started"));
    await flush();
    await flush();
    expect(socket.sentJson).toContainEqual({ ...socketFixture("client/detach"), executionId: "exec_1" });
    transport.destroy?.();
  });

  it("attaches hello.activeExecutionId from the start when nothing claimed it", async () => {
    const onForeignExecution = vi.fn((_id: string, open: () => Response) => {
      open();
      return true;
    });
    const { transport } = makeTransport({ onForeignExecution });
    const socket = await helloed(transport, "server/hello-active");
    await flush();
    await flush();
    const fromStart = socketFixture<{ executionId: string }>("client/attach-from-start");
    expect(socketFixture("server/hello-active").activeExecutionId).toBe(fromStart.executionId);
    expect(onForeignExecution).toHaveBeenCalledWith(fromStart.executionId, expect.any(Function));
    expect(socket.sentJson).toContainEqual(fromStart);
    transport.destroy?.();
  });

  it("sends navigating and resolves on navigating-ack, or false after the bound", async () => {
    const { transport } = makeTransport();
    const socket = await helloed(transport);
    const navigating = socketFixture<{ executionId: string; url: string }>("client/navigating");
    const acked = transport.navigating({ executionId: navigating.executionId, url: navigating.url }, 150);
    expect(socket.sentJson).toContainEqual(navigating);
    socket.receive(frameJson("server/navigating-ack"));
    expect(await acked).toBe(true);
    const start = Date.now();
    expect(await transport.navigating({}, 30)).toBe(false);
    expect(Date.now() - start).toBeLessThan(150);
    transport.destroy?.();
  });

  it("resolves navigating false at once when the socket is not ready", async () => {
    const { transport } = makeTransport();
    expect(await transport.navigating({ executionId: "exec_1" })).toBe(false);
    transport.destroy?.();
  });
});

describe("AgentWidgetClient + client-session socket", () => {
  const clientSession = (extra: Partial<ClientSession> = {}): ClientSession => ({
    sessionId: "sess_1",
    conversationId: "rec_1",
    expiresAt: new Date(Date.now() + 600_000),
    durableRecovery: { enabled: true },
    realtime: advertisement,
    flow: { id: "agent-1", name: "Agent", description: null },
    config: { welcomeMessage: null, placeholder: "Ask...", theme: null },
    ...extra,
  });

  async function setup(config: Record<string, unknown> = {}, session = clientSession()) {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const store = createVisitorStore("ct_live_abc", "rt-test-", true);
    await store.set("cvt_visitor");
    const client = new AgentWidgetClient({ clientToken: "ct_live_abc", apiUrl: "https://api.example.test", ...config });
    client.setHistoryInternals({ visitorStore: store });
    (client as unknown as { clientSession: ClientSession }).clientSession = session;
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/v1/client/chat")) {
        const body = JSON.parse(String(init.body));
        bodies.push(body);
        if (body.delivery === "socket") {
          setTimeout(() => {
            const socket = FakeWebSocket.last();
            socket.receive(frame(sseFrame(1, "text_delta", { id: "t", delta: "Hello" })));
            socket.receive(frame(sseFrame(2, "text_delta", { id: "t", delta: " socket" })));
            socket.receive(frame(sseFrame(3, "execution_complete", { success: true, kind: "agent" })));
            socket.receive(frameJson("server/attach_end-terminal"));
          }, 0);
          return accepted();
        }
        return new Response(sseFrame(1, "text_delta", { id: "t", delta: "Hello sse" }) + sseFrame(2, "execution_complete", { success: true, kind: "agent" }), {
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }));
    const events: AgentWidgetEvent[] = [];
    const send = () => client.dispatch({ messages: [{ id: "u1", role: "user", content: "hi", createdAt: "2026-11-11T00:00:00Z" }], assistantMessageId: "a1" }, (e) => events.push(e));
    return { client, bodies, events, send };
  }

  const openSocket = async () => {
    await vi.waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
    const socket = FakeWebSocket.last();
    socket.open();
    socket.receive(frameJson("server/hello"));
    await flush();
    return socket;
  };

  it("streams a turn over the socket after warm, emitting each cursor only after its frame is applied", async () => {
    const h = await setup();
    h.client.warmTransport("intent");
    await openSocket();
    await h.send();
    expect(h.bodies[0]).toMatchObject({ delivery: "socket" });
    const assistant = h.events.filter((e) => e.type === "message" && e.message.role === "assistant");
    expect(assistant.at(-1)).toMatchObject({ message: { content: "Hello socket" } });
    const order = h.events
      .filter((e) => e.type === "cursor" || (e.type === "message" && e.message.role === "assistant"))
      .map((e) => (e.type === "cursor" ? `cursor:${e.id}` : `text:${(e as { message: { content: string } }).message.content}`));
    expect(order).toEqual(expect.arrayContaining(["text:Hello", "cursor:1", "text:Hello socket", "cursor:2", "cursor:3"]));
    expect(order.indexOf("text:Hello")).toBeLessThan(order.indexOf("cursor:1"));
    expect(order.indexOf("cursor:1")).toBeLessThan(order.indexOf("text:Hello socket"));
    expect(order.indexOf("text:Hello socket")).toBeLessThan(order.indexOf("cursor:2"));
    h.client.destroy();
  });

  it("first send without a warmed socket still goes over SSE", async () => {
    const h = await setup();
    await h.send();
    expect(h.bodies[0]).not.toHaveProperty("delivery");
    expect(h.events.some((e) => e.type === "message" && e.message.content === "Hello sse")).toBe(true);
    h.client.destroy();
  });

  it.each([
    ["no realtime advertisement", {}, clientSession({ realtime: undefined })],
    ["durable recovery off", {}, clientSession({ durableRecovery: { enabled: false } })],
    ["realtime: false", { realtime: false }, clientSession()],
    ["realtime.enabled: false", { realtime: { enabled: false } }, clientSession()],
    ["an unknown protocol", {}, clientSession({ realtime: { protocol: "other-v9", url: advertisement.url } })],
  ])("stays on pure SSE with %s", async (_label, config, session) => {
    const h = await setup(config, session);
    h.client.warmTransport("intent");
    await flush();
    await flush();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(h.client.hasRealtime()).toBe(false);
    await h.send();
    expect(h.bodies[0]).not.toHaveProperty("delivery");
    h.client.destroy();
  });

  it("routes through a host transport instead of the built-in socket", async () => {
    const request = vi.fn((req: PersonaTransportRequest, next: (r: PersonaTransportRequest) => Promise<Response>) => next(req));
    const h = await setup({ transport: { request } });
    h.client.warmTransport("intent");
    await h.send();
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ kind: "dispatch" }), expect.any(Function));
    expect(FakeWebSocket.instances).toHaveLength(0);
    h.client.destroy();
  });
});
