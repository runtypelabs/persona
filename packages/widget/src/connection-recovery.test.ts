import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentWidgetSession } from "./session";
import { createDemoHistoryProvider } from "./internal/demo-history-provider";
import type { AgentWidgetConfig, AgentWidgetRunFinishedEvent, ResumableHandle } from "./types";

const sessions: AgentWidgetSession[] = [];
afterEach(() => { sessions.splice(0).forEach((session) => session.destroy()); vi.restoreAllMocks(); });
const frame = (id: number, type: string, data: Record<string, unknown> = {}) =>
  `id: ${id}\nevent: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
const delta = (id: number, text: string) => frame(id, "text_delta", { id: "text-a", delta: text, executionId: "exec-a" });
const complete = frame(3, "execution_complete", { success: true, kind: "agent" });
function response(frames: string[]) { return new Response(frames.join("")); }
async function interrupted(session: AgentWidgetSession) {
  await vi.waitFor(() => expect(session.getConnectionRecoveryState()).toBe("interrupted"));
}
function setup(patch: Partial<AgentWidgetConfig> = {}) {
  const dispatch = vi.fn(async () => response([delta(1, "Hello")]));
  const reconnect = vi.fn(async () => new Response(null, { status: 503 }));
  const finished: AgentWidgetRunFinishedEvent[] = [];
  const started = vi.fn();
  const handles: (ResumableHandle | null)[] = [];
  const config: AgentWidgetConfig = {
    apiUrl: "/chat", customFetch: dispatch, reconnectStream: reconnect,
    reconnect: { maxAttempts: 1, backoffMs: [1] }, onExecutionState: handle => handles.push(handle), ...patch,
  };
  const session = new AgentWidgetSession(config, {
    onMessagesChanged: () => {}, onStatusChanged: () => {}, onStreamingChanged: () => {},
    onRunStarted: started, onRunFinished: event => finished.push(event),
  });
  sessions.push(session);
  return { session, dispatch, reconnect, finished, started, handles, config };
}

describe("manual same-execution connection recovery", () => {
  it("retains the latest cursor after exhaustion and resumes the same bubble without dispatching another run", async () => {
    const s = setup();
    s.reconnect.mockResolvedValueOnce(response([delta(2, " there")]));
    await s.session.sendMessage("Hi");
    await interrupted(s.session);
    const original = s.session.getMessages().find(message => message.role === "assistant")!;
    expect(original.content).toBe("Hello there");
    expect(s.session.getResumableHandle()).toMatchObject({ executionId: "exec-a", lastEventId: "2", assistantMessageId: original.id });
    expect(s.session.isStreaming()).toBe(false);
    expect(s.handles.at(-1)).not.toBeNull();
    expect(s.finished).toEqual([]);
    expect(s.session.getMessages().some(message => message.dispatchError)).toBe(false);

    s.reconnect.mockResolvedValueOnce(response([complete]));
    s.session.reconnectNow();
    s.session.reconnectNow();
    expect(s.session.getConnectionRecoveryState()).toBe("reconnecting");
    await vi.waitFor(() => expect(s.session.getConnectionRecoveryState()).toBe("none"));
    await vi.waitFor(() => expect(s.finished.map(event => event.outcome)).toEqual(["success"]));
    expect(s.dispatch).toHaveBeenCalledOnce();
    expect(s.started).toHaveBeenCalledOnce();
    expect(s.reconnect).toHaveBeenLastCalledWith(expect.objectContaining({ executionId: "exec-a", after: "2" }));
    expect(s.session.getMessages().find(message => message.id === original.id)?.content).toBe("Hello there");
    expect(s.session.getResumableHandle()).toBeNull();
  });

  it.each([401, 403, 404, 410, 429, 503])("allows a host transport to recover after HTTP %s", async (status) => {
    const s = setup();
    s.reconnect.mockResolvedValueOnce(new Response(null, { status }));
    await s.session.sendMessage("Hi");
    await interrupted(s.session);
    s.reconnect.mockResolvedValueOnce(response([complete]));
    s.session.reconnectNow();
    await vi.waitFor(() => expect(s.session.getResumableHandle()).toBeNull());
    expect(s.reconnect).toHaveBeenCalledTimes(2);
    expect(s.dispatch).toHaveBeenCalledOnce();
  });

  it.each(["cancel", "hydrate", "clear", "new-run", "config", "destroy"])("invalidates recovery on %s", async (action) => {
    const s = setup();
    await s.session.sendMessage("Hi");
    await interrupted(s.session);
    switch (action) {
      case "cancel": s.session.cancel(); break;
      case "hydrate": s.session.hydrateMessages([]); break;
      case "clear": s.session.clearMessages(); break;
      case "new-run":
        s.dispatch.mockResolvedValueOnce(response([complete]));
        await s.session.sendMessage("New question");
        break;
      case "config": s.session.updateConfig({ ...s.config, apiUrl: "/other" }); break;
      case "destroy": s.session.destroy(); break;
    }
    expect(s.session.getConnectionRecoveryState()).toBe("none");
    expect(s.session.getResumableHandle()).toBeNull();
    s.session.reconnectNow();
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(s.reconnect).toHaveBeenCalledOnce();
  });

  it("ignores a reconnect response that arrives after a replacement run starts", async () => {
    let resolve!: (value: Response) => void;
    const s = setup({ reconnectStream: () => new Promise<Response>(done => { resolve = done; }) });
    await s.session.sendMessage("Hi");
    await vi.waitFor(() => expect(resolve).toBeDefined());
    s.dispatch.mockResolvedValueOnce(response([frame(1, "text_delta", { id: "new-text", delta: "Fresh", executionId: "exec-new" }), complete]));
    await s.session.sendMessage("New question");
    resolve(response([delta(2, " stale"), complete]));
    await new Promise(done => setTimeout(done, 10));
    expect(s.session.getMessages().some(message => message.content?.includes("stale"))).toBe(false);
    expect(s.session.getStatus()).toBe("idle");
    expect(s.session.getResumableHandle()).toBeNull();
    expect(s.session.getConnectionRecoveryState()).toBe("none");
  });

  it("clears recovery when replay discovers a terminal execution failure", async () => {
    const s = setup();
    await s.session.sendMessage("Hi");
    await interrupted(s.session);
    s.reconnect.mockResolvedValueOnce(response([frame(2, "execution_error", { kind: "agent", error: "Model unavailable" })]));
    s.session.reconnectNow();
    await vi.waitFor(() => expect(s.finished.map(event => event.outcome)).toEqual(["error"]));
    expect(s.session.getConnectionRecoveryState()).toBe("none");
    expect(s.session.getResumableHandle()).toBeNull();
    expect(s.session.getMessages().find(message => message.dispatchError)?.content).toContain("Model unavailable");
  });

  it("does not replay a pending user await", async () => {
    const s = setup();
    s.session.hydrateMessages([{ id: "approval", role: "assistant", content: "Approve?", createdAt: new Date().toISOString(), variant: "approval",
      approval: { id: "approval", status: "pending", agentId: "agent", executionId: "exec-a", toolName: "lookup", description: "Look up data" } }]);
    s.session.resumeFromHandle({ executionId: "exec-a", after: "1" });
    expect(s.session.getResumableHandle()).toBeTruthy();
    expect(s.session.getConnectionRecoveryState()).toBe("none");
    s.session.reconnectNow();
    expect(s.reconnect).not.toHaveBeenCalled();
  });

  it("recovers through a conversation-scoped adapter without the legacy reconnect hook", async () => {
    const provider = createDemoHistoryProvider({ conversations: [{ id: "a", title: "A", messages: [] }] });
    const reconnect = vi.fn(async () => new Response(null, { status: 503 }));
    const session = new AgentWidgetSession({
      apiUrl: "/chat", customFetch: async () => response([delta(1, '{"text":"Part')]), reconnect: { maxAttempts: 1 },
      streamParser: () => ({
        processChunk: raw => { try { return JSON.parse(raw).text; } catch { return "Part"; } },
        getExtractedText: () => null,
      }),
      backgroundConversations: { capabilities: { durableExecution: true, readOnlyReplay: true }, reconnectStream: reconnect },
    }, { onMessagesChanged: () => {}, onStatusChanged: () => {}, onStreamingChanged: () => {} }, { historyProvider: provider });
    sessions.push(session);
    await session.openConversation("a");
    await session.sendMessage("Hi");
    await interrupted(session);
    reconnect.mockResolvedValueOnce(response([delta(2, 'ial"}'), complete]));
    session.reconnectNow();
    await vi.waitFor(() => expect(session.getConnectionRecoveryState()).toBe("none"));
    expect(reconnect).toHaveBeenLastCalledWith(expect.objectContaining({ conversationId: "a", executionId: "exec-a", after: "1" }));
    expect(session.getMessages().find(message => message.role === "assistant")?.content).toBe("Partial");
  });
});
