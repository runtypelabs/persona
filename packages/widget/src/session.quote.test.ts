import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentWidgetSession } from "./session";
import type { AgentWidgetMessage } from "./types";

const streamResponse = () => {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
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

const makeSession = () => {
  let messages: AgentWidgetMessage[] = [];
  const session = new AgentWidgetSession(
    { apiUrl: "https://api.example.com/chat" },
    {
      onMessagesChanged: (msgs) => {
        messages = msgs;
      },
      onStatusChanged: () => {},
      onStreamingChanged: () => {},
    }
  );
  return { session, current: () => messages };
};

describe("quote on the model channel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn(async () => streamResponse()) as unknown as typeof fetch;
  });

  it("prepends a delimited block to llmContent for a plain string message", async () => {
    const { session, current } = makeSession();
    await session.sendMessage("what about this", {
      quote: { text: "quoted material", sourceLabel: "Docs" },
    });
    const sent = current().find((m) => m.role === "user")!;
    expect(sent.content).toBe("what about this");
    expect(sent.llmContent).toBe(
      "```quoted-text source=Docs\nquoted material\n```\n\nwhat about this"
    );
    expect(sent.quote).toEqual({ text: "quoted material", sourceLabel: "Docs" });
  });

  it("prepends a text part for a contentParts message", async () => {
    const { session, current } = makeSession();
    await session.sendMessage("look", {
      contentParts: [
        { type: "image", image: "data:image/png;base64,x", mimeType: "image/png" },
        { type: "text", text: "look" },
      ],
      quote: { text: "quoted material" },
    });
    const sent = current().find((m) => m.role === "user")!;
    expect(sent.llmContent).toBeUndefined();
    expect(sent.contentParts?.[0]).toEqual({
      type: "text",
      text: "```quoted-text\nquoted material\n```",
    });
    expect(sent.contentParts).toHaveLength(3);
    expect(sent.quote).toEqual({ text: "quoted material" });
  });

  it("leaves a non-quoted send unchanged", async () => {
    const { session, current } = makeSession();
    await session.sendMessage("plain", {});
    const sent = current().find((m) => m.role === "user")!;
    expect(sent.llmContent).toBeUndefined();
    expect(sent.contentParts).toBeUndefined();
    expect(sent.quote).toBeUndefined();
  });

  it("mutates the STORED message, so the quote reaches the dispatch snapshot", async () => {
    const bodies: Record<string, unknown>[] = [];
    global.fetch = vi.fn(async (_url: unknown, init: any) => {
      bodies.push(JSON.parse(init.body));
      return streamResponse();
    }) as unknown as typeof fetch;
    const { session } = makeSession();
    await session.sendMessage("hi", { quote: { text: "q" } });
    const sent = bodies[0].messages as Array<{ content: unknown }>;
    expect(sent.at(-1)?.content).toBe("```quoted-text\nq\n```\n\nhi");
  });
});
