import { describe, it, expect, beforeEach, vi } from "vitest";

import { AgentWidgetClient } from "./client";
import type { AgentWidgetMessage, AgentWidgetRequestPayload } from "./types";

const messages: AgentWidgetMessage[] = [
  {
    id: "usr_1",
    role: "user",
    content: "hello",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

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
  };
};

/** Capture whatever body the client POSTs. */
const captureFetch = () => {
  const bodies: Record<string, unknown>[] = [];
  global.fetch = vi.fn(async (_url: unknown, init: any) => {
    bodies.push(JSON.parse(init.body));
    return streamResponse();
  }) as unknown as typeof fetch;
  return bodies;
};

describe("composerOptions on the wire", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("is absent when nothing is selected", async () => {
    const bodies = captureFetch();
    const client = new AgentWidgetClient({ apiUrl: "https://api.example.com/chat" });
    await client.dispatch({ messages }, () => {});
    expect(bodies[0]).not.toHaveProperty("composerOptions");
  });

  it("is absent when the snapshot carries only empty selections", async () => {
    const bodies = captureFetch();
    const client = new AgentWidgetClient({ apiUrl: "https://api.example.com/chat" });
    await client.dispatch(
      { messages, composerOptions: { selectedModelId: undefined, activeModeIds: [] } },
      () => {}
    );
    expect(bodies[0]).not.toHaveProperty("composerOptions");
  });

  it("rides the proxy payload as its own top-level field, never in context", async () => {
    const bodies = captureFetch();
    const client = new AgentWidgetClient({ apiUrl: "https://api.example.com/chat" });
    await client.dispatch(
      {
        messages,
        composerOptions: { selectedModelId: "fast", activeModeIds: ["research"] },
      },
      () => {}
    );
    expect(bodies[0].composerOptions).toEqual({
      selectedModelId: "fast",
      activeModeIds: ["research"],
    });
    expect(bodies[0]).not.toHaveProperty("context");
  });

  it("is visible to requestMiddleware before the request goes out", async () => {
    captureFetch();
    const seen: AgentWidgetRequestPayload[] = [];
    const client = new AgentWidgetClient({
      apiUrl: "https://api.example.com/chat",
      requestMiddleware: ({ payload }) => {
        seen.push(payload);
        return payload;
      },
    });
    await client.dispatch(
      { messages, composerOptions: { selectedModelId: "fast" } },
      () => {}
    );
    expect(seen[0].composerOptions).toEqual({ selectedModelId: "fast" });
  });

  it("is visible to a custom fetch as the third argument", async () => {
    const seen: AgentWidgetRequestPayload[] = [];
    const client = new AgentWidgetClient({
      apiUrl: "https://api.example.com/chat",
      customFetch: async (_url, _init, payload) => {
        seen.push(payload);
        return streamResponse() as unknown as Response;
      },
    });
    await client.dispatch(
      { messages, composerOptions: { activeModeIds: ["concise"] } },
      () => {}
    );
    expect(seen[0].composerOptions).toEqual({ activeModeIds: ["concise"] });
  });

  it("maps an allowed model onto an inline client agent for that turn only", async () => {
    const bodies = captureFetch();
    const agent = {
      name: "Inline",
      model: "default-model",
      systemPrompt: "hi",
    };
    const config = {
      apiUrl: "https://api.example.com/agents",
      agent,
      composer: {
        models: [
          { id: "fast", label: "Fast" },
          { id: "smart", label: "Smart" },
        ],
      },
    };
    const client = new AgentWidgetClient(config as never);

    await client.dispatch(
      { messages, composerOptions: { selectedModelId: "smart" } },
      () => {}
    );
    expect((bodies[0].agent as { model: string }).model).toBe("smart");
    // Per request: the configured agent object is untouched.
    expect(agent.model).toBe("default-model");

    await client.dispatch({ messages }, () => {});
    expect((bodies[1].agent as { model: string }).model).toBe("default-model");
  });

  it("ignores a model the host never declared in composer.models", async () => {
    const bodies = captureFetch();
    const client = new AgentWidgetClient({
      apiUrl: "https://api.example.com/agents",
      agent: { name: "Inline", model: "default-model", systemPrompt: "hi" },
      composer: { models: [{ id: "fast", label: "Fast" }] },
    } as never);
    await client.dispatch(
      { messages, composerOptions: { selectedModelId: "rogue" } },
      () => {}
    );
    expect((bodies[0].agent as { model: string }).model).toBe("default-model");
    // The selection still travels so a custom backend can decide for itself.
    expect(bodies[0].composerOptions).toEqual({ selectedModelId: "rogue" });
  });

  it("never rewrites a saved-agent reference", async () => {
    const bodies = captureFetch();
    const client = new AgentWidgetClient({
      apiUrl: "https://api.example.com/agents",
      agentId: "agent_123",
      composer: { models: [{ id: "fast", label: "Fast" }] },
    } as never);
    await client.dispatch(
      { messages, composerOptions: { selectedModelId: "fast" } },
      () => {}
    );
    expect(bodies[0].agent).toEqual({ agentId: "agent_123" });
  });
});
