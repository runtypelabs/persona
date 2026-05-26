import { describe, it, expect, vi, beforeEach } from "vitest";

import { AgentWidgetSession } from "./session";
import type { AgentWidgetMessage, WebMcpToolResult } from "./types";

// Build a session whose client has WebMCP methods overridden by spies.
const makeSession = (overrides?: {
  executeReturn?: WebMcpToolResult;
  resumeOk?: boolean;
  isOperational?: boolean;
}) => {
  const session = new AgentWidgetSession(
    { apiUrl: "http://test", webmcp: { enabled: true } },
    {
      onMessagesChanged: () => undefined,
      onStatusChanged: () => undefined,
      onStreamingChanged: () => undefined,
    },
  );

  const client = (session as unknown as { client: Record<string, unknown> })
    .client;

  const executeSpy = vi.fn(
    async (): Promise<WebMcpToolResult> =>
      overrides?.executeReturn ?? {
        content: [{ type: "text", text: "ok" }],
      },
  );
  // Mimic AgentWidgetClient.executeWebMcpToolCall — returns null when bridge
  // not configured. We toggle via isOperational below.
  client.executeWebMcpToolCall = vi.fn(
    () =>
      overrides?.isOperational === false
        ? null
        : executeSpy(),
  );
  client.isWebMcpOperational = vi.fn(
    () => overrides?.isOperational !== false,
  );

  const resumeBody = new Response(new Blob([""]), {
    status: overrides?.resumeOk === false ? 500 : 200,
  });
  const resumeSpy = vi.fn(async () => resumeBody);
  client.resumeFlow = resumeSpy;

  // Stub `connectStream` so we don't try to parse the empty body.
  (session as unknown as { connectStream: () => Promise<void> }).connectStream =
    vi.fn(async () => undefined);

  return { session, executeSpy, resumeSpy, client };
};

const awaitingMessage = (id: string, name: string): AgentWidgetMessage => ({
  id: `msg-${id}`,
  role: "assistant",
  content: "",
  createdAt: new Date().toISOString(),
  agentMetadata: { executionId: "exec-1", awaitingLocalTool: true },
  toolCall: {
    id,
    name,
    status: "complete",
    args: { q: "shoes" },
  },
});

describe("AgentWidgetSession — WebMCP resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts result to /resume on the happy path", async () => {
    const { session, executeSpy, resumeSpy } = makeSession({
      executeReturn: {
        content: [{ type: "text", text: "hi" }],
      },
    });
    await session.resolveWebMcpToolCall(
      awaitingMessage("tool-1", "webmcp:search"),
    );
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(resumeSpy).toHaveBeenCalledWith("exec-1", {
      "webmcp:search": { content: [{ type: "text", text: "hi" }] },
    });
  });

  it("still resumes (with isError) when the bridge is not operational", async () => {
    // BugBot finding #1: previously, handleEvent skipped resolveWebMcpToolCall
    // entirely when `isWebMcpOperational()` was false — leaving the dispatch
    // hung. The session must surface an actionable error to /resume instead.
    const { session, resumeSpy } = makeSession({
      isOperational: false,
    });
    await session.resolveWebMcpToolCall(
      awaitingMessage("tool-1", "webmcp:search"),
    );
    expect(resumeSpy).toHaveBeenCalledTimes(1);
    const call = resumeSpy.mock.calls[0]!;
    const payload = (call as unknown[])[1] as {
      "webmcp:search": WebMcpToolResult;
    };
    expect(payload["webmcp:search"].isError).toBe(true);
  });

  it("dedupes re-emitted step_await for the same toolCall.id", async () => {
    // BugBot finding #2: an SSE re-emit of the same step_await message would
    // re-set `awaitingLocalTool: true` after the local upsertMessage cleared
    // it. The handled-set must outlive the resolve round-trip.
    const { session, executeSpy, resumeSpy } = makeSession();
    const msg = awaitingMessage("tool-1", "webmcp:search");

    await session.resolveWebMcpToolCall(msg);
    await session.resolveWebMcpToolCall(msg); // re-emit
    await session.resolveWebMcpToolCall(msg); // re-emit again

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(resumeSpy).toHaveBeenCalledTimes(1);
  });

  it("returns silently for a malformed message (missing executionId)", async () => {
    const { session, executeSpy, resumeSpy } = makeSession();
    const broken: AgentWidgetMessage = {
      id: "msg-broken",
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      toolCall: { id: "tool-x", name: "webmcp:search", status: "complete" },
      // executionId missing
    };
    await session.resolveWebMcpToolCall(broken);
    expect(executeSpy).not.toHaveBeenCalled();
    expect(resumeSpy).not.toHaveBeenCalled();
  });
});
