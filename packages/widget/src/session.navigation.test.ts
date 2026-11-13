import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentWidgetSession } from "./session";
import { AgentWidgetClient, type ClientRealtimeHandlers } from "./client";
import type { AgentWidgetMessage, AgentWidgetNavigatingToolCall } from "./types";
import { restoreBrowserToolState } from "./utils/restored-browser-state";
import { createRuntypeRealtimeTransport } from "./runtype-realtime";
import { FakeWebSocket } from "./testing/fake-websocket";
import { resumeFlow as postResume, type ClientResumeHost } from "./client-resume";

const flushMicrotasks = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const navigateAwait = (): AgentWidgetMessage => ({
  id: "tool-call_nav",
  role: "assistant",
  content: "",
  createdAt: new Date().toISOString(),
  agentMetadata: { executionId: "exec_1", awaitingLocalTool: true, webMcpToolCallId: "call_nav" },
  toolCall: { id: "call_nav", name: "webmcp:navigate", status: "running", args: { url: "/page-2" } },
});

/** A session booted on page 2, holding page 1's persisted transcript. */
function bootSession(initialMessages: AgentWidgetMessage[]) {
  const session = new AgentWidgetSession(
    {
      apiUrl: "http://test",
      webmcp: { enabled: true },
      initialMessages,
      reconnectStream: vi.fn(async () => new Response(new ReadableStream({ start: (c) => c.close() }))),
    },
    { onMessagesChanged: () => undefined, onStatusChanged: () => undefined, onStreamingChanged: () => undefined }
  );
  const client = (session as unknown as { client: Record<string, unknown> }).client;
  const execute = vi.fn(async () => ({ content: [{ type: "text", text: "navigated again" }] }));
  client.executeWebMcpToolCall = vi.fn(() => execute());
  client.isWebMcpOperational = vi.fn(() => true);
  const resume = vi.fn(async () => new Response("", { status: 200 }));
  client.resumeFlow = resume;
  (session as unknown as { connectStream: () => Promise<void> }).connectStream = vi.fn(async () => undefined);
  const feed = (message: AgentWidgetMessage) =>
    (session as unknown as { handleEvent: (e: unknown) => void }).handleEvent({ type: "message", message });
  const endStream = () =>
    (session as unknown as { handleEvent: (e: unknown) => void }).handleEvent({ type: "status", status: "idle" });
  return { session, execute, resume, feed, endStream };
}

