import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { AgentWidgetMessage } from "../types";
import {
  isHistoryDisplayUnavailable,
  mapWireMessages,
  mergeWireMessagesById,
  type HistoryWireConversationSummary,
  type HistoryWireMessage,
} from "./history-messages";

type HistoryWireFixture = {
  list: HistoryWireConversationSummary[];
  detail: {
    id: string;
    messages: HistoryWireMessage[];
    nextMessageCursor: string | null;
  };
};

const fixture = JSON.parse(
  readFileSync(
    new URL("./__fixtures__/client-conversation-history-wire.json", import.meta.url),
    "utf8"
  )
) as HistoryWireFixture;

function byId(messages: AgentWidgetMessage[]) {
  return new Map(messages.map((message) => [message.id, message]));
}

describe("mapWireMessages: fixture parity", () => {
  const mapped = mapWireMessages(fixture.detail.messages);
  const messages = byId(mapped);

  it("keeps every renderable wire message in server order", () => {
    expect(mapped.map((message) => message.id)).toEqual([
      "msg_string",
      "msg_divergent",
      "msg_empty_projection",
      "msg_hidden_llm_content",
      "msg_raw_directive",
      "msg_image",
      "msg_file",
      "msg_absent_content",
      "msg_terminal_finalized",
    ]);
  });

  it("renders an ordinary string message as-is", () => {
    const message = messages.get("msg_string")!;
    expect(message.role).toBe("user");
    expect(message.content).toBe("Where is my order?");
    expect(message.createdAt).toBe("2026-02-01T00:00:00.000Z");
    expect(message.contentParts).toBeUndefined();
    expect(message.llmContent).toBeUndefined();
  });

  it("renders the display projection and leaks no model content", () => {
    const message = messages.get("msg_divergent")!;
    expect(message.content).toBe("Order A-1 is on its way.");
    const serialized = JSON.stringify(message);
    expect(serialized).not.toContain("directive");
    expect(serialized).not.toContain("order_card");
    expect(message.llmContent).toBeUndefined();
    expect(message.rawContent).toBeUndefined();
  });

  it("treats a deliberately empty projection as empty, not as a fallback", () => {
    const message = messages.get("msg_empty_projection")!;
    expect(message.content).toBe("");
    expect(JSON.stringify(message)).not.toContain("open_modal");
    expect(isHistoryDisplayUnavailable(message)).toBe(false);
  });

  it("marks withheld messages unavailable without any model-only fragment", () => {
    for (const id of ["msg_hidden_llm_content", "msg_raw_directive", "msg_absent_content"]) {
      const message = messages.get(id)!;
      expect(message.content).toBe("");
      expect(isHistoryDisplayUnavailable(message)).toBe(true);
      expect(message.contentParts).toBeUndefined();
      expect(message.llmContent).toBeUndefined();
      expect(message.rawContent).toBeUndefined();
      // Nothing beyond identity, an empty body, and the marker survives.
      expect(Object.keys(message).sort()).toEqual([
        "agentMetadata",
        "content",
        "createdAt",
        "id",
        "role",
      ]);
      expect(JSON.stringify(message)).not.toContain("order_card");
    }
  });

  it("maps image parts through the multi-modal helpers", () => {
    const message = messages.get("msg_image")!;
    expect(message.contentParts).toEqual([
      { type: "text", text: "Looks like this:" },
      { type: "image", image: "data:image/png;base64,AAAA" },
    ]);
    expect(message.content).toBe("Looks like this:");
  });

  it("maps file parts and falls back to empty visible text", () => {
    const message = messages.get("msg_file")!;
    expect(message.contentParts).toEqual([
      {
        type: "file",
        data: "ZmFrZQ==",
        mimeType: "application/pdf",
        filename: "receipt.pdf",
      },
    ]);
    expect(message.content).toBe("");
  });

  it("shows the finalized projection on the terminal assistant turn", () => {
    const message = messages.get("msg_terminal_finalized")!;
    expect(message.role).toBe("assistant");
    expect(message.content).toBe("It is in transit and arrives Thursday.");
    const serialized = JSON.stringify(message);
    expect(serialized).not.toContain("in_transit");
    expect(serialized).not.toContain("track");
  });

  it("never fabricates a model channel for any mapped message", () => {
    for (const message of mapped) {
      expect(message.llmContent).toBeUndefined();
      expect(message.rawContent).toBeUndefined();
    }
  });

  it("exposes the list summary shape the UI paginates", () => {
    const [summary] = fixture.list;
    expect(summary.preview).toBe("It is in transit and arrives Thursday.");
    expect(summary.messageCount).toBe(9);
  });
});

describe("mapWireMessages: image-only fallback", () => {
  it("uses the shared image fallback text when there is no visible text", () => {
    const [message] = mapWireMessages([
      {
        id: "m1",
        role: "user",
        content: [{ type: "image", image: "https://example.com/a.png" }],
        displayAvailable: true,
        timestamp: "2026-02-01T00:00:00.000Z",
      },
    ]);
    expect(message.content).toBe("[Image]");
  });

  it("drops unrecognized parts instead of surfacing them", () => {
    const [message] = mapWireMessages([
      {
        id: "m1",
        role: "assistant",
        content: [
          { type: "tool_use", name: "track", input: { orderId: "A-1" } },
          { type: "text", text: "Done." },
        ],
        displayAvailable: true,
        timestamp: "2026-02-01T00:00:00.000Z",
      },
    ]);
    expect(message.contentParts).toEqual([{ type: "text", text: "Done." }]);
    expect(JSON.stringify(message)).not.toContain("tool_use");
  });
});

