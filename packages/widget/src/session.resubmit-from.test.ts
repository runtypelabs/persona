import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentWidgetSession } from "./session";
import type { AgentWidgetConfig, AgentWidgetMessage } from "./types";

const streamResponse = () => {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers(),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"type":"flow_complete","success":true}\n\n')
        );
        controller.close();
      },
    }),
  } as unknown as Response;
};

const makeSession = (config: AgentWidgetConfig = {}) => {
  const emits: AgentWidgetMessage[][] = [];
  const session = new AgentWidgetSession(
    { apiUrl: "https://api.example.com/chat", ...config },
    {
      onMessagesChanged: (msgs) => emits.push(msgs),
      onStatusChanged: () => {},
      onStreamingChanged: () => {},
    }
  );
  return { session, emits };
};

/** Seed a full turn: user + reasoning/tool/approval/system tail + assistant. */
const seedTurn = (session: AgentWidgetSession): void => {
  session.hydrateMessages([
    {
      id: "u1",
      role: "user",
      content: "first question",
      createdAt: "2026-01-01T00:00:00.000Z",
      sequence: 1,
    },
    {
      id: "r1",
      role: "assistant",
      variant: "reasoning",
      content: "thinking",
      createdAt: "2026-01-01T00:00:01.000Z",
      sequence: 2,
    },
    {
      id: "t1",
      role: "assistant",
      variant: "tool",
      content: "tool",
      createdAt: "2026-01-01T00:00:02.000Z",
      sequence: 3,
    },
    {
      id: "ap1",
      role: "assistant",
      variant: "approval",
      content: "approval",
      createdAt: "2026-01-01T00:00:03.000Z",
      sequence: 4,
    },
    {
      id: "s1",
      role: "system",
      content: "note",
      createdAt: "2026-01-01T00:00:04.000Z",
      sequence: 5,
    },
    {
      id: "a1",
      role: "assistant",
      content: "first answer",
      createdAt: "2026-01-01T00:00:05.000Z",
      sequence: 6,
    },
  ]);
};

describe("session.resubmitFrom", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn(async () => streamResponse()) as unknown as typeof fetch;
  });

  it("drops the whole turn including reasoning, tool, approval, and system variants", async () => {
    const { session } = makeSession();
    seedTurn(session);
    expect(session.resubmitFrom("u1", { reason: "retry" })).toBe(true);
    const ids = session.getMessages().map((m) => m.id);
    expect(ids).not.toContain("r1");
    expect(ids).not.toContain("t1");
    expect(ids).not.toContain("ap1");
    expect(ids).not.toContain("s1");
    expect(ids).not.toContain("a1");
  });

  it("gives the new attempt a fresh message id", () => {
    const { session } = makeSession();
    seedTurn(session);
    session.resubmitFrom("u1", { reason: "retry" });
    const users = session.getMessages().filter((m) => m.role === "user");
    expect(users).toHaveLength(1);
    expect(users[0].id).not.toBe("u1");
    expect(users[0].content).toBe("first question");
  });

  it("cancels an active stream before changing history", async () => {
    const { session } = makeSession();
    const cancel = vi.spyOn(session, "cancel");
    seedTurn(session);
    session.resubmitFrom("u1", { reason: "retry" });
    expect(cancel).toHaveBeenCalled();
  });

  it("never emits a transcript with the turn removed and nothing in its place", () => {
    const { session, emits } = makeSession();
    seedTurn(session);
    emits.length = 0;
    session.resubmitFrom("u1", { reason: "retry" });
    expect(emits.length).toBeGreaterThan(0);
    for (const emit of emits) {
      expect(emit.filter((m) => m.role === "user")).toHaveLength(1);
    }
  });

  it("replays the STORED user message, not a caller-held copy", () => {
    const { session } = makeSession();
    const orphan: AgentWidgetMessage = {
      id: "u1",
      role: "user",
      content: "stored text",
      createdAt: "2026-01-01T00:00:00.000Z",
      sequence: 1,
      llmContent: "stored llm text",
    };
    session.hydrateMessages([orphan]);
    // Mutating the caller's object after hydration must not reach the replay:
    // hydration/append keep a copy.
    orphan.content = "orphan text";
    orphan.llmContent = "orphan llm text";
    session.resubmitFrom("u1", { reason: "retry" });
    const replayed = session.getMessages().find((m) => m.role === "user")!;
    expect(replayed.content).toBe("stored text");
    expect(replayed.llmContent).toBe("stored llm text");
  });

  it("preserves rich retry fields verbatim", () => {
    const { session } = makeSession();
    session.hydrateMessages([
      {
        id: "u1",
        role: "user",
        content: "look at this",
        createdAt: "2026-01-01T00:00:00.000Z",
        sequence: 1,
        contentParts: [
          { type: "image", image: "data:image/png;base64,x", mimeType: "image/png" },
          { type: "text", text: "look at this" },
        ],
        llmContent: "resolved llm content",
        rawContent: '{"a":1}',
        contextMentions: [{ sourceId: "files", itemId: "a", label: "a.ts" }],
        mentionContext: { mentions: { files: { a: 1 } } },
        contentSegments: [{ kind: "text", text: "look at this" }],
        quote: { text: "quoted", sourceLabel: "Docs" },
        composerOptions: { selectedModelId: "fast", activeModeIds: ["search"] },
        viaVoice: true,
      },
    ]);
    session.resubmitFrom("u1", { reason: "retry" });
    const replayed = session.getMessages().find((m) => m.role === "user")!;
    expect(replayed.contentParts).toHaveLength(2);
    expect(replayed.llmContent).toBe("resolved llm content");
    expect(replayed.rawContent).toBe('{"a":1}');
    expect(replayed.contextMentions).toEqual([
      { sourceId: "files", itemId: "a", label: "a.ts" },
    ]);
    expect(replayed.mentionContext).toEqual({ mentions: { files: { a: 1 } } });
    expect(replayed.contentSegments).toEqual([{ kind: "text", text: "look at this" }]);
    expect(replayed.quote).toEqual({ text: "quoted", sourceLabel: "Docs" });
    expect(replayed.composerOptions).toEqual({
      selectedModelId: "fast",
      activeModeIds: ["search"],
    });
    expect(replayed.viaVoice).toBe(true);
  });

  it("sends the replacement snapshot for an edit", () => {
    const { session } = makeSession();
    seedTurn(session);
    expect(
      session.resubmitFrom("u1", {
        reason: "edit",
        replacement: {
          text: "edited question",
          mentionRefs: [],
          options: { selectedModelId: "smart" },
        },
      })
    ).toBe(true);
    const replayed = session.getMessages().find((m) => m.role === "user")!;
    expect(replayed.content).toBe("edited question");
    expect(replayed.composerOptions).toEqual({ selectedModelId: "smart" });
  });

  it("refuses an unknown id, a non-user message, and an empty rebuild", () => {
    const { session } = makeSession();
    seedTurn(session);
    expect(session.resubmitFrom("nope", { reason: "retry" })).toBe(false);
    expect(session.resubmitFrom("a1", { reason: "retry" })).toBe(false);
    expect(
      session.resubmitFrom("u1", {
        reason: "edit",
        replacement: { text: "   ", mentionRefs: [], options: {} },
      })
    ).toBe(false);
    // Nothing was truncated by a refused call.
    expect(session.getMessages()).toHaveLength(6);
  });
});

