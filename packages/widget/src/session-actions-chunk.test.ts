import { describe, it, expect, vi } from "vitest";

// Simulate the IIFE/CDN path: the session-actions chunk is not provided up
// front and its load is held open by the test.
const chunk = vi.hoisted(() => {
  let release: (mod: unknown) => void = () => {};
  const resolveApproval = vi.fn(async () => {});
  return {
    resolveApproval,
    promise: new Promise((resolve) => {
      release = resolve;
    }),
    release: () =>
      release({
        resolveApproval,
        resolveAskUserQuestion: vi.fn(async () => {}),
        resolveWebMcpToolCall: vi.fn(async () => {}),
        resolveWebMcpToolCallBatch: vi.fn(async () => {}),
      }),
  };
});

vi.mock("./session-actions-loader", () => ({
  getSessionActionsSync: () => null,
  loadSessionActions: () => chunk.promise,
  setSessionActionsLoader: () => {},
  provideSessionActions: () => {},
}));

import { AgentWidgetSession } from "./session";

const approval = {
  id: "approval-1",
  status: "pending" as const,
  agentId: "agent-1",
  executionId: "exec-1",
  toolName: "do_thing",
  description: "Do the thing",
  parameters: {},
};

describe("session actions waiting on the lazy chunk", () => {
  it("drops a resolve whose turn was stopped while the chunk loaded", async () => {
    const session = new AgentWidgetSession({ apiUrl: "http://localhost:8000" }, {
      onMessagesChanged: () => {},
      onStatusChanged: () => {},
      onStreamingChanged: () => {},
    });
    const pending = session.resolveApproval(approval as never, "approved");
    session.cancel();
    chunk.release();
    await pending;
    expect(chunk.resolveApproval).not.toHaveBeenCalled();
  });
});