const call: AgentWidgetNavigatingToolCall = {
  executionId: "exec_1",
  toolCallId: "call_nav",
  toolName: "webmcp:navigate",
  resumeKey: "call_nav",
};
const arrival = { navigated: true, url: "https://example.test/page-2", title: "Page 2" };
const location = { href: "https://example.test/page-2", origin: "https://example.test" };
const record = (extra: Record<string, unknown> = {}) => ({
  calls: [call],
  to: "https://example.test/page-2",
  at: Date.now(),
  ...extra,
});
const resume = { executionId: "exec_1", after: "17" };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("navigating page tool across an MPA navigation", () => {
  it("existing behavior: a replayed await on the new page re-runs the tool (the double-fire)", async () => {
    const h = bootSession([restoreBrowserToolState(navigateAwait())]);
    h.feed(navigateAwait());
    h.endStream();
    await flushMicrotasks();
    expect(h.execute).toHaveBeenCalledTimes(1);
  });

  it("answers the navigated call with the arrival through /resume and never re-runs it", async () => {
    const h = bootSession([restoreBrowserToolState(navigateAwait())]);
    expect(await h.session.resumeNavigatedToolCalls(record(), resume, arrival, location)).toBe(true);
    await flushMicrotasks();
    expect(h.execute).not.toHaveBeenCalled();
    expect(h.resume).toHaveBeenCalledTimes(1);
    const [executionId, outputs, options] = h.resume.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
      { after?: string } | undefined,
    ];
    expect(executionId).toBe("exec_1");
    expect(outputs).toEqual({ ["call_nav"]: arrival });
    expect(options?.after).toBe("17");

    // The server replays the await (cursor before it): still answered, not re-run.
    h.feed(navigateAwait());
    h.endStream();
    await flushMicrotasks();
    expect(h.execute).not.toHaveBeenCalled();
    expect(h.resume).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the restored transcript lacks the call", async () => {
    const h = bootSession([]);
    expect(await h.session.resumeNavigatedToolCalls(record(), resume, arrival, location)).toBe(false);
    expect(h.resume).not.toHaveBeenCalled();
  });

  it.each([
    ["stale", record({ at: Date.now() - 120_000 })],
    ["cross-origin", record({ to: "https://elsewhere.test/page" })],
    ["for another execution", record({ calls: [{ ...call, executionId: "exec_other" }] })],
  ])("ignores a %s navigation record", async (_label, stored) => {
    const h = bootSession([restoreBrowserToolState(navigateAwait())]);
    expect(await h.session.resumeNavigatedToolCalls(stored, resume, arrival, location)).toBe(false);
    expect(h.resume).not.toHaveBeenCalled();
  });

  it("lists in-flight page-tool calls for the pagehide record", async () => {
    let release!: () => void;
    const h = bootSession([]);
    h.execute.mockImplementation(() => new Promise((resolve) => {
      release = () => resolve({ content: [{ type: "text", text: "done" }] });
    }));
    h.feed(navigateAwait());
    h.endStream();
    await flushMicrotasks();
    expect(h.session.getInflightBrowserToolCalls()).toEqual([call]);
    release();
    await flushMicrotasks();
    expect(h.session.getInflightBrowserToolCalls()).toEqual([]);
  });

  it("leaves a confirmed call out of the navigation record while its resumed leg streams", async () => {
    const h = bootSession([]);
    h.resume.mockImplementation(async () => new Response(new ReadableStream(), { status: 200 }));
    (h.session as unknown as { connectStream: () => Promise<void> }).connectStream = vi.fn(() => new Promise<void>(() => undefined));
    h.feed(navigateAwait());
    h.endStream();
    await flushMicrotasks();
    expect(h.resume).toHaveBeenCalledTimes(1);
    expect(h.session.getInflightBrowserToolCalls()).toEqual([]);
  });

  it("lists a call again when its /resume fails, so a later navigation still records it", async () => {
    const h = bootSession([]);
    h.resume.mockImplementation(async () => new Response("{}", { status: 500 }));
    let release!: () => void;
    h.execute.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve({ content: [{ type: "text", text: "done" }] });
    }));
    h.feed(navigateAwait());
    h.endStream();
    await flushMicrotasks();
    expect(h.session.getInflightBrowserToolCalls()).toEqual([call]);
    release();
    await flushMicrotasks();
    expect(h.resume).toHaveBeenCalledTimes(1);
    h.feed(navigateAwait());
    h.endStream();
    await flushMicrotasks();
    expect(h.execute).toHaveBeenCalledTimes(2);
  });

  it("reattaches from the handle when the arrival answer is rejected because the old page already answered", async () => {
    const onError = vi.fn();
    const h = bootSession([restoreBrowserToolState(navigateAwait())]);
    (h.session as unknown as { callbacks: { onError?: unknown } }).callbacks.onError = onError;
    const reconnect = vi.fn(async () => new Response(new ReadableStream()));
    (h.session as unknown as { config: { reconnectStream: unknown } }).config.reconnectStream = reconnect;
    h.resume.mockImplementation(async () =>
      Response.json({ error: "Execution is not awaiting a resume" }, { status: 409 }));
    expect(await h.session.resumeNavigatedToolCalls(record(), resume, arrival, location)).toBe(true);
    // WHY: the reattach starts once the lazy reconnect chunk loads, which is real I/O the first time in a worker.
    await vi.waitFor(() => expect(reconnect).toHaveBeenCalled());
    expect(h.resume).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(reconnect.mock.calls[0]).toEqual([expect.objectContaining({ executionId: "exec_1", after: "17" })]);
    expect(h.execute).not.toHaveBeenCalled();
  });
});

