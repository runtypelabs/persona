import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentWidgetSession } from "./session";
import { createDemoHistoryProvider } from "./internal/demo-history-provider";
import type { AgentWidgetConfig, BackgroundConversationAdapter, ConversationExecutionState } from "./types";

const sessions: AgentWidgetSession[] = [];
afterEach(() => { sessions.splice(0).forEach((session) => session.destroy()); vi.restoreAllMocks(); });
const encoder = new TextEncoder();
const frame = (id: number, type: string, data: Record<string, unknown> = {}) =>
  `id: ${id}\nevent: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
const delta = (id: number, text: string, executionId = "exec-a") => frame(id, "text_delta", { id: "text-a", delta: text, executionId });
const terminal = frame(3, "execution_complete", { success: true, kind: "agent" });
function response(frames: string[]) {
  return new Response(new ReadableStream({ start(controller) {
    frames.forEach((value) => controller.enqueue(encoder.encode(value)));
    controller.close();
  } }));
}
async function settle(predicate: () => boolean) { await vi.waitFor(() => expect(predicate()).toBe(true)); }
function setup(patch: Partial<AgentWidgetConfig> = {}) {
  const provider = createDemoHistoryProvider({ conversations: ["a", "b", "c"].map((id) => ({
    id, title: id, messages: [{ id: `history-${id}`, role: "assistant", content: `History ${id}` }],
  })) });
  let streamController!: ReadableStreamDefaultController<Uint8Array>;
  const cancelled = vi.fn();
  const live = new ReadableStream<Uint8Array>({ start(controller) { streamController = controller; }, cancel: cancelled });
  const states: ConversationExecutionState[] = [];
  const reconnectStream = vi.fn(async (_ctx: Parameters<BackgroundConversationAdapter["reconnectStream"]>[0]) => response([delta(2, " world"), terminal]));
  let statusListener: ((status: ConversationExecutionState["status"]) => void) | undefined;
  const unsubscribe = vi.fn();
  const adapter: BackgroundConversationAdapter = {
    capabilities: { durableExecution: true, readOnlyReplay: true }, reconnectStream,
    subscribeStatus: (_ctx, callback) => { statusListener = callback; return unsubscribe; },
  };
  const session = new AgentWidgetSession({
    apiUrl: "/chat", customFetch: async () => new Response(live), backgroundConversations: adapter,
    onConversationExecutionState: (state) => states.push(state), ...patch,
  }, { onMessagesChanged: () => {}, onStatusChanged: () => {}, onStreamingChanged: () => {} }, { historyProvider: provider });
  sessions.push(session);
  return { session, provider, streamController, cancelled, adapter, reconnectStream, states, unsubscribe,
    report: (status: ConversationExecutionState["status"]) => statusListener?.(status) };
}
async function start(s: ReturnType<typeof setup>) {
  await s.session.openConversation("a");
  const sending = s.session.sendMessage("Hi");
  s.streamController.enqueue(encoder.encode(delta(1, "Hello")));
  await settle(() => !!s.session.getResumableHandle());
  return { sending };
}

describe("durable background conversation switching", () => {
  it("detaches after commit, restores the checkpoint rather than newer history, and catches up once", async () => {
    const s = setup();
    const { sending } = await start(s);
    s.session.upsertArtifact({ id: "artifact-a", artifactType: "markdown", title: "A", content: "partial" });
    await s.session.openConversation("b", { busy: "background" });
    await sending;
    expect(s.cancelled).toHaveBeenCalledOnce();
    expect(s.session.getMessages().map((m) => m.content)).toEqual(["History b"]);
    s.provider.appendMessage("a", { id: "server-finished", role: "assistant", content: "Hello world" });
    s.report("completed");
    expect(s.states[s.states.length - 1]).toMatchObject({ conversationId: "a", executionId: "exec-a", status: "completed", detached: true });
    await s.session.openConversation("a");
    await settle(() => s.reconnectStream.mock.calls.length === 1 && !s.session.isStreaming());
    expect(s.reconnectStream.mock.calls[0][0]).toMatchObject({ conversationId: "a", executionId: "exec-a", after: "1" });
    const messages = s.session.getMessages();
    expect(messages.filter((m) => m.content === "Hello world")).toHaveLength(1);
    expect(messages.some((m) => m.id === "server-finished")).toBe(false);
    expect(s.session.getArtifactById("artifact-a")?.title).toBe("A");
    expect(s.states[s.states.length - 1]).toMatchObject({ status: "completed", detached: false });
    expect(s.unsubscribe).toHaveBeenCalledOnce();
  });

  it("rejects a legacy reconnect closure before provider calls or transport mutation", async () => {
    const s = setup({ backgroundConversations: undefined, reconnectStream: vi.fn() });
    const { sending } = await start(s);
    const page = vi.spyOn(s.provider, "getPage");
    await expect(s.session.openConversation("b", { busy: "background" })).rejects.toMatchObject({ code: "background_unavailable" });
    expect(page).not.toHaveBeenCalled();
    expect(s.cancelled).not.toHaveBeenCalled();
    expect(s.session.getActiveConversationId()).toBe("a");
    s.session.cancel();
    expect(s.cancelled).not.toHaveBeenCalled();
    // Legacy customFetch owns producer teardown, as before background support.
    s.streamController.close(); await sending;
  });

  it("preserves a live run after failed and superseded background preparation", async () => {
    const s = setup(); const { sending } = await start(s);
    s.provider.failNext("prepareOpen", { code: "unavailable" });
    await expect(s.session.openConversation("b", { busy: "background" })).rejects.toMatchObject({ code: "unavailable" });
    expect(s.cancelled).not.toHaveBeenCalled();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const page = s.provider.getPage.bind(s.provider);
    vi.spyOn(s.provider, "getPage").mockImplementation(async (id, opts) => { if (id === "b") await held; return page(id, opts); });
    const losing = s.session.openConversation("b", { busy: "background" }).catch((error: unknown) => error);
    await s.session.openConversation("c", { busy: "background" });
    release();
    expect(await losing).toMatchObject({ code: "superseded" });
    expect(s.session.getActiveConversationId()).toBe("c");
    await sending;
  });

  it("preserves the active transport when an activation commit rejects", async () => {
    const s = setup(); const { sending } = await start(s);
    const prepare = s.provider.prepareOpen.bind(s.provider);
    vi.spyOn(s.provider, "prepareOpen").mockImplementation(async (id, opts) => ({ ...(await prepare(id, opts)), commit: async () => { throw new Error("Commit failed"); } }));
    await expect(s.session.openConversation("b", { busy: "background" })).rejects.toThrow("Commit failed");
    expect(s.cancelled).not.toHaveBeenCalled();
    s.streamController.enqueue(encoder.encode(delta(2, " still here")));
    await settle(() => s.session.getMessages().some((m) => m.content === "Hello still here"));
    expect(s.session.getActiveConversationId()).toBe("a");
    s.session.cancel(); await sending;
  });

  it("without a status source stays last-known until replay, and ignores late status after destruction", async () => {
    const s = setup(); delete s.adapter.subscribeStatus;
    const { sending } = await start(s);
    await s.session.openConversation("b", { busy: "background" }); await sending;
    expect(s.states[s.states.length - 1]).toMatchObject({ status: "running", detached: true });
    const count = s.states.length; s.session.destroy(); s.report("completed");
    expect(s.states).toHaveLength(count);
  });

  it.each(["delete", "identity", "provider", "reset"] as const)("clears checkpoint and subscription on %s", async (boundary) => {
    const s = setup(); const { sending } = await start(s);
    await s.session.openConversation("b", { busy: "background" }); await sending;
    if (boundary === "delete") await s.session.deleteConversation("a");
    if (boundary === "identity") s.provider.setIdentityStatus({ state: "unavailable", reason: "history_disabled" });
    if (boundary === "provider") s.session.setHistoryInternals({ historyProvider: { ...s.provider } });
    if (boundary === "reset") s.session.clearMessages();
    expect(s.unsubscribe).toHaveBeenCalledOnce();
    const count = s.states.length; s.report("completed"); expect(s.states).toHaveLength(count);
    if (boundary !== "delete") {
      await s.session.openConversation("a");
      expect(s.reconnectStream).not.toHaveBeenCalled();
    }
  });

  it("rejects a turn before its durable cursor is known", async () => {
    const s = setup(); await s.session.openConversation("a");
    const sending = s.session.sendMessage("Hi");
    await expect(s.session.openConversation("b", { busy: "background" })).rejects.toMatchObject({ code: "conversation_busy" });
    expect(s.cancelled).not.toHaveBeenCalled(); s.session.cancel(); await sending;
  });
  it.each(["text-complete", "text-start"] as const)("keeps separate text blocks when detaching at %s", async (boundary) => {
    const s = setup(); const { sending } = await start(s);
    const tail = [
      frame(2, "text_complete", { id: "text-a", text: "Hello" }),
      frame(3, "text_start", { id: "text-b" }),
      frame(4, "text_delta", { id: "text-b", delta: "Second block", executionId: "exec-a" }),
      frame(5, "execution_complete", { success: true, kind: "agent" }),
    ];
    if (boundary === "text-start") {
      s.streamController.enqueue(encoder.encode(tail[0] + tail[1]));
      await settle(() => s.session.getResumableHandle()?.lastEventId === "3");
    }
    s.reconnectStream.mockImplementation(async (ctx) => response(tail.filter((_, index) => index + 2 > Number(ctx.after))));
    await s.session.openConversation("b", { busy: "background" }); await sending;
    await s.session.openConversation("a");
    await settle(() => s.reconnectStream.mock.calls.length === 1 && !s.session.isStreaming());
    const contents = s.session.getMessages().filter((m) => m.role === "assistant" && !m.variant).map((m) => m.content);
    expect(contents).toEqual(["History a", "Hello", "Second block"]);
  });

  it("restores raw structured text before replaying more deltas", async () => {
    const s = setup({ streamParser: () => ({
      processChunk: (raw) => { try { return JSON.parse(raw).text; } catch { return "Part"; } },
      getExtractedText: () => null,
    }) });
    await s.session.openConversation("a"); const sending = s.session.sendMessage("Hi");
    s.streamController.enqueue(encoder.encode(delta(1, '{"text":"Part')));
    await settle(() => !!s.session.getResumableHandle());
    s.reconnectStream.mockImplementation(async () => response([delta(2, 'ial"}'), terminal]));
    await s.session.openConversation("b", { busy: "background" }); await sending;
    await s.session.openConversation("a");
    await settle(() => s.reconnectStream.mock.calls.length === 1 && !s.session.isStreaming());
    expect(s.session.getMessages().some((m) => m.content === "Partial")).toBe(true);
  });

  it("replays a browser tool await read-only once and surfaces attention", async () => {
    const s = setup(); const { sending } = await start(s);
    s.reconnectStream.mockImplementation(async () => response([frame(2, "await", {
      executionId: "exec-a", toolName: "webmcp:lookup", origin: "webmcp", toolCallId: "lookup-1", parameters: {},
    })]));
    const resolve = vi.spyOn(s.session, "resolveWebMcpToolCall");
    await s.session.openConversation("b", { busy: "background" }); await sending;
    await s.session.openConversation("a");
    await settle(() => s.states.some((state) => state.status === "needs-attention" && !state.detached));
    await new Promise((done) => setTimeout(done, 10));
    expect(resolve).not.toHaveBeenCalled();
    expect(s.reconnectStream).toHaveBeenCalledOnce();
    expect(s.session.getMessages().filter((m) => m.toolCall?.id === "lookup-1")).toHaveLength(1);
    await expect(s.session.openConversation("b", { busy: "background" })).rejects.toMatchObject({ code: "conversation_busy" });
  });

  it("does not report local stop as completed or failed server work", async () => {
    const s = setup(); const { sending } = await start(s);
    s.session.cancel(); await sending;
    expect(s.states.some((state) => ["completed", "failed"].includes(state.status))).toBe(false);
  });

  it("isolates throwing observers and ignores a synchronous initial identity notification", async () => {
    const s = setup({ onConversationExecutionState: () => { throw new Error("Observer failed"); } });
    const subscribe = s.provider.subscribeIdentityStatus.bind(s.provider);
    vi.spyOn(s.provider, "subscribeIdentityStatus").mockImplementation((callback) => {
      callback(s.provider.getIdentityStatus()); return subscribe(callback);
    });
    const { sending } = await start(s);
    await s.session.openConversation("b", { busy: "background" }); await sending;
    await s.session.openConversation("a");
    await settle(() => s.reconnectStream.mock.calls.length === 1 && !s.session.isStreaming());
    expect(s.session.getMessages().some((m) => m.content === "Hello world")).toBe(true);
  });

  it("keeps a pending approval in the original conversation when background switching is unsafe", async () => {
    const s = setup(); const { sending } = await start(s);
    s.streamController.enqueue(encoder.encode(frame(2, "approval_start", { approvalId: "approve-a", executionId: "exec-a", toolName: "charge" })));
    await settle(() => s.session.getMessages().some((m) => m.approval?.status === "pending"));
    await expect(s.session.openConversation("b", { busy: "background" })).rejects.toMatchObject({ code: "conversation_busy" });
    expect(s.cancelled).not.toHaveBeenCalled(); s.session.cancel(); await sending;
  });

  it("buffers awaits arriving during commit and leaves them for read-only recovery", async () => {
    const s = setup(); const { sending } = await start(s);
    let release!: () => void;
    let entered!: () => void;
    const pending = new Promise<void>((done) => { release = done; });
    const committed = new Promise<void>((done) => { entered = done; });
    const prepare = s.provider.prepareOpen.bind(s.provider);
    vi.spyOn(s.provider, "prepareOpen").mockImplementation(async (id, opts) => {
      const activation = await prepare(id, opts);
      return { ...activation, commit: async () => { entered(); await pending; await activation.commit(); } };
    });
    const resolve = vi.spyOn(s.session, "resolveWebMcpToolCall");
    const opening = s.session.openConversation("b", { busy: "background" }); await committed;
    s.streamController.enqueue(encoder.encode(frame(2, "await", { executionId: "exec-a", toolName: "webmcp:lookup", toolCallId: "lookup-1", parameters: {} })));
    await new Promise((done) => setTimeout(done, 0)); release(); await opening; await sending;
    expect(resolve).not.toHaveBeenCalled(); expect(s.session.getActiveConversationId()).toBe("b");
  });

  it("reports failure for an identified execution before any text is emitted", async () => {
    const s = setup(); await s.session.openConversation("a");
    const sending = s.session.sendMessage("Hi");
    s.streamController.enqueue(encoder.encode(frame(1, "execution_start", { executionId: "exec-empty", kind: "agent" }) +
      frame(2, "execution_error", { executionId: "exec-empty", error: "Failed before text" })));
    s.streamController.close(); await sending;
    expect(s.states).toContainEqual({ conversationId: "a", executionId: "exec-empty", status: "failed", detached: false });
  });

  it("reconciles a sealed flow text block rather than duplicating its final response", async () => {
    const s = setup(); await s.session.openConversation("a");
    const sending = s.session.sendMessage("Hi");
    s.streamController.enqueue(encoder.encode(
      frame(1, "execution_start", { executionId: "exec-a", kind: "flow" }) +
      frame(2, "text_start", { id: "flow-a" }) +
      frame(3, "text_delta", { id: "flow-a", delta: "Flow answer", executionId: "exec-a" }) +
      frame(4, "text_complete", { id: "flow-a", text: "Flow answer" })
    ));
    await settle(() => s.session.getResumableHandle()?.lastEventId === "4");
    s.reconnectStream.mockImplementation(async () => response([
      frame(5, "step_complete", { stepType: "prompt", result: { response: "Flow answer" } }),
      frame(6, "execution_complete", { success: true, kind: "flow" }),
    ]));
    await s.session.openConversation("b", { busy: "background" }); await sending;
    await s.session.openConversation("a");
    await settle(() => s.reconnectStream.mock.calls.length === 1 && !s.session.isStreaming());
    expect(s.session.getMessages().filter((m) => m.content === "Flow answer")).toHaveLength(1);
  });

});
