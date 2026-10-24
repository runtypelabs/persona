import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentWidgetClient } from "./client";
import type { AgentWidgetConfig, AgentWidgetMessage } from "./types";

/**
 * Operator messages (a human on the agent's side, e.g. a support takeover)
 * are display-only. Every request builder must drop them: the API accepts only
 * user, assistant and system turns, and a server-backed thread already holds
 * the operator turns in its own history.
 */

const sseComplete = () =>
  `event: execution_complete\ndata: ${JSON.stringify({
    type: "execution_complete",
    executionId: "exec_1",
    agentId: "agent_1",
    success: true,
    iterations: 1,
    completedAt: "2026-01-01T00:00:10.000Z",
    seq: 1,
  })}\n\n`;

const captureFetch = () => {
  const bodies: Array<{ url: string; body: Record<string, unknown> }> = [];
  global.fetch = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
    bodies.push({ url, body: JSON.parse(String(options.body)) });
    const encoder = new TextEncoder();
    return {
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseComplete()));
          controller.close();
        },
      }),
    };
  });
  return bodies;
};

const transcript = (): AgentWidgetMessage[] => [
  { id: "u1", role: "user", content: "Where is my order?", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "a1", role: "assistant", content: "Let me check.", createdAt: "2026-01-01T00:00:01.000Z" },
  {
    id: "op1",
    role: "operator",
    content: "Hi, this is Sam from support. I've refunded it.",
    llmContent: "operator llm content",
    createdAt: "2026-01-01T00:00:02.000Z",
  },
  { id: "u2", role: "user", content: "Thanks!", createdAt: "2026-01-01T00:00:03.000Z" },
];

const expectNoOperator = (messages: unknown) => {
  expect(Array.isArray(messages)).toBe(true);
  const list = messages as Array<Record<string, unknown>>;
  expect(list.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
  expect(JSON.stringify(list)).not.toContain("support");
  expect(JSON.stringify(list)).not.toContain("operator");
};

describe("operator role: outgoing request payloads", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("drops operator messages from the proxy payload", async () => {
    const bodies = captureFetch();
    const client = new AgentWidgetClient({ apiUrl: "https://api.example.com/chat" });

    await client.dispatch({ messages: transcript() }, () => {});

    expectNoOperator(bodies[0].body.messages);
  });

  it("drops operator messages from the agent payload", async () => {
    const bodies = captureFetch();
    const client = new AgentWidgetClient({
      apiUrl: "https://api.example.com/agents",
      agent: { name: "Test", model: "openai:gpt-4o-mini", systemPrompt: "test" },
    } as AgentWidgetConfig);

    await client.dispatch({ messages: transcript() }, () => {});

    expectNoOperator(bodies[0].body.messages);
  });

  it("drops operator messages from the client-token chat request", async () => {
    const bodies = captureFetch();
    const client = new AgentWidgetClient({
      apiUrl: "https://api.runtype.com",
      clientToken: "ct_live_demo",
      agentId: "agent_1",
    });
    (client as unknown as {
      clientSession: { sessionId: string; expiresAt: Date };
    }).clientSession = {
      sessionId: "sess_operator",
      expiresAt: new Date(Date.now() + 10 * 60_000),
    };

    await client.dispatch({ messages: transcript() }, () => {});

    const chat = bodies.find((request) => request.url.endsWith("/v1/client/chat"));
    expect(chat).toBeDefined();
    expectNoOperator(chat!.body.messages);
  });
});
