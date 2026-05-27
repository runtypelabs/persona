import { describe, it, expect, vi, beforeEach } from "vitest";

import { AgentWidgetSession } from "./session";
import type { AgentWidgetMessage, WebMcpToolResult } from "./types";

// Build a session whose client has WebMCP methods overridden by spies.
const makeSession = (overrides?: {
  executeReturn?: WebMcpToolResult;
  resumeOk?: boolean;
  isOperational?: boolean;
  executeImpl?: () => Promise<WebMcpToolResult>;
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
    overrides?.executeImpl ??
      (async (): Promise<WebMcpToolResult> =>
        overrides?.executeReturn ?? {
          content: [{ type: "text", text: "ok" }],
        }),
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

  const resumeSpy = vi.fn(async () => new Response(new Blob([""]), {
    status: overrides?.resumeOk === false ? 500 : 200,
  }));
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
    expect(resumeSpy).toHaveBeenCalledWith(
      "exec-1",
      { "webmcp:search": { content: [{ type: "text", text: "hi" }] } },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
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

  it("allows retry on the same toolCall.id when /resume fails", async () => {
    // BugBot finding #4: a permanent handled-set would block the only retry
    // path when `/resume` itself fails (network / server). The dedupe should
    // promote to "resolved" only AFTER /resume succeeds; failures stay
    // retryable on the next step_await re-emit.
    const { session, executeSpy, resumeSpy, client } = makeSession();
    // First attempt: resume throws.
    (client.resumeFlow as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async () => {
        throw new Error("network down");
      },
    );
    // Second attempt: resume succeeds.
    (client.resumeFlow as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async () =>
        new Response(new Blob([""]), {
          status: 200,
        }),
    );

    const msg = awaitingMessage("tool-1", "webmcp:search");
    await session.resolveWebMcpToolCall(msg);
    await session.resolveWebMcpToolCall(msg); // retry — must be allowed
    await session.resolveWebMcpToolCall(msg); // post-success — must be blocked

    expect(executeSpy).toHaveBeenCalledTimes(2);
    expect(resumeSpy).toHaveBeenCalledTimes(2);
  });

  it("threads an AbortSignal into resumeFlow", async () => {
    // BugBot finding #6: cancel() needs to propagate into /resume.
    const { session, resumeSpy } = makeSession();
    await session.resolveWebMcpToolCall(
      awaitingMessage("tool-1", "webmcp:search"),
    );
    const call = resumeSpy.mock.calls[0]!;
    const opts = (call as unknown[])[2] as { signal?: AbortSignal } | undefined;
    expect(opts?.signal).toBeInstanceOf(AbortSignal);
    expect(opts!.signal!.aborted).toBe(false);
  });

  it("aborts an in-flight resolve when cancel() is called", async () => {
    // BugBot finding #6 (cont.) — the bridge execute race should reject on
    // cancel so the dispatch doesn't fire a stale /resume after the user
    // stops.
    let release: () => void = () => undefined;
    const stuck = new Promise<WebMcpToolResult>((resolve) => {
      release = () =>
        resolve({ content: [{ type: "text", text: "late" }] });
    });
    const { session, resumeSpy } = makeSession({ executeImpl: () => stuck });
    const inflight = session.resolveWebMcpToolCall(
      awaitingMessage("tool-1", "webmcp:slow"),
    );
    session.cancel();
    // Allow the rejected race + catch to settle.
    release();
    await inflight;
    expect(resumeSpy).not.toHaveBeenCalled();
  });

  it("marks resolved on HTTP /resume success, not on stream completion", async () => {
    // BugBot finding #8: if the resume HTTP response is OK but the downstream
    // SSE stream errors, we still want dedupe to block re-emits — the server
    // has already accepted the answer.
    const { session, resumeSpy, executeSpy } = makeSession();
    // Make connectStream throw to simulate a broken downstream SSE.
    (session as unknown as { connectStream: () => Promise<void> })
      .connectStream = vi.fn(async () => {
        throw new Error("stream broken");
      });

    const msg = awaitingMessage("tool-1", "webmcp:search");
    await session.resolveWebMcpToolCall(msg);
    await session.resolveWebMcpToolCall(msg); // re-emit — must be blocked

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(resumeSpy).toHaveBeenCalledTimes(1);
  });

  it("resets the resolved set on sendMessage so recycled toolCall.ids don't get blocked", async () => {
    // BugBot finding #9: webMcpResolvedToolCallIds is per-dispatch state, not
    // per-session. A later dispatch that happens to emit the same toolCall.id
    // must not be silently blocked.
    const { session, executeSpy, resumeSpy, client } = makeSession();
    await session.resolveWebMcpToolCall(
      awaitingMessage("tool-1", "webmcp:search"),
    );
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(resumeSpy).toHaveBeenCalledTimes(1);

    // Simulate a new dispatch — stub the dispatch path so sendMessage doesn't
    // make a real network call.
    (client.dispatch as ReturnType<typeof vi.fn> | undefined) = vi.fn(
      async () => undefined,
    );
    client.dispatch = vi.fn(async () => undefined);
    await session.sendMessage("a second turn");

    // Same toolCall.id, new dispatch — must be allowed through.
    await session.resolveWebMcpToolCall(
      awaitingMessage("tool-1", "webmcp:search"),
    );
    expect(executeSpy).toHaveBeenCalledTimes(2);
    expect(resumeSpy).toHaveBeenCalledTimes(2);
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
