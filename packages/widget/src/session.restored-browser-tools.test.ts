import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { AgentWidgetSession } from "./session";
import type { AgentWidgetApproval, AgentWidgetConfig, AgentWidgetMessage, AgentWidgetToolCall, WebMcpConfirmInfo } from "./types";
import { BROWSER_TOOL_INTERRUPTION } from "./utils/restored-browser-state";
import { createDemoHistoryProvider } from "./internal/demo-history-provider";
import type { HistoryPageResult } from "./internal/history-provider";

const info: WebMcpConfirmInfo = { toolName: "purchase", args: { quantity: 2 }, reason: "gate" };
const approval = (status: NonNullable<AgentWidgetMessage["approval"]>["status"] = "pending"): AgentWidgetMessage => ({
  id: "approval-webmcp-1", role: "assistant", content: "", createdAt: "2026-01-01",
  variant: "approval", approval: { id: "webmcp-1", status, agentId: "", executionId: "", toolName: info.toolName, toolType: "webmcp", description: "Buy items", parameters: info.args },
});
const tool = (): AgentWidgetMessage => ({
  id: "tool-call-1", role: "assistant", content: "", createdAt: "2026-01-01", streaming: true, variant: "tool",
  agentMetadata: { executionId: "exec-1", awaitingLocalTool: true, webMcpToolCallId: "call-1" },
  toolCall: { id: "call-1", name: `webmcp:${info.toolName}`, status: "running", args: info.args, startedAt: 1000, approvalStatus: "pending" },
});
const makeSession = (config: AgentWidgetConfig = {}) => new AgentWidgetSession(config, {
  onMessagesChanged: vi.fn(), onStatusChanged: vi.fn(), onStreamingChanged: vi.fn(),
});

it("keeps the public approval status unions compatible with existing exhaustive handlers", () => {
  type ExistingStatus = "pending" | "approved" | "denied" | "timeout";
  expectTypeOf<AgentWidgetApproval["status"]>().toEqualTypeOf<ExistingStatus>();
  expectTypeOf<AgentWidgetToolCall["approvalStatus"]>().toEqualTypeOf<ExistingStatus | undefined>();
});

describe.each(["initial", "hydrate"] as const)("browser history via %s", path => {
  const restore = (messages: AgentWidgetMessage[]) => {
    const session = makeSession(path === "initial" ? { initialMessages: messages } : {});
    if (path === "hydrate") session.hydrateMessages(messages);
    return session;
  };
  it("expires the lost callback, settles the tool and preserves the snapshot", () => {
    const snapshot = [approval(), tool()];
    const before = structuredClone(snapshot);
    const session = restore(snapshot);
    expect(session.getMessages()[0].approval).toMatchObject({ status: "timeout", interrupted: true });
    const restored = session.getMessages()[1];
    expect(restored.streaming).toBe(false);
    expect(restored.agentMetadata).toEqual({ ...before[1].agentMetadata, awaitingLocalTool: false });
    expect(restored.toolCall).toEqual({ ...before[1].toolCall, status: "complete", success: false, interrupted: true, error: BROWSER_TOOL_INTERRUPTION, approvalStatus: "timeout", startedAt: undefined });
    expect(restored.toolCall?.durationMs).toBeUndefined();
    expect(restored.toolCall?.completedAt).toBeUndefined();
    session.resolveWebMcpApproval(snapshot[0].id, "approved");
    expect(session.getMessages()[0].approval).toMatchObject({ status: "timeout", interrupted: true });
    expect(snapshot).toEqual(before);
    session.destroy();
  });
  it.each(["timeout", "approved", "denied"] as const)("settles unfinished tools even with a %s approval", status => {
    const session = restore([approval(status), tool()]);
    expect(session.getMessages()[0].approval?.status).toBe(status);
    expect(session.getMessages()[0].approval?.interrupted).toBeUndefined();
    expect(session.getMessages()[1].toolCall?.interrupted).toBe(true);
    session.destroy();
  });
  it("settles cardless and legacy awaits and mixed collections without losing recorded results or timing", () => {
    const message = tool();
    message.toolCall!.status = "complete"; // legacy wire await, not an outcome
    message.tools = [
      { id: "pending", name: `webmcp:${info.toolName}`, status: "pending", args: { sku: "A" }, durationMs: 200 },
      { id: "paired", name: `webmcp:${info.toolName}`, status: "running", startedAt: 10, completedAt: 40 },
      { id: "done", name: `webmcp:${info.toolName}`, status: "complete", success: true, result: { bought: 2 }, startedAt: 10, completedAt: 30, duration: 20 },
      { id: "server", name: "server_search", status: "running", startedAt: 10 },
    ];
    const before = structuredClone(message);
    const session = restore([message]);
    const restored = session.getMessages()[0];
    expect(restored.toolCall?.interrupted).toBe(true);
    expect(restored.tools?.[0]).toMatchObject({ status: "complete", interrupted: true, durationMs: 200 });
    expect(restored.tools?.[1]).toMatchObject({ status: "complete", startedAt: 10, completedAt: 40 });
    expect(restored.tools?.slice(2)).toEqual(before.tools?.slice(2));
    expect(message).toEqual(before);
    session.destroy();
  });
  it("keeps server approval continuations including server gates for WebMCP tools", () => {
    const server = approval();
    server.approval!.executionId = "durable-execution";
    const session = restore([server]);
    expect(session.getMessages()[0].approval).toEqual(server.approval);
    session.destroy();
  });
  it.each(["approved", "denied"] as const)("generates distinct fresh approvals and resolves %s once", async decision => {
    const session = restore([approval()]);
    const pending = session.requestWebMcpApproval(info);
    const fresh = session.getMessages().find(m => m.approval?.status === "pending")!;
    expect(fresh.id).not.toBe("approval-webmcp-1");
    session.resolveWebMcpApproval(fresh.id, decision);
    session.resolveWebMcpApproval(fresh.id, decision === "approved" ? "denied" : "approved");
    expect(await pending).toBe(decision === "approved");
    expect(session.getMessages().find(m => m.id === fresh.id)?.approval?.status).toBe(decision);
    expect(session.getMessages().find(m => m.id === "approval-webmcp-1")?.approval).toMatchObject({ status: "timeout", interrupted: true });
    session.destroy();
  });
});

