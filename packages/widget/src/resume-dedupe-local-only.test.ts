import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentWidgetClient } from "./client";
import { AgentWidgetSession, type AgentWidgetSessionStatus } from "./session";
import type { AgentWidgetConfig, AgentWidgetMessage, ResumableHandle } from "./types";

// runtypelabs/core#9961: resumed replies must keep the id the server stores
// them under, and widget failure notices must never become history.

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

const enc = new TextEncoder();
const frame = (data: Record<string, unknown>) => `data: ${JSON.stringify(data)}\n\n`;
const sseStream = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      if (text) c.enqueue(enc.encode(text));
      c.close();
    },
  });
const replyFrames = (text: string) =>
  frame({ type: "text_start", id: "t1" }) +
  frame({ type: "text_delta", id: "t1", delta: text }) +
  frame({ type: "text_complete", id: "t1" }) +
  frame({ type: "execution_complete", kind: "agent", success: true });

type ClientInternals = {
  clientSession: { sessionId: string; expiresAt: Date };
  isWebMcpOperational: () => boolean;
  executeWebMcpToolCall: () => Promise<unknown>;
  resumeFlow: (...args: unknown[]) => Promise<Response>;
};
const internals = (session: AgentWidgetSession) =>
  (session as unknown as { client: ClientInternals }).client;

const track = (config: AgentWidgetConfig) => {
  const state = {
    messages: [] as AgentWidgetMessage[],
    status: "idle" as AgentWidgetSessionStatus,
    errors: [] as Error[],
  };
  const session = new AgentWidgetSession(config, {
    onMessagesChanged: (m) => {
      state.messages = m;
    },
    onStatusChanged: (s) => {
      state.status = s;
    },
    onStreamingChanged: () => {},
    onError: (e) => state.errors.push(e),
  });
  return { session, state };
};

const awaitingWebMcpTool = (): AgentWidgetMessage => ({
  id: "tool-call-1",
  role: "assistant",
  content: "",
  createdAt: "2026-01-01T00:00:01.000Z",
  streaming: true,
  variant: "tool",
  agentMetadata: { executionId: "exec-1", awaitingLocalTool: true, webMcpToolCallId: "call-1" },
  toolCall: { id: "call-1", name: "webmcp:purchase", status: "running", args: { quantity: 1 } },
});

describe("resumed reply ids", () => {
  const tokenClient = () => {
    const client = new AgentWidgetClient({ clientToken: "ct_live_demo", apiUrl: "https://api.runtype.com" });
    (client as unknown as ClientInternals).clientSession = {
      sessionId: "cs_123",
      expiresAt: new Date(Date.now() + 60_000),
    };
    return client;
  };
  const captureBodies = () => {
    const bodies: Record<string, unknown>[] = [];
    global.fetch = vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string));
      return new Response(sseStream(""));
    }) as unknown as typeof fetch;
    return bodies;
  };

  it("sends the local bubble id as assistantMessageId on a client-token /resume", async () => {
    const bodies = captureBodies();
    await tokenClient().resumeFlow("exec_1", { call_1: "ok" }, { assistantMessageId: "ast_local" });
    expect(bodies[0]).toMatchObject({ executionId: "exec_1", sessionId: "cs_123", assistantMessageId: "ast_local" });
  });

  it("keeps the proxy /resume body unchanged", async () => {
    const bodies = captureBodies();
    const client = new AgentWidgetClient({ apiUrl: "https://proxy.example.com/chat" });
    await client.resumeFlow("exec_1", { call_1: "ok" }, { assistantMessageId: "ast_local" });
    expect(bodies[0].assistantMessageId).toBeUndefined();
  });

  it("renders a resumed WebMCP leg into the bubble whose id it sent", async () => {
    const { session, state } = track({ apiUrl: "http://test", webmcp: { enabled: true } });
    const client = internals(session);
    client.isWebMcpOperational = () => true;
    client.executeWebMcpToolCall = vi.fn(async () => ({ content: [{ type: "text", text: "Purchased" }] }));
    const resume = vi.fn(async () => new Response(sseStream(replyFrames("Your order is in."))));
    client.resumeFlow = resume;

    await session.resolveWebMcpToolCall(awaitingWebMcpTool());

    expect(resume).toHaveBeenCalledTimes(1);
    const sentId = (resume.mock.calls[0] as unknown[])[2] as { assistantMessageId?: string };
    expect(sentId.assistantMessageId).toMatch(/^ast_/);
    const reply = state.messages.find((m) => m.content === "Your order is in.");
    expect(reply?.id).toBe(sentId.assistantMessageId);
    session.destroy();
  });
});

