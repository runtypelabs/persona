// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWebSocketTransport,
  sseFromEvents,
  type WebSocketTransportCodec,
  type WebSocketTransportOptions,
} from "./websocket-transport";
import { PersonaTransportError, type PersonaTransportRequest } from "./transport";
import { FakeWebSocket, readAvailable } from "./testing/fake-websocket";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A small duplex codec: `{op:"chat", id, text}` up; `{id, sse|end|error}` down. */
const duplexCodec = (): WebSocketTransportCodec => ({
  encode: (request, { streamId }) => JSON.stringify({ op: "chat", id: streamId, text: request.body?.text }),
  decode(data) {
    const frame = JSON.parse(String(data));
    if (frame.ready) return { kind: "ready", heartbeatMs: frame.ready };
    if (frame.sse) return { kind: "sse", streamId: frame.id, sse: frame.sse };
    if (frame.events) return { kind: "events", streamId: frame.id, events: frame.events, id: frame.cursor };
    if (frame.end) return { kind: "end", streamId: frame.id, reason: frame.end };
    if (frame.error) return { kind: "error", streamId: frame.id, message: frame.error };
    return { kind: "message", message: frame };
  },
  attach: (id, after) => JSON.stringify({ op: "attach", id, after }),
  detach: (id) => JSON.stringify({ op: "detach", id }),
  heartbeat: '{"op":"ping"}',
});

const chat = (text: string, signal?: AbortSignal): PersonaTransportRequest => ({
  kind: "dispatch",
  url: "https://backend.test/chat",
  body: { text },
  init: { method: "POST", body: JSON.stringify({ text }), signal },
});

const make = (overrides: Partial<WebSocketTransportOptions> = {}) =>
  createWebSocketTransport({
    url: "wss://backend.test/socket",
    protocols: ["chat.v1"],
    codec: duplexCodec(),
    WebSocket: FakeWebSocket,
    lifecycle: window,
    backoffMs: [10, 20],
    connectTimeoutMs: 1000,
    ...overrides,
  });

const neverHttp = vi.fn(async () => new Response("http", { status: 200 }));