it("conversation switching also retires browser callbacks", async () => {
  const { createDemoHistoryProvider } = await import("./internal/demo-history-provider");
  const provider = createDemoHistoryProvider();
  const summary = { id: "restored", title: "Restored", targetId: "flow", preview: "", createdAt: "2026-01-01", updatedAt: "2026-01-01", messageCount: 2 };
  const snapshot = [approval(), tool()];
  vi.spyOn(provider, "getPage").mockResolvedValue({ summary, messages: snapshot, conversationRevision: "r1", nextCursor: null });
  vi.spyOn(provider, "prepareOpen").mockResolvedValue({ conversationId: summary.id, conversationRevision: "r1", commit: vi.fn(), discard: vi.fn() });
  const session = new AgentWidgetSession({}, {
    onMessagesChanged: vi.fn(), onStatusChanged: vi.fn(), onStreamingChanged: vi.fn(),
  }, { historyProvider: provider });
  await session.openConversation(summary.id);
  expect(session.getMessages()[0].approval).toMatchObject({ status: "timeout", interrupted: true });
  expect(session.getMessages()[1].toolCall?.interrupted).toBe(true);
  expect(snapshot[0].approval?.status).toBe("pending");
  session.destroy();
});

describe("browser state from provider pages", () => {
  const summary = { id: "restored", title: "Restored", targetId: "flow", preview: "", createdAt: "2026-01-01", updatedAt: "2026-01-02", messageCount: 5 };
  const newer: AgentWidgetMessage = { id: "newer", role: "assistant", content: "Newer reply", createdAt: "2026-01-02" };
  const setup = (messages: AgentWidgetMessage[] = [newer]) => {
    const provider = createDemoHistoryProvider();
    const getPage = vi.spyOn(provider, "getPage");
    const session = new AgentWidgetSession({ initialMessages: messages, getStoredConversationId: () => summary.id }, {
      onMessagesChanged: vi.fn(), onStatusChanged: vi.fn(), onStreamingChanged: vi.fn(),
    }, { historyProvider: provider });
    return { session, getPage };
  };

  it.each(["older", "boot replacement", "boot overlap"] as const)("normalizes the %s page without mutating provider snapshots", async path => {
    const server = approval();
    server.id = "server-gate";
    server.approval = { ...server.approval!, id: "server-gate", executionId: "durable-exec" };
    const done = tool();
    done.id = "completed-tool";
    done.streaming = false;
    done.agentMetadata = { executionId: "done-exec" };
    done.toolCall = { ...done.toolCall!, status: "complete", success: true, result: { bought: 2 }, startedAt: 10, completedAt: 30, durationMs: 20, approvalStatus: "approved" };
    const snapshot = [approval(), tool(), server, done, ...(path === "boot overlap" ? [newer] : [])];
    const before = structuredClone(snapshot);
    const { session, getPage } = setup();
    getPage.mockResolvedValue({ summary, messages: snapshot, conversationRevision: "r1", nextCursor: null });
    if (path === "older") {
      const page = await session.loadOlderMessages(summary.id, "older");
      expect(page.messages.find(m => m.id === approval().id)?.approval).toMatchObject({ status: "timeout", interrupted: true });
      expect(page.messages.find(m => m.id === tool().id)?.toolCall?.interrupted).toBe(true);
    } else {
      await session.reconcileBootConversation();
    }
    const restored = session.getMessages();
    expect(restored.find(m => m.id === approval().id)?.approval).toMatchObject({ status: "timeout", interrupted: true });
    expect(restored.find(m => m.id === tool().id)).toMatchObject({ streaming: false, agentMetadata: { awaitingLocalTool: false }, toolCall: { interrupted: true, status: "complete", success: false } });
    expect(restored.find(m => m.id === server.id)?.approval).toEqual(server.approval);
    expect(restored.find(m => m.id === done.id)?.toolCall).toEqual(done.toolCall);
    expect(restored.some(m => m.id === newer.id)).toBe(path !== "boot replacement");
    expect(snapshot).toEqual(before);
    session.destroy();
  });

  it.each(["older", "boot"] as const)("keeps a live gate usable when the %s page overlaps it", async path => {
    const { session, getPage } = setup();
    const decision = session.requestWebMcpApproval(info);
    const live = session.getMessages().find(m => m.approval?.status === "pending")!;
    getPage.mockResolvedValue({ summary, messages: [structuredClone(live)], conversationRevision: "r1", nextCursor: null });
    if (path === "older") await session.loadOlderMessages(summary.id, "older");
    else await session.reconcileBootConversation();
    expect(session.getMessages().find(m => m.id === live.id)?.approval?.status).toBe("pending");
    session.resolveWebMcpApproval(live.id, "approved");
    expect(await decision).toBe(true);
    session.destroy();
  });

  it("keeps a decision made while an older page was loading", async () => {
    const { session, getPage } = setup();
    const decision = session.requestWebMcpApproval(info);
    const live = session.getMessages().find(m => m.approval?.status === "pending")!;
    const snapshot = structuredClone(live);
    let finish!: (page: HistoryPageResult) => void;
    getPage.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const page = session.loadOlderMessages(summary.id, "older");
    session.resolveWebMcpApproval(live.id, "approved");
    expect(await decision).toBe(true);
    finish({ summary, messages: [snapshot], conversationRevision: "r1", nextCursor: null });
    await page;
    expect(session.getMessages().find(m => m.id === live.id)?.approval?.status).toBe("approved");
    expect(snapshot.approval?.status).toBe("pending");
    session.destroy();
  });

  it("keeps a running browser tool and its completed result when older pages overlap", async () => {
    const { session, getPage } = setup();
    const client = (session as unknown as { client: {
      executeWebMcpToolCall: () => Promise<unknown>;
      resumeFlow: () => Promise<Response>;
    } }).client;
    let finish!: (result: unknown) => void;
    client.executeWebMcpToolCall = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    client.resumeFlow = vi.fn(async () => new Response('data: {"type":"execution_complete","success":true,"kind":"agent"}\n\n'));
    const snapshot = tool();
    const execution = session.resolveWebMcpToolCall(snapshot);
    await vi.waitFor(() => expect(client.executeWebMcpToolCall).toHaveBeenCalledTimes(1));
    getPage.mockResolvedValue({ summary, messages: [snapshot], conversationRevision: "r1", nextCursor: null });
    await session.loadOlderMessages(summary.id, "older");
    expect(session.getMessages().find(m => m.id === snapshot.id)?.toolCall).toMatchObject({ status: "running" });
    expect(session.getMessages().find(m => m.id === snapshot.id)?.toolCall?.interrupted).not.toBe(true);
    finish({ content: [{ type: "text", text: "Purchased" }] });
    await execution;
    const completed = session.getMessages().find(m => m.id === snapshot.id)!.toolCall;
    await session.loadOlderMessages(summary.id, "another-page");
    expect(session.getMessages().find(m => m.id === snapshot.id)?.toolCall).toEqual(completed);
    expect(client.executeWebMcpToolCall).toHaveBeenCalledTimes(1);
    expect(client.resumeFlow).toHaveBeenCalledTimes(1);
    session.destroy();
  });
});