describe("local-only failure notices", () => {
  it("shows a dispatch failure but never sends it as history", async () => {
    const payloads: Array<{ messages: Array<{ role: string; content: unknown }> }> = [];
    let calls = 0;
    const { session, state } = track({
      apiUrl: "http://test",
      customFetch: async (_url, _init, payload) => {
        payloads.push(payload as (typeof payloads)[number]);
        calls += 1;
        if (calls === 1) throw new Error("upstream unavailable");
        return new Response(sseStream(replyFrames("Back online.")));
      },
    });

    await session.sendMessage("first");
    const notice = state.messages.at(-1)!;
    expect(notice.role).toBe("assistant");
    expect(notice.localOnly).toBe(true);

    await session.sendMessage("second");
    expect(payloads[1].messages.map((m) => m.content)).toEqual(["first", "second"]);
    session.destroy();
  });

  it("drops reconnect-failure bubbles stored before the flag existed", async () => {
    const payloads: Array<{ messages: Array<{ content: unknown }> }> = [];
    const { session } = track({
      apiUrl: "http://test",
      initialMessages: [
        { id: "u1", role: "user", content: "hi", createdAt: "2026-01-01T00:00:00.000Z" },
        {
          id: "reconnect-failed-exec_1",
          role: "assistant",
          content: "Connection lost and the response could not be resumed.",
          createdAt: "2026-01-01T00:00:01.000Z",
        },
      ],
      customFetch: async (_url, _init, payload) => {
        payloads.push(payload as (typeof payloads)[number]);
        return new Response(sseStream(replyFrames("ok")));
      },
    });

    await session.sendMessage("again");
    expect(payloads[0].messages.map((m) => m.content)).toEqual(["hi", "again"]);
    session.destroy();
  });

  it("marks the reconnect give-up bubble local-only", async () => {
    const { session, state } = track({
      apiUrl: "http://test",
      reconnectStream: async () => {
        throw new Error("network down");
      },
      reconnect: { backoffMs: [1], maxAttempts: 1 },
    });
    session.hydrateMessages([
      { id: "u1", role: "user", content: "tell me", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "a1", role: "assistant", content: "Once", createdAt: "2026-01-01T00:00:01.000Z" },
    ]);

    session.resumeFromHandle({ executionId: "exec_5", after: "5" });
    await vi.waitFor(() => expect(state.errors).toHaveLength(1));

    const notice = state.messages.find((m) => m.id === "reconnect-failed-exec_5");
    expect(notice?.localOnly).toBe(true);
    session.destroy();
  });
});

describe("boot resume of a run parked on an await", () => {
  it("ends quietly when the reload interrupted the WebMCP call and nothing replays", async () => {
    const executionStates: Array<ResumableHandle | null> = [];
    const reconnectStream = vi.fn(async () => new Response(sseStream("")));
    const { session, state } = track({
      apiUrl: "http://test",
      webmcp: { enabled: true },
      reconnectStream,
      reconnect: { backoffMs: [1, 1, 1, 1, 1], maxAttempts: 5 },
      onExecutionState: (h) => executionStates.push(h),
    });
    session.hydrateMessages([
      { id: "u1", role: "user", content: "buy one", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "a1", role: "assistant", content: "Buying it now.", createdAt: "2026-01-01T00:00:00.500Z" },
      awaitingWebMcpTool(),
    ]);

    session.resumeFromHandle({ executionId: "exec-1", after: "7" });
    await vi.waitFor(() => expect(state.status).toBe("idle"));
    await new Promise((r) => setTimeout(r, 20));

    expect(reconnectStream).toHaveBeenCalledTimes(1);
    expect(state.errors).toEqual([]);
    expect(state.messages.some((m) => m.id.startsWith("reconnect-failed-"))).toBe(false);
    expect(state.messages.every((m) => !m.streaming)).toBe(true);
    expect(state.messages.map((m) => m.id)).toEqual(["u1", "a1", "tool-call-1"]);
    expect(session.getResumableHandle()).toBeNull();
    expect(executionStates.at(-1)).toBeNull();
    session.destroy();
  });

  it("keeps the cursor for a pending ask_user_question card instead of reconnecting", async () => {
    const reconnectStream = vi.fn(async () => new Response(sseStream("")));
    const { session, state } = track({ apiUrl: "http://test", reconnectStream });
    session.hydrateMessages([
      { id: "u1", role: "user", content: "plan a trip", createdAt: "2026-01-01T00:00:00.000Z" },
      {
        id: "tool-ask-1",
        role: "assistant",
        content: "",
        createdAt: "2026-01-01T00:00:01.000Z",
        variant: "tool",
        agentMetadata: { executionId: "exec-2", awaitingLocalTool: true },
        toolCall: { id: "ask-1", name: "ask_user_question", status: "running" },
      },
    ]);

    session.resumeFromHandle({ executionId: "exec-2", after: "4" });
    await new Promise((r) => setTimeout(r, 20));

    expect(reconnectStream).not.toHaveBeenCalled();
    expect(state.status).toBe("idle");
    expect(session.getResumableHandle()).toMatchObject({ executionId: "exec-2", lastEventId: "4" });
    session.destroy();
  });
});
