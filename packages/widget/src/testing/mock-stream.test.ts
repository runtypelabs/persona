import { describe, expect, it } from "vitest";
import { AgentWidgetClient } from "../client";
import type { AgentWidgetEvent, AgentWidgetMessage } from "../types";

import {
  buildAssistantTurnFrames,
  createMockSSEResponse,
  createMockSSEStream,
} from "./mock-stream";

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
}

describe("createMockSSEStream", () => {
  it("emits bare `data:` frames by default", async () => {
    const frames = [
      { type: "text_start", executionId: "e-1", turnId: "t-1" },
      { type: "text_delta", executionId: "e-1", turnId: "t-1", delta: "hi" },
      { type: "text_complete", executionId: "e-1", turnId: "t-1" },
    ];
    const text = await readAll(createMockSSEStream(frames, { delayMs: 0 }));

    expect(text).not.toContain("event:");
    expect(text.split("\n\n").filter(Boolean)).toHaveLength(3);
    expect(text).toContain('"type":"text_delta"');
    expect(text).toContain('"delta":"hi"');
  });

  it("emits named event frames when eventName is set", async () => {
    const text = await readAll(
      createMockSSEStream([{ type: "ping" }], { delayMs: 0, eventName: "message" })
    );
    expect(text.startsWith("event: message\n")).toBe(true);
  });

  it("rejects reads with AbortError once the signal aborts, like a real fetch", async () => {
    const abort = new AbortController();
    const frames = Array.from({ length: 5 }, (_, i) => ({
      type: "text_delta",
      delta: `chunk-${i}`,
    }));
    const reader = createMockSSEStream(frames, {
      delayMs: 0,
      signal: abort.signal,
    }).getReader();

    const first = await reader.read();
    expect(first.done).toBe(false);

    abort.abort();

    await expect(reader.read()).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("buildAssistantTurnFrames", () => {
  it("chunks text into delta frames bracketed by start/complete", () => {
    const frames = buildAssistantTurnFrames({
      executionId: "exec-1",
      turnId: "turn-1",
      text: "abcdefghij",
      chunkSize: 4,
    });

    expect(frames.map((f) => f.type)).toEqual([
      "turn_start", "text_start", "text_delta", "text_delta", "text_delta", "text_complete", "turn_complete",
    ]);
    expect(frames[0]).toMatchObject({ id: "turn-1", role: "assistant" });
    const deltas = frames.filter((f) => f.type === "text_delta");
    expect(deltas.map((f) => f.delta)).toEqual(["abcd", "efgh", "ij"]);
    expect(deltas.every((f) => f.executionId === "exec-1" && f.id === "turn-1-text")).toBe(true);
    expect(frames.at(-2)).toMatchObject({ id: "turn-1-text", text: "abcdefghij" });
    expect(frames.at(-1)).toMatchObject({ id: "turn-1", content: "abcdefghij" });
  });

  it("defaults turnId and chunkSize", () => {
    const frames = buildAssistantTurnFrames({ executionId: "exec-2", text: "hello" });
    expect(frames[0].id).toBe("turn-1");
    const deltaCount = frames.filter((f) => f.type === "text_delta").length;
    expect(deltaCount).toBeGreaterThanOrEqual(1);
  });
});

it("renders helper-generated turns through the real client without duplicating completed text", async () => {
  const events: AgentWidgetEvent[] = [];
  const client = new AgentWidgetClient({
    apiUrl: "https://example.test/chat",
    customFetch: async () => createMockSSEResponse([
      { type: "execution_start", executionId: "exec-1", kind: "agent" },
      ...buildAssistantTurnFrames({ executionId: "exec-1", turnId: "turn-1", text: "First reply", chunkSize: 3 }),
      ...buildAssistantTurnFrames({ executionId: "exec-1", turnId: "turn-2", text: "Second reply", chunkSize: 4 }),
      { type: "execution_complete", executionId: "exec-1", kind: "agent", success: true },
    ], { delayMs: 0 }),
  });
  await client.dispatch({ messages: [] }, (event) => events.push(event));
  const messages = new Map<string, AgentWidgetMessage>();
  for (const event of events) {
    if (event.type === "message") messages.set(event.message.id, { ...event.message });
  }
  expect([...messages.values()].map((message) => message.content)).toEqual(["First reply", "Second reply"]);
  expect([...messages.values()].every((message) => !message.streaming)).toBe(true);
});

describe("createMockSSEResponse", () => {
  it("wraps the stream in a text/event-stream Response", async () => {
    const res = createMockSSEResponse([{ type: "ping" }], { delayMs: 0 });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(await res.text()).toContain('"type":"ping"');
  });
});