beforeEach(() => {
  FakeWebSocket.reset();
  neverHttp.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("createWebSocketTransport: lifecycle", () => {
  it("connects lazily on the first request with the resolved URL and subprotocols", async () => {
    const transport = make({ protocols: async () => ["chat.v1", "token-123"] });
    expect(FakeWebSocket.instances).toHaveLength(0);
    const pending = transport.request(chat("hi"), neverHttp);
    await flush();
    const socket = FakeWebSocket.last();
    expect(socket.url).toBe("wss://backend.test/socket");
    expect(socket.protocols).toEqual(["chat.v1", "token-123"]);
    socket.open();
    const response = await pending;
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(socket.sentJson[0]).toEqual({ op: "chat", id: "s1", text: "hi" });
    expect(neverHttp).not.toHaveBeenCalled();
    transport.destroy?.();
  });

  it("waits for the codec's ready frame when awaitReady is set, then heartbeats with the exact frame", async () => {
    vi.useFakeTimers();
    const transport = make({ awaitReady: true });
    const connected = transport.connect();
    await vi.advanceTimersByTimeAsync(0);
    const socket = FakeWebSocket.last();
    socket.open();
    expect(transport.isReady()).toBe(false);
    socket.receive({ ready: 1000 });
    await connected;
    expect(transport.isReady()).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    socket.receive({ pong: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(socket.sent.filter((frame) => frame === '{"op":"ping"}')).toHaveLength(2);
    transport.destroy?.();
  });

  it("closes a dead socket when the heartbeat goes unanswered", async () => {
    vi.useFakeTimers();
    const transport = make({ heartbeatMs: 100 });
    const connected = transport.connect();
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.last().open();
    await connected;
    await vi.advanceTimersByTimeAsync(5400);
    expect(FakeWebSocket.last().closedWith?.code).toBe(4000);
    transport.destroy?.();
  });

  it("does not connect while the document is prerendering", async () => {
    Object.defineProperty(document, "prerendering", { configurable: true, value: true });
    const transport = make();
    const connected = transport.connect();
    await flush();
    expect(FakeWebSocket.instances).toHaveLength(0);
    Object.defineProperty(document, "prerendering", { configurable: true, value: false });
    document.dispatchEvent(new Event("prerenderingchange"));
    await flush();
    FakeWebSocket.last().open();
    await connected;
    expect(transport.isReady()).toBe(true);
    transport.destroy?.();
    delete (document as { prerendering?: boolean }).prerendering;
  });

  it("closes the socket on pagehide and reconnects on a persisted pageshow when warm", async () => {
    const transport = make();
    transport.warm?.("intent");
    await flush();
    FakeWebSocket.last().open();
    window.dispatchEvent(new Event("pagehide"));
    expect(FakeWebSocket.last().closedWith?.code).toBe(1000);
    const show = new Event("pageshow") as Event & { persisted?: boolean };
    Object.defineProperty(show, "persisted", { value: true });
    window.dispatchEvent(show);
    await flush();
    expect(FakeWebSocket.instances).toHaveLength(2);
    transport.destroy?.();
  });

  it("does not open a socket after pagehide while its URL is still resolving", async () => {
    let resolveUrl!: (url: string) => void;
    const transport = make({ url: () => new Promise<string>((resolve) => (resolveUrl = resolve)) });
    const connected = transport.connect();
    await flush();
    window.dispatchEvent(new Event("pagehide"));
    resolveUrl("wss://backend.test/socket");
    await expect(connected).rejects.toBeInstanceOf(PersonaTransportError);
    expect(FakeWebSocket.instances).toHaveLength(0);
    transport.destroy?.();
  });

  it("closes an unused socket after the page has been hidden for idleCloseMs", async () => {
    vi.useFakeTimers();
    const transport = make({ idleCloseMs: 5000 });
    transport.warm?.("intent");
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.last().open();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(4999);
    expect(FakeWebSocket.last().closedWith).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.last().closedWith?.reason).toBe("idle");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    transport.destroy?.();
  });
});

describe("createWebSocketTransport: streams", () => {
  const ready = async (transport: ReturnType<typeof make>) => {
    const connected = transport.connect();
    await flush();
    FakeWebSocket.last().open();
    await connected;
    return FakeWebSocket.last();
  };

  it("multiplexes streams by id and closes each on its end frame", async () => {
    const transport = make();
    const socket = await ready(transport);
    const a = await transport.request(chat("a"), neverHttp);
    const b = await transport.request(chat("b"), neverHttp);
    socket.receive({ id: "s2", sse: "event: text_delta\ndata: {\"type\":\"text_delta\",\"delta\":\"B\"}\n\n" });
    socket.receive({ id: "s1", sse: "event: text_delta\ndata: {\"type\":\"text_delta\",\"delta\":\"A\"}\n\n" });
    socket.receive({ id: "s1", end: "complete" });
    socket.receive({ id: "s2", end: "complete" });
    expect(await a.text()).toContain('"delta":"A"');
    const bText = await b.text();
    expect(bText).toContain('"delta":"B"');
    expect(bText).not.toContain('"delta":"A"');
    transport.destroy?.();
  });

  it("serializes object events to SSE with the cursor on the last block", async () => {
    expect(sseFromEvents([{ type: "a" }, { type: "b", x: 1 }], "7")).toBe(
      'event: a\ndata: {"type":"a"}\n\nevent: b\ndata: {"type":"b","x":1}\nid: 7\n\n'
    );
  });

  it("aborts one stream without touching the other and tells the backend to detach", async () => {
    const transport = make();
    const socket = await ready(transport);
    const controller = new AbortController();
    const a = await transport.request(chat("a", controller.signal), neverHttp);
    const b = await transport.request(chat("b"), neverHttp);
    const readerA = a.body!.getReader();
    controller.abort();
    await expect(readerA.read()).rejects.toMatchObject({ name: "AbortError" });
    expect(socket.sentJson).toContainEqual({ op: "detach", id: "s1" });
    socket.receive({ id: "s2", sse: "data: {\"type\":\"text_delta\",\"delta\":\"still here\"}\n\n" });
    socket.receive({ id: "s2", end: "complete" });
    expect(await b.text()).toContain("still here");
    transport.destroy?.();
  });

  it("buffers frames for a stream that is claimed later (socket faster than HTTP)", async () => {
    const onUnclaimedStream = vi.fn();
    const transport = make({ onUnclaimedStream });
    const socket = await ready(transport);
    socket.receive({ id: "exec_1", sse: "data: {\"type\":\"text_delta\",\"delta\":\"early\"}\nid: 1\n\n" });
    socket.receive({ id: "exec_1", end: "complete" });
    expect(onUnclaimedStream).toHaveBeenCalledWith("exec_1");
    expect(await transport.claim("exec_1").text()).toContain("early");
    transport.destroy?.();
  });

  it("ends a stream claimed after its end frame arrived with no data", async () => {
    const transport = make();
    const socket = await ready(transport);
    socket.receive({ id: "exec_1", end: "complete" });
    const text = transport.claim("exec_1").text();
    expect(await Promise.race([text, new Promise((resolve) => setTimeout(resolve, 50, "open"))])).toBe("");
    transport.destroy?.();
  });

  it("treats frames after an unclaimed stream's end as a new leg, not part of the ended one", async () => {
    const onUnclaimedStream = vi.fn();
    const transport = make({ onUnclaimedStream });
    const socket = await ready(transport);
    socket.receive({ id: "exec_1", end: "paused" });
    socket.receive({ id: "exec_1", sse: "data: next leg\n\n" });
    expect(onUnclaimedStream).toHaveBeenCalledTimes(1);
    const reader = transport.claim("exec_1").body!.pipeThrough(new TextDecoderStream()).getReader();
    expect((await reader.read()).value).toBe("data: next leg\n\n");
    const next = await Promise.race([reader.read(), new Promise((resolve) => setTimeout(resolve, 50, "open"))]);
    expect(next).toBe("open");
    transport.destroy?.();
  });

  it("keeps unread frames from before an unclaimed stream's end when the next leg arrives", async () => {
    const onUnclaimedStream = vi.fn();
    const transport = make({ onUnclaimedStream });
    const socket = await ready(transport);
    socket.receive({ id: "exec_1", sse: "data: before\n\n" });
    socket.receive({ id: "exec_1", end: "paused" });
    socket.receive({ id: "exec_1", sse: "data: after\n\n" });
    expect(onUnclaimedStream).toHaveBeenCalledTimes(1);
    const reader = transport.claim("exec_1").body!.pipeThrough(new TextDecoderStream()).getReader();
    let read = "";
    while (!read.includes("after")) read += (await reader.read()).value ?? "";
    expect(read).toBe("data: before\n\ndata: after\n\n");
    const next = await Promise.race([reader.read(), new Promise((resolve) => setTimeout(resolve, 50, "open"))]);
    expect(next).toBe("open");
    transport.destroy?.();
  });

  it("drops buffered frames on a claim whose attach replays them, so nothing is read twice", async () => {
    const transport = make();
    const socket = await ready(transport);
    socket.receive({ id: "exec_1", sse: "data: one\n\n" });
    const reader = transport.claim("exec_1", { after: null, replay: true }).body!.pipeThrough(new TextDecoderStream()).getReader();
    socket.receive({ id: "exec_1", sse: "data: one\n\n" });
    socket.receive({ id: "exec_1", end: "complete" });
    let read = "";
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) read += chunk.value;
    expect(read).toBe("data: one\n\n");
    transport.destroy?.();
  });

  it("opens no socket for a timed-out attempt whose URL resolves while a newer attempt is connecting", async () => {
    const urls: Array<(url: string) => void> = [];
    const transport = make({
      connectTimeoutMs: 20,
      url: () => new Promise<string>((resolve) => urls.push(resolve)),
    });
    await expect(transport.connect()).rejects.toThrow(/Timed out/);
    const second = transport.connect();
    await flush();
    urls[0]("wss://backend.test/stale");
    await flush();
    urls[1]("wss://backend.test/fresh");
    await flush();
    expect(FakeWebSocket.instances.map((socket) => socket.url)).toEqual(["wss://backend.test/fresh"]);
    FakeWebSocket.last().open();
    await second;
    const live = FakeWebSocket.last();
    const a = await transport.request(chat("a"), neverHttp);
    live.receive({ id: "s1", sse: "data: still here\n\n" });
    live.receive({ id: "s1", end: "complete" });
    expect(await a.text()).toContain("still here");
    transport.destroy?.();
  });

  it("keeps the live socket when a socket from an earlier attempt opens or closes late", async () => {
    const transport = make({ connectTimeoutMs: 20 });
    await expect(transport.connect()).rejects.toThrow(/Timed out/);
    const stale = FakeWebSocket.last();
    const live = await ready(transport);
    expect(live).not.toBe(stale);
    stale.open();
    stale.serverClose(1006);
    const a = await transport.request(chat("a"), neverHttp);
    live.receive({ id: "s1", sse: "data: still here\n\n" });
    live.receive({ id: "s1", end: "complete" });
    expect(await a.text()).toContain("still here");
    expect(transport.state).toBe("open");
    transport.destroy?.();
  });

  it("reads a from-start replay whole when live frames of the relay it replaces arrive before the attach ack", async () => {
    const codec = duplexCodec();
    const decode = codec.decode.bind(codec);
    codec.acknowledgesAttach = true;
    codec.decode = (data) => {
      const frame = JSON.parse(String(data));
      return frame.attached ? { kind: "attached", streamId: frame.id } : decode(data);
    };
    const transport = make({ codec });
    const socket = await ready(transport);
    const reader = transport.claim("exec_1", { after: null, replay: true }).body!.pipeThrough(new TextDecoderStream()).getReader();
    socket.receive({ id: "exec_1", sse: "id: 57\ndata: live\n\n" });
    socket.receive({ attached: true, id: "exec_1" });
    socket.receive({ id: "exec_1", sse: "id: 1\ndata: first\n\nid: 57\ndata: live\n\n" });
    socket.receive({ id: "exec_1", end: "complete" });
    let read = "";
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) read += chunk.value;
    expect(read).toBe("id: 1\ndata: first\n\nid: 57\ndata: live\n\n");
    transport.destroy?.();
  });

  it.each(["paused", "complete"])(
    "keeps a replay claim open when the replaced relay ends %s before the attach ack",
    async (reason) => {
      const codec = duplexCodec();
      const decode = codec.decode.bind(codec);
      codec.acknowledgesAttach = true;
      codec.decode = (data) => {
        const frame = JSON.parse(String(data));
        return frame.attached ? { kind: "attached", streamId: frame.id } : decode(data);
      };
      const transport = make({ codec });
      const socket = await ready(transport);
      const reader = transport.claim("exec_1", { after: null, replay: true }).body!.pipeThrough(new TextDecoderStream()).getReader();
      socket.receive({ id: "exec_1", sse: "id: 4\ndata: old relay\n\n" });
      socket.receive({ id: "exec_1", end: reason });
      socket.receive({ attached: true, id: "exec_1" });
      socket.receive({ id: "exec_1", sse: "id: 1\ndata: first\n\nid: 4\ndata: question\n\n" });
      socket.receive({ id: "exec_1", end: "paused" });
      let read = "";
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) read += chunk.value;
      expect(read).toBe("id: 1\ndata: first\n\nid: 4\ndata: question\n\n");
      transport.destroy?.();
    }
  );

  it("still ends a replay claim whose attach is refused before any ack", async () => {
    const codec = duplexCodec();
    codec.acknowledgesAttach = true;
    const transport = make({ codec });
    const socket = await ready(transport);
    const response = transport.claim("exec_1", { after: null, replay: true });
    socket.receive({ id: "exec_1", end: "refused" });
    await expect(response.text()).rejects.toThrow();
    transport.destroy?.();
  });

  it("errors a stream claimed after its stream error frame arrived", async () => {
    const transport = make();
    const socket = await ready(transport);
    socket.receive({ id: "exec_1", error: "boom" });
    await expect(transport.claim("exec_1").text()).rejects.toMatchObject({ code: "stream_error" });
    transport.destroy?.();
  });

  it("does not send a duplex request that was aborted while the socket was opening", async () => {
    const transport = make();
    const controller = new AbortController();
    const pending = transport.request(chat("a", controller.signal), neverHttp);
    await flush();
    controller.abort();
    FakeWebSocket.last().open();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeWebSocket.last().sentJson.filter((frame) => frame.op === "chat")).toHaveLength(0);
    transport.destroy?.();
  });

  it("reports codec errors without dropping the socket or open streams", async () => {
    const onError = vi.fn();
    const transport = make({ onError });
    const socket = await ready(transport);
    const a = await transport.request(chat("a"), neverHttp);
    socket.receive("{not json");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "protocol" }));
    socket.receive({ id: "s1", sse: "data: {\"type\":\"text_delta\",\"delta\":\"ok\"}\n\n" });
    socket.receive({ id: "s1", end: "complete" });
    expect(await a.text()).toContain("ok");
    transport.destroy?.();
  });

  it("errors only the addressed stream on a stream error frame", async () => {
    const transport = make();
    const socket = await ready(transport);
    const a = await transport.request(chat("a"), neverHttp);
    socket.receive({ id: "s1", error: "boom" });
    await expect(a.text()).rejects.toBeInstanceOf(PersonaTransportError);
    expect(transport.isReady()).toBe(true);
    transport.destroy?.();
  });

  it("falls back to HTTP only when httpFallback is set and the socket cannot open", async () => {
    const strict = make({ connectTimeoutMs: 20, WebSocket: class extends FakeWebSocket {} });
    await expect(strict.request(chat("x"), neverHttp)).rejects.toBeInstanceOf(PersonaTransportError);
    const lenient = make({ connectTimeoutMs: 20, httpFallback: true });
    const response = await lenient.request(chat("x"), neverHttp);
    expect(await response.text()).toBe("http");
    strict.destroy?.();
    lenient.destroy?.();
  });
});