it("a reconnect replay uses a fresh gate, executes once, and never re-executes completed history", async () => {
  const frame = (data: object) => `data: ${JSON.stringify(data)}\n\n`;
  const awaitFrame = frame({ type: "await", executionId: "exec-1", awaitReason: "local_tool_required", toolCallId: "call-1", toolName: "webmcp:purchase", parameters: info.args });
  const stream = (text: string) => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); } });
  const session = makeSession({ apiUrl: "http://test", webmcp: { enabled: true }, reconnectStream: async () => new Response(stream(awaitFrame + awaitFrame)) });
  // Stub only the HTTP and browser boundaries, leaving the real event pipeline.
  const client = (session as unknown as { client: {
    isWebMcpOperational: () => boolean;
    executeWebMcpToolCall: () => Promise<unknown>;
    resumeFlow: () => Promise<Response>;
  } }).client;
  client.isWebMcpOperational = () => true;
  const execute = vi.fn(async () => {
    const allowed = await session.requestWebMcpApproval(info);
    return { content: [{ type: "text", text: allowed ? "Purchased" : "Denied" }], isError: !allowed };
  });
  client.executeWebMcpToolCall = execute;
  const resume = vi.fn(async () => new Response(stream(frame({ type: "execution_complete", success: true, kind: "agent" }))));
  client.resumeFlow = resume;
  session.hydrateMessages([approval(), tool()]);
  expect(execute).not.toHaveBeenCalled();
  session.resumeFromHandle({ executionId: "exec-1", after: "5" });
  await vi.waitFor(() => expect(session.getMessages().some(m => m.approval?.status === "pending")).toBe(true));
  const fresh = session.getMessages().find(m => m.approval?.status === "pending")!;
  expect(fresh.id).not.toBe("approval-webmcp-1");
  expect(resume).not.toHaveBeenCalled();
  session.resolveWebMcpApproval(fresh.id, "approved");
  session.resolveWebMcpApproval(fresh.id, "approved");
  await vi.waitFor(() => expect(resume).toHaveBeenCalledTimes(1));
  expect(execute).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(session.getMessages().some(m => m.toolCall?.result !== undefined)).toBe(true));
  const completedSnapshot = session.getMessages();
  session.hydrateMessages(completedSnapshot);
  await session.connectStream(stream(
    frame({ type: "tool_start", executionId: "exec-1", toolCallId: "call-1", toolName: "webmcp:purchase", parameters: info.args }) +
    frame({ type: "tool_output_delta", executionId: "exec-1", toolCallId: "call-1", delta: "stale output" }) +
    awaitFrame + awaitFrame
  ));
  // Microtask batch / lazy action adoption must have had time to run.
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(execute).toHaveBeenCalledTimes(1);
  expect(resume).toHaveBeenCalledTimes(1);
  session.destroy();
});

it("a restored server approval still continues through the configured transport", async () => {
  const server = approval();
  server.approval = { ...server.approval!, id: "server-gate", toolType: "server", agentId: "agent", executionId: "durable-exec" };
  server.id = "approval-server-gate";
  const onDecision = vi.fn(async () => new ReadableStream<Uint8Array>({ start(c) {
    c.enqueue(new TextEncoder().encode('data: {"type":"text_delta","delta":"Server continued"}\n\ndata: {"type":"execution_complete","success":true,"kind":"agent"}\n\n'));
    c.close();
  } }));
  const session = makeSession({ initialMessages: [server], approval: { onDecision } });
  expect(onDecision).not.toHaveBeenCalled();
  await session.resolveApproval(session.getMessages()[0].approval!, "approved");
  expect(onDecision).toHaveBeenCalledWith({ approvalId: "server-gate", executionId: "durable-exec", agentId: "agent", toolName: info.toolName }, "approved", undefined);
  expect(session.getMessages().some(m => m.content === "Server continued")).toBe(true);
  session.destroy();
});