const produced = { content: [{ type: "text", text: "navigated again" }] };

/** The real `/resume` request builder, with one of its awaits held until `open()`. */
function heldResume(gate: string) {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  const posted = vi.fn(async (_request: unknown) => new Response("", { status: 200 }));
  const hold = async <T>(name: string, value: T) => {
    if (name === gate) await opened;
    return value;
  };
  const host = {
    config: { clientToken: "ct_test" },
    headers: {},
    getHeaders: () => hold("header building", {}),
    debug: false,
    clientApiBase: () => "https://api.example.test",
    getClientApiUrl: () => "https://api.example.test/v1/client/resume",
    getWebMcpBridge: () => hold("the page-tool snapshot", { snapshotForDispatch: async () => [] }),
    sendWithClientToolsDiff: async (_id: string, _tools: unknown, send: (fields: object) => Promise<Response>) =>
      ({ response: await send({}), commit: () => undefined }),
    initSession: () => hold("session renewal", { sessionId: "sess_1", durableRecovery: { enabled: true } }),
    readVisitorToken: () => hold("the visitor credential", "visitor_1"),
    isClientTokenMode: () => true,
    transportFetch: async (request: unknown) => {
      await hold("the socket", null);
      return posted(request);
    },
  } as unknown as ClientResumeHost;
  const resumeFlow = (id: string, outputs: Record<string, unknown>, options?: object) => postResume(host, id, outputs, options);
  return { open, posted, resumeFlow };
}

describe("a page-tool answer is unanswered, produced, or confirmed", () => {
  it.each(["session renewal", "the visitor credential", "header building", "the page-tool snapshot", "the socket"])(
    "records the produced answer with its output while the /resume waits on %s",
    async (gate) => {
      const h = bootSession([]);
      const held = heldResume(gate);
      (h.session as unknown as { client: { resumeFlow: unknown } }).client.resumeFlow = held.resumeFlow;
      h.feed(navigateAwait());
      h.endStream();
      await flushMicrotasks();
      expect(held.posted).not.toHaveBeenCalled();
      expect(h.session.getInflightBrowserToolCalls()).toEqual([{ ...call, output: produced }]);
      held.open();
      await flushMicrotasks();
      await flushMicrotasks();
      expect(held.posted).toHaveBeenCalledTimes(1);
      expect(h.session.getInflightBrowserToolCalls()).toEqual([]);
    }
  );

  it("re-sends a produced answer whose /resume left before the navigation; a 409 reattaches with no error", async () => {
    const pageOne = bootSession([]);
    pageOne.resume.mockImplementation(() => new Promise<Response>(() => undefined));
    pageOne.feed(navigateAwait());
    pageOne.endStream();
    await flushMicrotasks();
    expect(pageOne.resume).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(JSON.stringify(record({ calls: pageOne.session.getInflightBrowserToolCalls() })));

    const pageTwo = bootSession([restoreBrowserToolState(navigateAwait())]);
    const onError = vi.fn();
    (pageTwo.session as unknown as { callbacks: { onError?: unknown } }).callbacks.onError = onError;
    const reconnect = vi.fn(async () => new Response(new ReadableStream()));
    (pageTwo.session as unknown as { config: { reconnectStream: unknown } }).config.reconnectStream = reconnect;
    pageTwo.resume.mockImplementation(async () =>
      Response.json({ error: "Execution is not awaiting a resume" }, { status: 409 }));
    expect(await pageTwo.session.resumeNavigatedToolCalls(stored, resume, arrival, location)).toBe(true);
    // WHY: the reattach starts once the lazy reconnect chunk loads, which is real I/O the first time in a worker.
    await vi.waitFor(() => expect(reconnect).toHaveBeenCalled());
    expect((pageTwo.resume.mock.calls as unknown as unknown[][])[0]?.[1]).toEqual({ ["call_nav"]: produced });
    expect(onError).not.toHaveBeenCalled();
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(pageOne.execute).toHaveBeenCalledTimes(1);
    expect(pageTwo.execute).not.toHaveBeenCalled();
  });

  it("puts a produced answer back to unanswered when its /resume fails", async () => {
    const h = bootSession([]);
    let fail!: () => void;
    h.resume.mockImplementationOnce(() => new Promise<Response>((resolve) => {
      fail = () => resolve(new Response("{}", { status: 500 }));
    }));
    let release!: () => void;
    h.execute.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve(produced);
    }));
    h.feed(navigateAwait());
    h.endStream();
    await flushMicrotasks();
    expect(h.session.getInflightBrowserToolCalls()).toEqual([call]);
    release();
    await flushMicrotasks();
    expect(h.session.getInflightBrowserToolCalls()).toEqual([{ ...call, output: produced }]);
    fail();
    await flushMicrotasks();
    expect(h.session.getInflightBrowserToolCalls()).toEqual([]);
    h.execute.mockImplementationOnce(() => new Promise(() => undefined));
    h.feed(navigateAwait());
    h.endStream();
    await flushMicrotasks();
    expect(h.execute).toHaveBeenCalledTimes(2);
    expect(h.session.getInflightBrowserToolCalls()).toEqual([call]);
  });
});