describe("resubmitFrom retry payload fidelity per transport", () => {
  const seedRich = (session: AgentWidgetSession) => {
    session.hydrateMessages([
      {
        id: "u1",
        role: "user",
        content: "display text",
        createdAt: "2026-01-01T00:00:00.000Z",
        sequence: 1,
        llmContent: "model-visible text",
        composerOptions: { selectedModelId: "fast" },
      },
      {
        id: "a1",
        role: "assistant",
        content: "answer",
        createdAt: "2026-01-01T00:00:01.000Z",
        sequence: 2,
      },
    ]);
  };

  beforeEach(() => vi.restoreAllMocks());

  it("proxy flow: sends llmContent and the replayed composerOptions", async () => {
    const bodies: Record<string, unknown>[] = [];
    global.fetch = vi.fn(async (_url: unknown, init: any) => {
      bodies.push(JSON.parse(init.body));
      return streamResponse();
    }) as unknown as typeof fetch;
    const { session } = makeSession({ apiUrl: "https://api.example.com/chat" });
    seedRich(session);
    session.resubmitFrom("u1", { reason: "retry" });
    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    const sent = bodies[0].messages as Array<{ content: unknown }>;
    expect(sent.at(-1)?.content).toBe("model-visible text");
    expect(bodies[0].composerOptions).toEqual({ selectedModelId: "fast" });
  });

  it("custom fetch: sees the same replayed payload", async () => {
    const seen: Record<string, unknown>[] = [];
    const { session } = makeSession({
      apiUrl: "https://api.example.com/chat",
      customFetch: async (_url, _init, payload) => {
        seen.push(payload as unknown as Record<string, unknown>);
        return streamResponse();
      },
    });
    seedRich(session);
    session.resubmitFrom("u1", { reason: "retry" });
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    const sent = seen[0].messages as Array<{ content: unknown }>;
    expect(sent.at(-1)?.content).toBe("model-visible text");
    expect(seen[0].composerOptions).toEqual({ selectedModelId: "fast" });
  });

  it("inline agent: maps the replayed model onto that turn's agent", async () => {
    const bodies: Record<string, unknown>[] = [];
    global.fetch = vi.fn(async (_url: unknown, init: any) => {
      bodies.push(JSON.parse(init.body));
      return streamResponse();
    }) as unknown as typeof fetch;
    const { session } = makeSession({
      apiUrl: "https://api.example.com/agents",
      agent: { name: "Inline", model: "default-model", systemPrompt: "hi" },
      composer: { models: [{ id: "fast", label: "Fast" }] },
    } as AgentWidgetConfig);
    seedRich(session);
    session.resubmitFrom("u1", { reason: "retry" });
    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    expect((bodies[0].agent as { model: string }).model).toBe("fast");
  });

  it("client token: replays the model channel and carries a turnId", async () => {
    const bodies: Record<string, unknown>[] = [];
    global.fetch = vi.fn(async (url: unknown, init: any) => {
      if (String(url).endsWith("/v1/client/init")) {
        return {
          ok: true,
          json: async () => ({
            sessionId: "cs_1",
            expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
            config: {},
          }),
        } as unknown as Response;
      }
      bodies.push(JSON.parse(init.body));
      return streamResponse();
    }) as unknown as typeof fetch;
    const { session } = makeSession({ clientToken: "ct_test" } as AgentWidgetConfig);
    seedRich(session);
    session.resubmitFrom("u1", { reason: "retry" });
    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    const sent = bodies[0].messages as Array<{ content: unknown }>;
    expect(sent.at(-1)?.content).toBe("model-visible text");
    expect(typeof bodies[0].turnId).toBe("string");
    expect(bodies[0].submitMode).toBeUndefined();
  });
});