describe("createWebSocketTransport: reconnect", () => {
  it("reconnects with backoff and reattaches open streams after their cursor, skipping duplicates", async () => {
    vi.useFakeTimers();
    const transport = make();
    const connected = transport.connect();
    await vi.advanceTimersByTimeAsync(0);
    const first = FakeWebSocket.last();
    first.open();
    await connected;
    const response = await transport.request(chat("a"), neverHttp);
    const reader = response.body!.getReader();
    first.receive({ id: "s1", sse: "data: {\"type\":\"text_delta\",\"delta\":\"1\"}\nid: 41\n\n" });
    expect(await readAvailable(reader, 1)).toContain("id: 41");
    first.serverClose(1006);
    await vi.advanceTimersByTimeAsync(10);
    const second = FakeWebSocket.last();
    expect(second).not.toBe(first);
    second.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(second.sentJson).toContainEqual({ op: "attach", id: "s1", after: "41" });
    // An overlapping replay of 41 is dropped; 42 is new.
    second.receive({ id: "s1", sse: "data: {\"type\":\"text_delta\",\"delta\":\"1\"}\nid: 41\n\ndata: {\"type\":\"text_delta\",\"delta\":\"2\"}\nid: 42\n\n" });
    second.receive({ id: "s1", end: "complete" });
    const rest = await readAvailable(reader, 3);
    expect(rest).toContain("id: 42");
    expect(rest).not.toContain("id: 41");
    transport.destroy?.();
  });

  it("orders sub-row cursors (42.0, 42.1, then 42) when dropping a replayed overlap", async () => {
    const transport = make();
    const connected = transport.connect();
    await flush();
    const socket = FakeWebSocket.last();
    socket.open();
    await connected;
    const reader = (await transport.request(chat("a"), neverHttp)).body!.getReader();
    const block = (id: string, delta: string) => `id: ${id}\ndata: {"type":"text_delta","delta":"${delta}"}\n\n`;
    socket.receive({ id: "s1", sse: block("42.0", "a") + block("42.1", "b") });
    socket.receive({ id: "s1", sse: block("42.0", "a") + block("42.1", "b") + block("42", "c") + block("43", "d") });
    socket.receive({ id: "s1", end: "complete" });
    const text = await readAvailable(reader, 6);
    expect(text.match(/^id: .+$/gm)).toEqual(["id: 42.0", "id: 42.1", "id: 42", "id: 43"]);
    transport.destroy?.();
  });

  it("ends streams per onStreamLost when the socket cannot be re-established", async () => {
    vi.useFakeTimers();
    const closeMode = make({ onStreamLost: "close", backoffMs: [5] });
    const connected = closeMode.connect();
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.last().open();
    await connected;
    const response = await closeMode.request(chat("a"), neverHttp);
    FakeWebSocket.last().serverClose(1006);
    await vi.advanceTimersByTimeAsync(5);
    FakeWebSocket.last().serverClose(1006);
    await vi.advanceTimersByTimeAsync(10);
    expect(await response.text()).toBe("");
    closeMode.destroy?.();
  });

  it("disables itself on a disable close and stops using the socket", async () => {
    const onStateChange = vi.fn();
    const transport = make({
      onStateChange,
      codec: { ...duplexCodec(), classifyClose: (code) => (code === 4403 ? "disable" : "reconnect") },
    });
    const connected = transport.connect();
    await flush();
    FakeWebSocket.last().open();
    await connected;
    FakeWebSocket.last().serverClose(4403);
    expect(onStateChange).toHaveBeenLastCalledWith("disabled");
    await expect(transport.connect()).rejects.toMatchObject({ code: "disabled" });
    transport.destroy?.();
  });

  it("reauthenticates before reconnecting on a reauth close", async () => {
    vi.useFakeTimers();
    const reauthenticate = vi.fn(async () => {});
    const transport = make({
      reauthenticate,
      codec: { ...duplexCodec(), classifyClose: (code) => (code === 4401 ? "reauth" : "reconnect") },
    });
    const connected = transport.connect();
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.last().open();
    await connected;
    await transport.request(chat("a"), neverHttp);
    FakeWebSocket.last().serverClose(4401);
    await vi.advanceTimersByTimeAsync(10);
    expect(reauthenticate).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
    transport.destroy?.();
  });
});