describe("turns started in another tab", () => {
  function sessionWithHandlers() {
    let handlers: ClientRealtimeHandlers = {};
    vi.spyOn(AgentWidgetClient.prototype, "setRealtimeHandlers").mockImplementation((next) => {
      handlers = next;
    });
    const messages: AgentWidgetMessage[][] = [];
    const session = new AgentWidgetSession(
      { apiUrl: "http://test" },
      { onMessagesChanged: (m) => messages.push(m), onStatusChanged: () => undefined, onStreamingChanged: () => undefined }
    );
    return { session, handlers: () => handlers, messages };
  }

  const sse = (text: string) =>
    new Response(
      `id: 1\nevent: text_delta\ndata: ${JSON.stringify({ type: "text_delta", id: "t", delta: text, executionId: "exec_b" })}\n\n` +
      `id: 2\nevent: execution_complete\ndata: ${JSON.stringify({ type: "execution_complete", success: true, kind: "agent", executionId: "exec_b" })}\n\n`,
      { headers: { "Content-Type": "text/event-stream" } }
    );

  it("renders another tab's turn while idle", async () => {
    const h = sessionWithHandlers();
    const open = vi.fn(() => sse("from tab B"));
    expect(h.handlers().onForeignExecution?.("exec_b", open)).toBe(true);
    await vi.waitFor(() =>
      expect(h.session.getMessages().some((m) => m.role === "assistant" && m.content === "from tab B")).toBe(true)
    );
  });

  it("shows another tab's page-tool await without running the tool here", async () => {
    let handlers: ClientRealtimeHandlers = {};
    vi.spyOn(AgentWidgetClient.prototype, "setRealtimeHandlers").mockImplementation((next) => {
      handlers = next;
    });
    const session = new AgentWidgetSession(
      { apiUrl: "http://test", webmcp: { enabled: true, autoApprove: () => true } },
      { onMessagesChanged: () => undefined, onStatusChanged: () => undefined, onStreamingChanged: () => undefined }
    );
    const resolve = vi.spyOn(session, "resolveWebMcpToolCall");
    const awaitFrame = `id: 1\nevent: await\ndata: ${JSON.stringify({
      type: "await", executionId: "exec_b", toolName: "webmcp:lookup", origin: "webmcp", toolCallId: "lookup-1", parameters: {},
    })}\n\n`;
    const open = vi.fn(() => new Response(awaitFrame, { headers: { "Content-Type": "text/event-stream" } }));
    expect(handlers.onForeignExecution?.("exec_b", open)).toBe(true);
    await vi.waitFor(() => expect(session.getMessages().some((m) => m.toolCall?.id === "lookup-1")).toBe(true));
    await new Promise((done) => setTimeout(done, 10));
    expect(resolve).not.toHaveBeenCalled();
  });

  it("keeps watching another tab's turn through its page-tool pause and later turns, never running the tool", async () => {
    let handlers: ClientRealtimeHandlers = {};
    vi.spyOn(AgentWidgetClient.prototype, "setRealtimeHandlers").mockImplementation((next) => {
      handlers = next;
    });
    const session = new AgentWidgetSession(
      { apiUrl: "http://test", webmcp: { enabled: true, autoApprove: () => true } },
      { onMessagesChanged: () => undefined, onStatusChanged: () => undefined, onStreamingChanged: () => undefined }
    );
    const resolve = vi.spyOn(session, "resolveWebMcpToolCall");
    const frame = (id: number, type: string, data: Record<string, unknown>) =>
      `id: ${id}\nevent: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
    const stream = (...frames: string[]) => () => new Response(frames.join(""), { headers: { "Content-Type": "text/event-stream" } });
    const assistantTexts = () => session.getMessages().filter((m) => m.role === "assistant" && m.content).map((m) => m.content);

    expect(handlers.onForeignExecution?.("exec_b", stream(
      frame(1, "await", { executionId: "exec_b", toolName: "webmcp:lookup", origin: "webmcp", toolCallId: "lookup-1", parameters: {} }),
    ))).toBe(true);
    await vi.waitFor(() => expect(session.getMessages().some((m) => m.toolCall?.id === "lookup-1")).toBe(true));
    await vi.waitFor(() => expect(session.isStreaming()).toBe(false));

    // The owning tab ran the tool and resumed: the continuation arrives as the same execution.
    expect(handlers.onForeignExecution?.("exec_b", stream(
      frame(2, "text_delta", { id: "t_b", delta: "resumed reply", executionId: "exec_b" }),
      frame(3, "execution_complete", { success: true, kind: "agent", executionId: "exec_b" }),
    ))).toBe(true);
    await vi.waitFor(() => expect(assistantTexts()).toContain("resumed reply"));
    await vi.waitFor(() => expect(session.isStreaming()).toBe(false));

    expect(handlers.onForeignExecution?.("exec_c", stream(
      frame(1, "text_delta", { id: "t_c", delta: "next turn", executionId: "exec_c" }),
      frame(2, "execution_complete", { success: true, kind: "agent", executionId: "exec_c" }),
    ))).toBe(true);
    await vi.waitFor(() => expect(assistantTexts()).toContain("next turn"));
    await new Promise((done) => setTimeout(done, 10));
    expect(resolve).not.toHaveBeenCalled();
    expect(session.getResumableHandle()).toBeNull();
  });

  it("never answers a watched turn's question or approval from this tab", async () => {
    let handlers: ClientRealtimeHandlers = {};
    vi.spyOn(AgentWidgetClient.prototype, "setRealtimeHandlers").mockImplementation((next) => {
      handlers = next;
    });
    const fetchSpy = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const session = new AgentWidgetSession(
      { apiUrl: "http://test" },
      { onMessagesChanged: () => undefined, onStatusChanged: () => undefined, onStreamingChanged: () => undefined }
    );
    const frame = (id: number, data: Record<string, unknown>) =>
      `id: ${id}\nevent: ${String(data.type)}\ndata: ${JSON.stringify(data)}\n\n`;
    // One paused leg can carry more than the question: text before it and a parallel page-tool await after it.
    const pausedLeg = [
      frame(1, { type: "text_delta", id: "t_paused", delta: "one moment", executionId: "exec_b" }),
      frame(2, { type: "await", executionId: "exec_b", toolName: "ask_user_question", origin: "local", toolCallId: "ask-1",
        parameters: { question: "Which?", options: ["a", "b"] } }),
      frame(3, { type: "await", executionId: "exec_b", toolName: "lookup", origin: "webmcp", toolCallId: "lookup-1", parameters: {} }),
    ].join("");
    expect(handlers.onForeignExecution?.("exec_b", () => new Response(pausedLeg))).toBe(true);
    await vi.waitFor(() => expect(session.getMessages().some((m) => m.toolCall?.id === "ask-1")).toBe(true));
    await vi.waitFor(() => expect(session.isStreaming()).toBe(false));

    const ask = session.getMessages().find((m) => m.toolCall?.id === "ask-1")!;
    expect(session.observed.has("exec_b")).toBe(true);
    expect(ask.agentMetadata?.observed).toBeUndefined();
    await session.resolveAskUserQuestion(ask, "a");
    await session.resolveApproval(
      { id: "appr_1", status: "pending", agentId: "a", executionId: "exec_b", toolName: "t", description: "d" },
      "approved"
    );
    expect(fetchSpy).not.toHaveBeenCalled();

    const meta = (toolCallId: string) => session.getMessages().find((m) => m.toolCall?.id === toolCallId)?.agentMetadata;
    expect(meta("lookup-1")?.awaitingLocalTool).toBe(true);
    expect(meta("ask-1")?.askUserQuestionAnswered).not.toBe(true);

    // The socket reconnects mid-question and replays the paused execution from its start: not an answer.
    expect(handlers.onForeignExecution?.("exec_b", () => new Response(pausedLeg))).toBe(true);
    await vi.waitFor(() => expect(session.isStreaming()).toBe(false));
    expect(meta("ask-1")?.askUserQuestionAnswered).not.toBe(true);

    // The owning tab answered and the turn continued on a later leg: the watched question settles here too.
    expect(handlers.onForeignExecution?.("exec_b", () => new Response(
      frame(4, { type: "execution_start", executionId: "exec_b", resumed: true }) +
      frame(5, { type: "text_delta", id: "t_b", delta: "picked a", executionId: "exec_b" })
    ))).toBe(true);
    await vi.waitFor(() => expect(meta("ask-1")?.askUserQuestionAnswered).toBe(true));
    expect(meta("lookup-1")?.askUserQuestionAnswered).toBeUndefined();
  });

  it("orders sub-row cursors as the server does when settling a watched question", async () => {
    const h = sessionWithHandlers();
    const frame = (id: string, data: Record<string, unknown>) =>
      `id: ${id}\nevent: ${String(data.type)}\ndata: ${JSON.stringify(data)}\n\n`;
    const ask = frame("5.10", { type: "await", executionId: "exec_b", toolName: "ask_user_question", origin: "local",
      toolCallId: "ask-1", parameters: { question: "Which?", options: ["a", "b"] } });
    const answered = () =>
      h.session.getMessages().find((m) => m.toolCall?.id === "ask-1")?.agentMetadata?.askUserQuestionAnswered;
    expect(h.handlers().onForeignExecution?.("exec_b", () => new Response(ask))).toBe(true);
    await vi.waitFor(() => expect(h.session.isStreaming()).toBe(false));

    // 5.2 comes before 5.10 in the row: a replay of it is history, not the answer.
    expect(h.handlers().onForeignExecution?.("exec_b", () => new Response(
      frame("5.2", { type: "text_delta", id: "t_early", delta: "before", executionId: "exec_b" }) + ask
    ))).toBe(true);
    await vi.waitFor(() => expect(h.session.isStreaming()).toBe(false));
    expect(answered()).not.toBe(true);

    // The bare row is the row's last part: past the pause.
    expect(h.handlers().onForeignExecution?.("exec_b", () => new Response(
      frame("5", { type: "text_delta", id: "t_after", delta: "after", executionId: "exec_b" })
    ))).toBe(true);
    await vi.waitFor(() => expect(answered()).toBe(true));
  });

  it("declines this tab's own navigated turn announced while the arrival is still loading", async () => {
    const h = sessionWithHandlers();
    const answering = h.session.resumeNavigatedToolCalls(record(), resume, arrival, location);
    const open = vi.fn(() => sse("x"));
    expect(h.handlers().onForeignExecution?.("exec_1", open)).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(h.session.observed.has("exec_1")).toBe(false);
    await answering;
  });

  it("declines a turn this tab marked as its own at boot, and forgets it with the conversation", () => {
    const h = sessionWithHandlers();
    h.session.markOwnExecution("exec_1");
    const open = vi.fn(() => sse("x"));
    expect(h.handlers().onForeignExecution?.("exec_1", open)).toBe(false);
    expect(open).not.toHaveBeenCalled();
    h.session.clearMessages();
    expect(h.handlers().onForeignExecution?.("exec_1", open)).toBe(true);
  });

  it("declines while this tab is streaming its own turn", () => {
    const h = sessionWithHandlers();
    (h.session as unknown as { streaming: boolean }).streaming = true;
    const open = vi.fn(() => sse("x"));
    expect(h.handlers().onForeignExecution?.("exec_b", open)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});

describe("attach_end{paused} matches an SSE stream that closed on an await", () => {
  const awaitSse =
    `id: 5\nevent: await\ndata: ${JSON.stringify({
      type: "await",
      executionId: "exec_1",
      toolName: "ask_user_question",
      toolCallId: "call_q",
      parameters: { question: "Which size?" },
    })}\n\n`;

  async function run(body: () => Promise<Response>) {
    const reconnectStream = vi.fn(async () => new Response(""));
    const statuses: string[] = [];
    const session = new AgentWidgetSession(
      { apiUrl: "http://test", customFetch: async () => body(), reconnectStream },
      { onMessagesChanged: () => undefined, onStatusChanged: (s) => statuses.push(s), onStreamingChanged: () => undefined }
    );
    await session.sendMessage("hi");
    await vi.waitFor(() => expect(session.isStreaming()).toBe(false));
    const awaiting = session.getMessages().find((m) => m.toolCall?.id === "call_q");
    return {
      reconnects: reconnectStream.mock.calls.length,
      awaiting: awaiting?.agentMetadata?.awaitingLocalTool,
      handle: session.getResumableHandle(),
      status: statuses.at(-1),
    };
  }

  it("leaves the same state: no reconnect, the await pending, the cursor after the await", async () => {
    const viaSse = await run(async () => new Response(awaitSse, { headers: { "Content-Type": "text/event-stream" } }));

    FakeWebSocket.reset();
    const transport = createRuntypeRealtimeTransport({
      advertisement: { protocol: "runtype-client-session-v1", url: "wss://api.example.test/ws" },
      clientToken: "ct_x",
      clientVersion: "persona/test",
      sessionId: () => "s",
      visitorToken: async () => "cvt_x",
      renewSession: async () => {},
      WebSocket: FakeWebSocket,
      lifecycle: null,
    });
    const connected = transport.socket.connect();
    await new Promise((r) => setTimeout(r, 0));
    const socket = FakeWebSocket.last();
    socket.open();
    socket.receive({ type: "hello", protocolVersion: "runtype-client-session-v1", beatIntervalMs: 25000, activeExecutionId: null });
    await connected;
    const viaSocket = await run(async () => {
      const response = await transport.request(
        { kind: "dispatch", url: "https://api.example.test/v1/client/chat", body: {}, init: { method: "POST", body: "{}" } },
        async () => new Response(JSON.stringify({ executionId: "exec_1", delivery: "socket" }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        })
      );
      setTimeout(() => {
        socket.receive({ type: "frame", executionId: "exec_1", sse: awaitSse });
        socket.receive({ type: "attach_end", executionId: "exec_1", reason: "paused" });
      }, 0);
      return response;
    });
    transport.destroy?.();

    expect(viaSse).toMatchObject({ reconnects: 0, awaiting: true });
    expect(viaSocket).toEqual(viaSse);
  });
});
