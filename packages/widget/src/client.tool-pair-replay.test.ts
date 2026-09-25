import { describe, it, expect, beforeEach, vi } from "vitest";

import { AgentWidgetClient } from "./client";
import { AgentWidgetSession } from "./session";
import type { AgentWidgetMessage, ClientToolDefinition } from "./types";
import { modelFacingToolName } from "./utils/tool-pair-replay";

const SEARCH_TOOL: ClientToolDefinition = {
  name: "search_catalog",
  description: "Search the catalog",
  origin: "webmcp",
};

const RESULT = { content: [{ type: "text", text: "SKU-42 costs $19" }] };

const user = (id: string, content: string, at: number): AgentWidgetMessage => ({
  id,
  role: "user",
  content,
  createdAt: new Date(at).toISOString(),
});

const assistant = (id: string, content: string, at: number): AgentWidgetMessage => ({
  id,
  role: "assistant",
  content,
  createdAt: new Date(at).toISOString(),
  variant: "assistant",
});

const answeredTool = (
  toolCallId: string,
  at: number,
  overrides: Partial<NonNullable<AgentWidgetMessage["agentMetadata"]>> = {},
): AgentWidgetMessage => ({
  id: `tool-${toolCallId}`,
  role: "assistant",
  content: "",
  createdAt: new Date(at).toISOString(),
  variant: "tool",
  toolCall: {
    id: toolCallId,
    name: "webmcp:search_catalog",
    status: "complete",
    args: { q: "sku 42" },
    result: RESULT,
  },
  agentMetadata: {
    executionId: "exec-1",
    awaitingLocalTool: false,
    webMcpToolCallId: toolCallId,
    clientToolAnswer: {
      toolCallId,
      toolName: "webmcp:search_catalog",
      args: { q: "sku 42" },
      result: RESULT,
    },
    ...overrides,
  },
});

/** Turn 1 (with its answered tool) followed by turn 2's user message. */
const twoTurnTranscript = (): AgentWidgetMessage[] => [
  user("u1", "What does SKU 42 cost?", 1_000),
  answeredTool("toolu_01", 2_000),
  assistant("a1", "SKU 42 costs $19.", 3_000),
  user("u2", "And what was the SKU again?", 4_000),
];

function sse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
      c.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}

let bodies: Array<Record<string, unknown>>;
beforeEach(() => {
  bodies = [];
  global.fetch = vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
    bodies.push(JSON.parse(init.body));
    return sse();
  });
});

const withTools = (client: AgentWidgetClient, tools: ClientToolDefinition[]) => {
  (client as unknown as { webMcpBridge: { snapshotForDispatch: () => unknown[] } }).webMcpBridge = {
    snapshotForDispatch: () => tools,
  };
  return client;
};

const EXPECTED_TURN_2 = [
  { role: "user", content: "What does SKU 42 cost?" },
  {
    role: "assistant",
    content: "",
    toolCalls: [{ toolCallId: "toolu_01", toolName: "webmcp_search_catalog", args: { q: "sku 42" } }],
  },
  {
    role: "tool",
    content: "",
    toolResults: [{ toolCallId: "toolu_01", toolName: "webmcp_search_catalog", result: RESULT }],
  },
  { role: "assistant", content: "SKU 42 costs $19." },
  { role: "user", content: "And what was the SKU again?" },
];

const stripCreatedAt = (messages: unknown) =>
  (messages as Array<Record<string, unknown>>).map(({ createdAt: _createdAt, ...rest }) => rest);

describe("tool-pair replay: proxy mode", () => {
  it("sends turn 1's answered call and result, paired and in order, on turn 2", async () => {
    const client = withTools(new AgentWidgetClient({ apiUrl: "http://proxy.test/chat" }), [SEARCH_TOOL]);
    await client.dispatch({ messages: twoTurnTranscript() }, () => undefined);
    expect(stripCreatedAt(bodies[0]!.messages)).toEqual(EXPECTED_TURN_2);
  });

  it("omits the pair once the page no longer offers the tool", async () => {
    const client = withTools(new AgentWidgetClient({ apiUrl: "http://proxy.test/chat" }), []);
    await client.dispatch({ messages: twoTurnTranscript() }, () => undefined);
    const roles = (bodies[0]!.messages as Array<{ role: string; toolCalls?: unknown }>).map((m) => m.role);
    expect(roles).toEqual(["user", "assistant", "user"]);
  });
});