describe("createWebSocketTransport: socket down, HTTP up", () => {
  const downstream = (): WebSocketTransportCodec => ({
    decode: duplexCodec().decode,
    prepare: (request) => ({ ...request, body: { ...request.body, viaSocket: true } }),
    accept: async (response) => (response.status === 202 ? ((await response.json()) as { id: string }).id : null),
  });

  it("uses HTTP untouched when the socket does not open in time", async () => {
    const transport = make({ codec: downstream() });
    const next = vi.fn(async (request: PersonaTransportRequest) =>
      new Response(JSON.stringify(request.body), { status: 200 }));
    const response = await transport.request(chat("x"), next);
    expect(await response.json()).toEqual({ text: "x" });
    transport.destroy?.();
  });

  it("waits for a socket that is still opening before choosing socket delivery", async () => {
    const transport = make({ codec: downstream() });
    const next = vi.fn(async (request: PersonaTransportRequest) =>
      new Response(JSON.stringify(request.body), { status: 200 }));
    const pending = transport.request(chat("x"), next);
    await flush();
    FakeWebSocket.last().open();
    await pending;
    expect(next.mock.calls[0]![0].body).toMatchObject({ viaSocket: true });
    transport.destroy?.();
  });

  it("rewrites the request while ready and hands a 202 stream to the socket", async () => {
    const transport = make({ codec: downstream() });
    const connected = transport.connect();
    await flush();
    const socket = FakeWebSocket.last();
    socket.open();
    await connected;
    const next = vi.fn(async (request: PersonaTransportRequest) => {
      expect(request.body).toMatchObject({ viaSocket: true });
      socket.receive({ id: "exec_9", sse: "data: {\"type\":\"text_delta\",\"delta\":\"socket\"}\n\n" });
      return new Response(JSON.stringify({ id: "exec_9" }), { status: 202 });
    });
    const response = await transport.request(chat("x"), next);
    socket.receive({ id: "exec_9", end: "complete" });
    expect(await response.text()).toContain("socket");
    transport.destroy?.();
  });

  it("recovers a 202 stream over HTTP when the socket was disabled while the request was in flight", async () => {
    const recoverStream = vi.fn(async () => new Response("data: recovered\n\n"));
    const transport = make({
      recoverStream,
      codec: { ...downstream(), classifyClose: (code) => (code === 4403 ? "disable" : "reconnect") },
    });
    const connected = transport.connect();
    await flush();
    const socket = FakeWebSocket.last();
    socket.open();
    await connected;
    const response = await transport.request(chat("x"), async () => {
      socket.serverClose(4403);
      return new Response(JSON.stringify({ id: "exec_9" }), { status: 202 });
    });
    expect(await response.text()).toBe("data: recovered\n\n");
    expect(recoverStream).toHaveBeenCalledWith("exec_9", undefined);
    transport.destroy?.();
  });

  it("recovers a 202 stream over HTTP when the socket refused it before any data", async () => {
    const recoverStream = vi.fn(async () => new Response("data: recovered\n\n"));
    const transport = make({ recoverStream, codec: downstream() });
    const connected = transport.connect();
    await flush();
    const socket = FakeWebSocket.last();
    socket.open();
    await connected;
    const response = await transport.request(chat("x"), async () => {
      socket.receive({ id: "exec_9", end: "refused" });
      return new Response(JSON.stringify({ id: "exec_9" }), { status: 202 });
    });
    expect(await response.text()).toBe("data: recovered\n\n");
    transport.destroy?.();
  });

  const handOff = async (overrides: Partial<WebSocketTransportOptions>) => {
    const transport = make({ onStreamLost: "close", codec: downstream(), ...overrides });
    const connected = transport.connect();
    await flush();
    const socket = FakeWebSocket.last();
    socket.open();
    await connected;
    const response = await transport.request(chat("x"), async () =>
      new Response(JSON.stringify({ id: "exec_9" }), { status: 202 }));
    return { transport, socket, response };
  };

  it("recovers a handed-off stream over HTTP from its start when the socket is lost before its first frame", async () => {
    const recoverStream = vi.fn(async () => new Response("data: recovered\n\n"));
    const { transport, socket, response } = await handOff({ recoverStream });
    vi.useFakeTimers();
    socket.serverClose(1006);
    // Every reconnect fails to open.
    for (let i = 0; i < 3; i += 1) {
      await vi.advanceTimersByTimeAsync(1000);
      FakeWebSocket.last().serverClose(1006);
    }
    await vi.advanceTimersByTimeAsync(1000);
    expect(recoverStream).toHaveBeenCalledWith("exec_9", expect.any(AbortSignal));
    expect(await response.text()).toBe("data: recovered\n\n");
    transport.destroy?.();
  });

  it("recovers a handed-off stream over HTTP when the backend detaches it before its first frame", async () => {
    const recoverStream = vi.fn(async () => new Response("data: recovered\n\n"));
    const { transport, socket, response } = await handOff({ recoverStream });
    socket.receive({ id: "exec_9", end: "detached" });
    expect(await response.text()).toBe("data: recovered\n\n");
    transport.destroy?.();
  });

  it("recovers a handed-off stream over HTTP when the socket reports an error for it before its first frame", async () => {
    const recoverStream = vi.fn(async () => new Response("data: recovered\n\n"));
    const { transport, socket, response } = await handOff({ recoverStream });
    socket.receive({ id: "exec_9", error: "internal" });
    expect(await response.text()).toBe("data: recovered\n\n");
    transport.destroy?.();
  });

  it("leaves a handed-off stream that already delivered frames to the session's own recovery", async () => {
    const recoverStream = vi.fn(async () => new Response("data: recovered\n\n"));
    const { transport, socket, response } = await handOff({ recoverStream });
    socket.receive({ id: "exec_9", sse: "id: 1\ndata: {\"type\":\"text_delta\",\"delta\":\"a\"}\n\n" });
    socket.receive({ id: "exec_9", end: "detached" });
    expect(await response.text()).toContain("text_delta");
    expect(recoverStream).not.toHaveBeenCalled();
    transport.destroy?.();
  });

  it("stops an HTTP recovery when the reader cancels", async () => {
    let recoverySignal: AbortSignal | undefined;
    const recoverStream = vi.fn(async (_id: string, signal?: AbortSignal) => {
      recoverySignal = signal;
      return new Response(new ReadableStream({ start() {} }));
    });
    const { transport, socket, response } = await handOff({ recoverStream });
    socket.receive({ id: "exec_9", end: "detached" });
    await flush();
    await response.body!.cancel();
    expect(recoverySignal?.aborted).toBe(true);
    transport.destroy?.();
  });

  it("stops listening to the request's abort signal once an HTTP recovery settles", async () => {
    const request = new AbortController();
    const add = vi.spyOn(request.signal, "addEventListener");
    const remove = vi.spyOn(request.signal, "removeEventListener");
    const transport = make({
      onStreamLost: "close",
      codec: downstream(),
      recoverStream: async () => new Response("data: recovered\n\n"),
    });
    const connected = transport.connect();
    await flush();
    const socket = FakeWebSocket.last();
    socket.open();
    await connected;
    const response = await transport.request(chat("x", request.signal), async () =>
      new Response(JSON.stringify({ id: "exec_9" }), { status: 202 }));
    socket.receive({ id: "exec_9", end: "detached" });
    expect(await response.text()).toBe("data: recovered\n\n");
    await flush();
    const listeners = (calls: unknown[][]) => calls.filter(([type]) => type === "abort").map(([, listener]) => listener);
    expect(listeners(add.mock.calls).length).toBeGreaterThan(1);
    expect(listeners(remove.mock.calls)).toEqual(expect.arrayContaining(listeners(add.mock.calls)));
    transport.destroy?.();
  });

  it("ends a 202 stream it cannot serve when no recovery is configured", async () => {
    const transport = make({
      onStreamLost: "close",
      codec: { ...downstream(), classifyClose: (code) => (code === 4403 ? "disable" : "reconnect") },
    });
    const connected = transport.connect();
    await flush();
    const socket = FakeWebSocket.last();
    socket.open();
    await connected;
    const response = await transport.request(chat("x"), async () => {
      socket.serverClose(4403);
      return new Response(JSON.stringify({ id: "exec_9" }), { status: 202 });
    });
    const text = response.text();
    expect(await Promise.race([text, new Promise((resolve) => setTimeout(resolve, 50, "open"))])).toBe("");
    transport.destroy?.();
  });

  it("keeps a 200 SSE answer on HTTP even while the socket is ready", async () => {
    const transport = make({ codec: downstream() });
    const connected = transport.connect();
    await flush();
    FakeWebSocket.last().open();
    await connected;
    const response = await transport.request(chat("x"), async () => new Response("data: {}\n\n", { status: 200 }));
    expect(await response.text()).toBe("data: {}\n\n");
    transport.destroy?.();
  });
});
