// @vitest-environment jsdom

import { afterEach, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import * as morph from "./utils/morph";

vi.mock("./utils/morph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./utils/morph")>();
  return { ...actual, morphMessages: vi.fn(actual.morphMessages) };
});

// A finished, tool-heavy agent run replayed through `connectStream` arrives as
// one burst of already-queued frames. Each frame used to render the whole
// transcript synchronously, so replay cost O(frames²) and crashed the tab
// (#506). The burst now coalesces into a bounded number of render passes.
const replayFrames = (pairs: number): string[] => {
  const frames: string[] = [];
  let seq = 0;
  const push = (event: Record<string, unknown>) => {
    seq += 1;
    frames.push(
      `id: ${seq}\nevent: ${event.type}\ndata: ${JSON.stringify({ ...event, seq, executionId: "exec_1" })}\n\n`
    );
  };
  push({ type: "execution_start", kind: "agent", startedAt: new Date().toISOString() });
  for (let index = 0; index < pairs; index += 1) {
    const toolCallId = `call_${index}`;
    push({
      type: "tool_start",
      toolCallId,
      toolName: "get_item",
      toolType: "mcp",
      parameters: { id: `item_${index}` },
      startedAt: new Date().toISOString(),
    });
    push({
      type: "tool_complete",
      toolCallId,
      toolName: "get_item",
      success: true,
      result: `{"id":"item_${index}","description":"${"x".repeat(150)}"}`,
      executionTime: 12,
    });
  }
  push({
    type: "execution_complete",
    kind: "agent",
    success: true,
    outcome: "completed",
    completedAt: new Date().toISOString(),
  });
  return frames;
};

afterEach(() => {
  document.body.innerHTML = "";
  vi.mocked(morph.morphMessages).mockClear();
});

it("replays a long tool-heavy transcript in a bounded number of render passes", async () => {
  const pairs = 200;
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    features: { showToolCalls: true, toolCallDisplay: { collapsedMode: "tool-name" } },
  });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      for (const frame of replayFrames(pairs)) streamController.enqueue(encoder.encode(frame));
      streamController.close();
    },
  });
  vi.mocked(morph.morphMessages).mockClear();

  await controller.connectStream(stream);

  expect(mount.querySelectorAll(".persona-tool-bubble")).toHaveLength(pairs);
  expect(controller.getState().streaming).toBe(false);
  // 2 × pairs frames; a handful of passes for stream start/end bookkeeping.
  expect(vi.mocked(morph.morphMessages).mock.calls.length).toBeLessThan(10);
  controller.destroy();
});