describe("tool-pair replay: agent mode", () => {
  it("sends turn 1's answered call and result, paired and in order, on turn 2", async () => {
    const client = withTools(
      new AgentWidgetClient({
        apiUrl: "http://proxy.test/agents",
        agent: { name: "Test", model: "openai:gpt-4o-mini", systemPrompt: "test" },
      }),
      [SEARCH_TOOL],
    );
    await client.dispatch({ messages: twoTurnTranscript() }, () => undefined);
    expect(stripCreatedAt(bodies[0]!.messages)).toEqual(EXPECTED_TURN_2);
  });
});

describe("tool-pair replay: bubbles that must not replay", () => {
  it("a tool bubble with no accepted answer emits nothing", async () => {
    const pending: AgentWidgetMessage = {
      ...answeredTool("toolu_02", 2_000),
      toolCall: { id: "toolu_02", name: "webmcp:search_catalog", status: "running", args: {} },
      agentMetadata: { executionId: "exec-1", awaitingLocalTool: true, webMcpToolCallId: "toolu_02" },
    };
    const client = withTools(new AgentWidgetClient({ apiUrl: "http://proxy.test/chat" }), [SEARCH_TOOL]);
    await client.dispatch(
      { messages: [user("u1", "hi", 1_000), pending, user("u2", "again", 3_000)] },
      () => undefined,
    );
    const messages = bodies[0]!.messages as Array<Record<string, unknown>>;
    expect(messages.map((m) => m.role)).toEqual(["user", "user"]);
    expect(messages.some((m) => "toolCalls" in m || "toolResults" in m)).toBe(false);
  });

  it("a server-side tool's result stays out (only browser-answered calls replay)", async () => {
    const serverTool: AgentWidgetMessage = {
      ...answeredTool("toolu_03", 2_000),
      agentMetadata: { executionId: "exec-1" },
    };
    const client = withTools(new AgentWidgetClient({ apiUrl: "http://proxy.test/chat" }), [SEARCH_TOOL]);
    await client.dispatch(
      { messages: [user("u1", "hi", 1_000), serverTool, user("u2", "again", 3_000)] },
      () => undefined,
    );
    expect((bodies[0]!.messages as unknown[]).length).toBe(2);
  });
});

describe("tool-pair replay: parallel and chained calls", () => {
  type Sent = Array<{
    role: string;
    toolCalls?: Array<{ toolCallId: string }>;
    toolResults?: Array<{ toolCallId: string }>;
  }>;
  const inBatch = (toolCallId: string, at: number, batch: string) => {
    const message = answeredTool(toolCallId, at);
    message.agentMetadata!.clientToolAnswer!.batch = batch;
    return message;
  };

  it("groups answers from one /resume batch into one call message and one result message", async () => {
    const client = withTools(new AgentWidgetClient({ apiUrl: "http://proxy.test/chat" }), [SEARCH_TOOL]);
    await client.dispatch(
      {
        messages: [
          user("u1", "compare", 1_000),
          inBatch("toolu_a", 2_000, "b1"),
          inBatch("toolu_b", 2_001, "b1"),
          assistant("a1", "done", 3_000),
        ],
      },
      () => undefined,
    );
    const messages = bodies[0]!.messages as Sent;
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(messages[1]!.toolCalls!.map((c) => c.toolCallId)).toEqual(["toolu_a", "toolu_b"]);
    expect(messages[2]!.toolResults!.map((r) => r.toolCallId)).toEqual(["toolu_a", "toolu_b"]);
  });

  it("keeps a chained call (a later /resume batch, no text between) as its own pair", async () => {
    const client = withTools(new AgentWidgetClient({ apiUrl: "http://proxy.test/chat" }), [SEARCH_TOOL]);
    await client.dispatch(
      {
        messages: [
          user("u1", "look it up, then look up the related item", 1_000),
          inBatch("toolu_a", 2_000, "b1"),
          inBatch("toolu_b", 2_500, "b2"),
          assistant("a1", "done", 3_000),
        ],
      },
      () => undefined,
    );
    const messages = bodies[0]!.messages as Sent;
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "tool", "assistant", "tool", "assistant"]);
    expect(messages[1]!.toolCalls!.map((c) => c.toolCallId)).toEqual(["toolu_a"]);
    expect(messages[3]!.toolCalls!.map((c) => c.toolCallId)).toEqual(["toolu_b"]);
  });
});