describe("mapWireMessages: role filtering", () => {
  it("drops roles the widget does not render", () => {
    const mapped = mapWireMessages([
      { id: "a", role: "user", content: "hi", displayAvailable: true },
      { id: "b", role: "tool", content: "{}", displayAvailable: true },
      { id: "c", role: "developer", content: "x", displayAvailable: true },
      { id: "d", role: "system", content: "note", displayAvailable: true },
      { id: "e", role: "assistant", content: "yo", displayAvailable: true },
    ]);
    expect(mapped.map((message) => message.id)).toEqual(["a", "d", "e"]);
  });
});

describe("mapWireMessages: timestamp synthesis", () => {
  const olderPage: HistoryWireMessage[] = [
    { id: "p1", role: "user", content: "one", displayAvailable: true },
    { id: "p2", role: "assistant", content: "two", displayAvailable: true },
    { id: "p3", role: "user", content: "three", displayAvailable: true },
  ];
  const bound = "2026-02-01T00:00:00.000Z";

  it("keeps server order strictly earlier than the prepend bound", () => {
    const mapped = mapWireMessages(olderPage, { beforeCreatedAt: bound });
    const times = mapped.map((message) => Date.parse(message.createdAt));
    expect(mapped.map((message) => message.id)).toEqual(["p1", "p2", "p3"]);
    expect(times[0]).toBeLessThan(times[1]);
    expect(times[1]).toBeLessThan(times[2]);
    for (const time of times) {
      expect(time).toBeLessThan(Date.parse(bound));
    }
  });

  it("is deterministic across runs", () => {
    const first = mapWireMessages(olderPage, { beforeCreatedAt: bound });
    const second = mapWireMessages(olderPage, { beforeCreatedAt: bound });
    expect(first.map((message) => message.createdAt)).toEqual(
      second.map((message) => message.createdAt)
    );
  });

  it("interleaves synthesized values with neighboring real timestamps", () => {
    const mapped = mapWireMessages([
      {
        id: "a",
        role: "user",
        content: "one",
        displayAvailable: true,
        timestamp: "2026-02-01T00:00:00.000Z",
      },
      { id: "b", role: "assistant", content: "two", displayAvailable: true },
      { id: "c", role: "assistant", content: "three", displayAvailable: true },
      {
        id: "d",
        role: "user",
        content: "four",
        displayAvailable: true,
        timestamp: "2026-02-01T00:01:00.000Z",
      },
      { id: "e", role: "assistant", content: "five", displayAvailable: true },
    ]);
    const times = mapped.map((message) => Date.parse(message.createdAt));
    expect(times).toEqual([...times].sort((x, y) => x - y));
    expect(times[1]).toBeGreaterThan(times[0]);
    expect(times[2]).toBeLessThan(times[3]);
    // No older bound: a trailing run steps forward from the last real value.
    expect(times[4]).toBeGreaterThan(times[3]);
  });

  it("keeps a fully timestampless older page before the bound", () => {
    const mapped = mapWireMessages(
      [
        { id: "x", role: "user", content: "one", displayAvailable: true },
        { id: "y", role: "assistant", content: "two", displayAvailable: true },
      ],
      { beforeCreatedAt: bound }
    );
    expect(mapped.map((message) => message.createdAt)).toEqual([
      "2026-01-31T23:59:59.998Z",
      "2026-01-31T23:59:59.999Z",
    ]);
  });
});

describe("mergeWireMessagesById", () => {
  const existing: AgentWidgetMessage[] = [
    { id: "m2", role: "assistant", content: "old two", createdAt: "2026-02-01T00:00:02.000Z" },
    { id: "m3", role: "user", content: "three", createdAt: "2026-02-01T00:00:03.000Z" },
  ];
  const incoming: AgentWidgetMessage[] = [
    { id: "m1", role: "user", content: "one", createdAt: "2026-02-01T00:00:01.000Z" },
    { id: "m2", role: "assistant", content: "new two", createdAt: "2026-02-01T00:00:02.000Z" },
  ];

  it("dedupes by id with incoming winning and sorts once by createdAt", () => {
    const merged = mergeWireMessagesById(existing, incoming);
    expect(merged.map((message) => message.id)).toEqual(["m1", "m2", "m3"]);
    expect(merged.find((message) => message.id === "m2")?.content).toBe("new two");
  });

  it("falls back to sequence then id when createdAt ties", () => {
    const at = "2026-02-01T00:00:00.000Z";
    const merged = mergeWireMessagesById(
      [
        { id: "b", role: "user", content: "b", createdAt: at, sequence: 2 },
        { id: "a", role: "user", content: "a", createdAt: at, sequence: 1 },
      ],
      [{ id: "c", role: "user", content: "c", createdAt: at, sequence: 1 }]
    );
    expect(merged.map((message) => message.id)).toEqual(["a", "c", "b"]);
  });
});
