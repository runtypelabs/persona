import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentWidgetClient } from "./client";
import type { AgentWidgetConfig, AgentWidgetMessage } from "./types";

/**
 * Operator messages (a human on the agent's side, e.g. a support takeover)
 * are omitted by default: a server-backed thread may already own their replay.
 * Stateless adapters can opt into attributed context using supported model roles.
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

// The adapter owns this conversion; the widget supplies resolved content and
// keeps its original UI role/identity intact.
const mapHumanHistory: NonNullable<AgentWidgetConfig["modelMessageTransform"]> = ({ message, content, modelMessage }) =>
  message.role === "operator"
    ? { role: "user", content: typeof content === "string" ? `Historical human support reply (${message.id}, ${message.author?.displayName ?? "Human operator"}): ${content}` : content, createdAt: message.createdAt }
    : modelMessage;

const configFor = (transport: string): AgentWidgetConfig => ({
  apiUrl: "https://api.example.com/chat",
  ...(transport === "agent" && { agent: { name: "Test", model: "openai:gpt-4o-mini", systemPrompt: "test" } }),
  ...(transport === "client-token" && { clientToken: "ct_live_demo", agentId: "agent_1", features: { history: { enabled: true } } }),
});
const seedClientSession = (client: AgentWidgetClient) => {
  (client as unknown as { clientSession: { sessionId: string; expiresAt: Date; history?: { enabled: boolean } } }).clientSession = {
    sessionId: "sess_operator", expiresAt: new Date(Date.now() + 600_000), history: { enabled: true },
  };
};

describe("explicit model context conversion", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(["proxy", "agent", "client-token"])("replays each human contribution once, chronologically, for %s", async transport => {
    const bodies = captureFetch();
    const transform = vi.fn(mapHumanHistory);
    const client = new AgentWidgetClient({ ...configFor(transport), modelMessageTransform: transform });
    if (transport === "client-token") seedClientSession(client);
    const messages = transcript();
    messages[2].author = { id: "sam", displayName: "Sam", kind: "human" };
    await client.dispatch({ messages: [...messages].reverse() }, () => {});
    const request = bodies.find(entry => transport !== "client-token" || entry.url.endsWith("/v1/client/chat"))!;
    const sent = request.body.messages as Array<{ id?: string; role: string; content: string; displayContent?: string }>;
    expect(sent.map(message => message.role)).toEqual(["user", "assistant", "user", "user"]);
    expect(sent.map(message => message.content)).toEqual([
      "Where is my order?", "Let me check.", "Historical human support reply (op1, Sam): operator llm content", "Thanks!",
    ]);
    expect(transform).toHaveBeenCalledTimes(4);
    expect(transform.mock.calls.map(([context]) => context.message.id)).toEqual(["u1", "a1", "op1", "u2"]);
    expect(messages[2].role).toBe("operator");
    if (transport === "client-token") {
      expect(sent[2].id).toBe("op1");
      expect(sent[2].displayContent).toBe(messages[2].content);
    }
  });

  it.each(["proxy", "agent", "client-token"])("resolves content priority and preserves attachments for %s", async transport => {
    const bodies = captureFetch();
    const transform = vi.fn(mapHumanHistory);
    const client = new AgentWidgetClient({ ...configFor(transport), modelMessageTransform: transform });
    if (transport === "client-token") seedClientSession(client);
    const human = transcript()[2];
    const image = { type: "image" as const, image: "https://example.com/photo.png" };
    const messages: AgentWidgetMessage[] = [
      { ...human, id: "image", content: "", contentParts: [image] },
      { ...human, id: "llm", rawContent: "raw" },
      { ...human, id: "raw", llmContent: undefined, rawContent: "raw" },
      { ...human, id: "visible", llmContent: undefined },
      { ...human, id: "local", localOnly: true },
      { ...human, id: "caption", voiceCaption: true },
    ];
    await client.dispatch({ messages }, () => {});
    expect(transform).toHaveBeenCalledTimes(4);
    expect(transform.mock.calls.map(([context]) => context.content)).toEqual([[image], "operator llm content", "raw", human.content]);
    expect(transform.mock.calls.every(([context]) => context.modelMessage === null)).toBe(true);
    const request = bodies.find(entry => transport !== "client-token" || entry.url.endsWith("/v1/client/chat"))!;
    expect((request.body.messages as Array<{content: unknown}>)[0].content).toEqual([image]);
    expect(JSON.stringify(request.body.messages)).not.toContain('"author"');
  });

  it("preserves an empty human display projection when client-token conversion adds attribution", async () => {
    const bodies = captureFetch();
    const client = new AgentWidgetClient({ ...configFor("client-token"), modelMessageTransform: ({ message, content, modelMessage }) =>
      message.role === "operator" ? { role: "user", content: [{ type: "text", text: "Historical human support reply" }, ...(Array.isArray(content) ? content : [])], createdAt: message.createdAt } : modelMessage,
    });
    seedClientSession(client);
    await client.dispatch({ messages: [{ ...transcript()[2], content: "", llmContent: undefined, contentParts: [{ type: "image", image: "https://example.com/photo.png" }] }] }, () => {});
    const chat = bodies.find(entry => entry.url.endsWith("/v1/client/chat"))!;
    expect((chat.body.messages as Array<{ displayContent?: string }>)[0].displayContent).toBe("");
  });

  it("does not hide attachments when a conversion only clones the model content", async () => {
    const bodies = captureFetch();
    const client = new AgentWidgetClient({
      ...configFor("client-token"),
      modelMessageTransform: ({ modelMessage }) => modelMessage
        ? { ...modelMessage, content: structuredClone(modelMessage.content) }
        : null,
    });
    seedClientSession(client);
    await client.dispatch({ messages: [{ ...transcript()[0], content: "", contentParts: [{ type: "image", image: "https://example.com/photo.png" }] }] }, () => {});
    const chat = bodies.find(entry => entry.url.endsWith("/v1/client/chat"))!;
    expect((chat.body.messages as Array<{ displayContent?: string }>)[0].displayContent).toBeUndefined();
  });

  it.each([
    { role: "operator", content: "unsupported", createdAt: "now" },
    { role: "user", content: { text: "invalid" }, createdAt: "now" },
    { role: "user", content: [{ type: "image", image: 42 }], createdAt: "now" },
    Promise.resolve(null),
    undefined,
  ])("fails explicitly for a malformed JavaScript hook result", async result => {
    const bodies = captureFetch();
    const client = new AgentWidgetClient({
      apiUrl: "https://api.example.com/chat",
      modelMessageTransform: (() => result) as unknown as AgentWidgetConfig["modelMessageTransform"],
    });
    await expect(client.dispatch({ messages: transcript() }, () => {})).rejects.toThrow("modelMessageTransform");
    expect(bodies).toHaveLength(0);
  });
});