describe("tool-pair replay: requestMiddleware", () => {
  it("drops replayed pairs when the middleware removes the tools", async () => {
    const client = withTools(
      new AgentWidgetClient({
        apiUrl: "http://proxy.test/chat",
        requestMiddleware: ({ payload }) => ({ ...payload, clientTools: undefined }),
      }),
      [SEARCH_TOOL],
    );
    await client.dispatch({ messages: twoTurnTranscript() }, () => undefined);
    const messages = bodies[0]!.messages as Array<Record<string, unknown>>;
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(messages.some((m) => "toolCalls" in m || "toolResults" in m)).toBe(false);
  });

  it("keeps replayed pairs when the middleware leaves the tools in place", async () => {
    const client = withTools(
      new AgentWidgetClient({
        apiUrl: "http://proxy.test/chat",
        requestMiddleware: ({ payload }) => ({ ...payload, metadata: { host: "x" } }),
      }),
      [SEARCH_TOOL],
    );
    await client.dispatch({ messages: twoTurnTranscript() }, () => undefined);
    expect(stripCreatedAt(bodies[0]!.messages)).toEqual(EXPECTED_TURN_2);
  });
});

describe("tool-pair replay: client-token mode is server-owned", () => {
  it("sends no toolCalls, toolResults or tool role on /client/chat", async () => {
    const client = withTools(
      new AgentWidgetClient({ clientToken: "ct_live_demo", apiUrl: "https://api.runtype.com" }),
      [SEARCH_TOOL],
    );
    (client as unknown as { clientSession: { sessionId: string; expiresAt: Date } }).clientSession = {
      sessionId: "cs_1",
      expiresAt: new Date(Date.now() + 600_000),
    };
    await client.dispatch({ messages: twoTurnTranscript(), assistantMessageId: "a2" }, () => undefined);
    const messages = bodies[0]!.messages as Array<Record<string, unknown>>;
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(messages.some((m) => "toolCalls" in m || "toolResults" in m)).toBe(false);
  });
});

describe("modelFacingToolName", () => {
  it("matches core's AI-SDK sanitizer", () => {
    expect(modelFacingToolName("webmcp:get_schema")).toBe("webmcp_get_schema");
    expect(modelFacingToolName("webmcp:Get-Slide")).toBe("webmcp_get_slide");
    expect(modelFacingToolName("suggest_replies")).toBe("suggest_replies");
  });
});

describe("session records the accepted client-tool answer", () => {
  const makeSession = (resumeStatus = 200) => {
    const session = new AgentWidgetSession(
      { apiUrl: "http://test", webmcp: { enabled: true } },
      {
        onMessagesChanged: () => undefined,
        onStatusChanged: () => undefined,
        onStreamingChanged: () => undefined,
      },
    );
    const client = (session as unknown as { client: Record<string, unknown> }).client;
    client.executeWebMcpToolCall = vi.fn(async () => RESULT);
    client.isWebMcpOperational = vi.fn(() => true);
    client.resumeFlow = vi.fn(async () => new Response(new Blob([""]), { status: resumeStatus }));
    (session as unknown as { connectStream: () => Promise<void> }).connectStream = vi.fn(async () => undefined);
    return session;
  };

  const awaiting = (): AgentWidgetMessage => ({
    id: "tool-toolu_01",
    role: "assistant",
    content: "",
    createdAt: new Date().toISOString(),
    variant: "tool",
    agentMetadata: { executionId: "exec-1", awaitingLocalTool: true, webMcpToolCallId: "toolu_01" },
    toolCall: { id: "toolu_01", name: "webmcp:search_catalog", status: "running", args: { q: "sku 42" } },
  });

  const stored = (session: AgentWidgetSession) =>
    (session as unknown as { messages: AgentWidgetMessage[] }).messages.find((m) => m.id === "tool-toolu_01");

  it("stores the answer after /resume succeeds and keeps it across a tool_complete re-emit", async () => {
    const session = makeSession();
    await session.resolveWebMcpToolCall(awaiting());
    expect(stored(session)?.agentMetadata?.clientToolAnswer).toEqual({
      toolCallId: "toolu_01",
      toolName: "webmcp:search_catalog",
      args: { q: "sku 42" },
      result: RESULT,
      batch: expect.any(String),
    });

    (session as unknown as { upsertMessage: (m: AgentWidgetMessage) => void }).upsertMessage({
      id: "tool-toolu_01",
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      variant: "tool",
      agentMetadata: { executionId: "exec-1" },
      toolCall: { id: "toolu_01", name: "webmcp:search_catalog", status: "complete", result: "server copy" },
    });
    expect(stored(session)?.agentMetadata?.clientToolAnswer?.result).toEqual(RESULT);
  });

  it("stores nothing when /resume fails", async () => {
    const session = makeSession(500);
    await session.resolveWebMcpToolCall(awaiting());
    expect(stored(session)?.agentMetadata?.clientToolAnswer).toBeUndefined();
  });
});
