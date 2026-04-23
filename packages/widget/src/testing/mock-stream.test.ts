import { describe, expect, it } from "vitest";

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
      { type: "agent_turn_start", executionId: "e-1", turnId: "t-1" },
      { type: "agent_turn_delta", executionId: "e-1", turnId: "t-1", delta: "hi" },
      { type: "agent_turn_complete", executionId: "e-1", turnId: "t-1" },
    ];
    const text = await readAll(createMockSSEStream(frames, { delayMs: 0 }));

    expect(text).not.toContain("event:");
    expect(text.split("\n\n").filter(Boolean)).toHaveLength(3);
    expect(text).toContain('"type":"agent_turn_delta"');
    expect(text).toContain('"delta":"hi"');
  });

  it("emits named event frames when eventName is set", async () => {
    const text = await readAll(
      createMockSSEStream([{ type: "ping" }], { delayMs: 0, eventName: "message" })
    );
    expect(text.startsWith("event: message\n")).toBe(true);
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

    expect(frames[0]).toEqual({ type: "agent_turn_start", executionId: "exec-1", turnId: "turn-1" });
    expect(frames[frames.length - 1]).toEqual({
      type: "agent_turn_complete",
      executionId: "exec-1",
      turnId: "turn-1",
    });

    const deltas = frames.filter((f) => f.type === "agent_turn_delta");
    expect(deltas.map((f) => f.delta)).toEqual(["abcd", "efgh", "ij"]);
    expect(deltas.every((f) => f.executionId === "exec-1" && f.turnId === "turn-1")).toBe(true);
  });

  it("defaults turnId and chunkSize", () => {
    const frames = buildAssistantTurnFrames({ executionId: "exec-2", text: "hello" });
    expect(frames[0].turnId).toBe("turn-1");
    const deltaCount = frames.filter((f) => f.type === "agent_turn_delta").length;
    expect(deltaCount).toBeGreaterThanOrEqual(1);
  });
});

describe("createMockSSEResponse", () => {
  it("wraps the stream in a text/event-stream Response", async () => {
    const res = createMockSSEResponse([{ type: "ping" }], { delayMs: 0 });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(await res.text()).toContain('"type":"ping"');
  });
});
