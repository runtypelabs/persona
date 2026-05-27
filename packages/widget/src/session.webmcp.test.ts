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

const awaitingMessage = (
  id: string,
  name: string,
  executionId: string = "exec-1",
): AgentWidgetMessage => ({
  id: `msg-${id}-${executionId}`,
  role: "assistant",
  content: "",
  createdAt: new Date().toISOString(),
  agentMetadata: { executionId, awaitingLocalTool: true },
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

  it("aborts an existing controller before installing the resolve controller", async () => {
    // Parity with resolveAskUserQuestion / resolveApproval / sendMessage —
    // a host that re-enters via onMessagesChanged before our microtask
    // runs can leave its own controller installed; we must abort it so two
    // server conversations don't overlap.
    const { session } = makeSession();
    const existing = new AbortController();
    (session as unknown as { abortController: AbortController | null })
      .abortController = existing;
    await session.resolveWebMcpToolCall(
      awaitingMessage("tool-1", "webmcp:search"),
    );
    expect(existing.signal.aborted).toBe(true);
  });

  it("forwards the abort signal into client.executeWebMcpToolCall", async () => {
    // BugBot finding #12: the session must thread its signal INTO the
    // bridge so cancel() can short-circuit the confirm bubble AND the
    // execute() race, not just abort the await on the session side.
    const { session, client } = makeSession();
    await session.resolveWebMcpToolCall(
      awaitingMessage("tool-1", "webmcp:search"),
    );
    const spy = client.executeWebMcpToolCall as ReturnType<typeof vi.fn>;
    expect(spy).toHaveBeenCalledTimes(1);
    const call = spy.mock.calls[0]!;
    // Args: (wireToolName, args, signal?)
    expect(call[0]).toBe("webmcp:search");
    expect(call[2]).toBeInstanceOf(AbortSignal);
  });

  it("does not construct the bridge when config.webmcp.enabled is false", () => {
    // BugBot finding #14: previously the bridge was constructed whenever a
    // `webmcp` block existed, regardless of `enabled`. That left
    // `executeWebMcpToolCall` returning a non-null promise even when WebMCP
    // was explicitly disabled — making the session's "WebMCP not enabled"
    // resume branch dead code. Constructor now gates on `enabled === true`.
    const session = new AgentWidgetSession(
      { apiUrl: "http://test", webmcp: { enabled: false } },
      {
        onMessagesChanged: () => undefined,
        onStatusChanged: () => undefined,
        onStreamingChanged: () => undefined,
      },
    );
    const client = (
      session as unknown as {
        client: {
          executeWebMcpToolCall: (
            n: string,
            a: unknown,
            s?: AbortSignal,
          ) => unknown;
        };
      }
    ).client;
    expect(client.executeWebMcpToolCall("webmcp:x", {})).toBeNull();
  });

  it("does not construct the bridge when config.webmcp is omitted", () => {
    const session = new AgentWidgetSession(
      { apiUrl: "http://test" },
      {
        onMessagesChanged: () => undefined,
        onStatusChanged: () => undefined,
        onStreamingChanged: () => undefined,
      },
    );
    const client = (
      session as unknown as {
        client: {
          executeWebMcpToolCall: (
            n: string,
            a: unknown,
            s?: AbortSignal,
          ) => unknown;
        };
      }
    ).client;
    expect(client.executeWebMcpToolCall("webmcp:x", {})).toBeNull();
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

  it("scopes dedupe by executionId so a different dispatch with the same toolCall.id is not blocked", async () => {
    // BugBot finding #9: a later dispatch (different executionId) that
    // happens to emit a colliding `toolCall.id` must NOT be silently
    // blocked. Dedupe keys are `${executionId}:${toolCallId}` so they
    // naturally segregate.
    const { session, executeSpy, resumeSpy } = makeSession();
    await session.resolveWebMcpToolCall(
      awaitingMessage("tool-1", "webmcp:search", "exec-1"),
    );
    // Different execution, same toolCall.id — must be allowed.
    await session.resolveWebMcpToolCall(
      awaitingMessage("tool-1", "webmcp:search", "exec-2"),
    );
    expect(executeSpy).toHaveBeenCalledTimes(2);
    expect(resumeSpy).toHaveBeenCalledTimes(2);
  });

  it("blocks stale re-emits of an old executionId even after a new dispatch starts", async () => {
    // BugBot finding #11: clearing the resolved set on sendMessage would
    // let a stale step_await from the prior /resume's still-active SSE
    // re-trigger execute(). With executionId-scoped keys, the prior
    // execution's resolved entries persist — so stale re-emits stay blocked.
    const { session, executeSpy, resumeSpy } = makeSession();
    await session.resolveWebMcpToolCall(
      awaitingMessage("tool-1", "webmcp:search", "exec-1"),
    );
    // Stale re-emit from exec-1 after a new turn started — still blocked.
    await session.resolveWebMcpToolCall(
      awaitingMessage("tool-1", "webmcp:search", "exec-1"),
    );
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(resumeSpy).toHaveBeenCalledTimes(1);
  });

  it("surfaces onError when a step_await is missing executionId", async () => {
    // BugBot finding #17: silently returning here strands the server-side
    // dispatch with no recovery path. Persona can't /resume without an
    // executionId, but it CAN surface the failure to the host so an
    // operator notices.
    const onError = vi.fn();
    const session = new AgentWidgetSession(
      { apiUrl: "http://test", webmcp: { enabled: true } },
      {
        onMessagesChanged: () => undefined,
        onStatusChanged: () => undefined,
        onStreamingChanged: () => undefined,
        onError,
      },
    );
    const broken: AgentWidgetMessage = {
      id: "msg-broken",
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      toolCall: { id: "tool-x", name: "webmcp:search", status: "complete" },
      // executionId missing
    };
    await session.resolveWebMcpToolCall(broken);
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]![0] as Error).message).toMatch(
      /executionId/i,
    );
  });

  it("posts isError /resume when a step_await is missing toolCall.id", async () => {
    // BugBot finding #17 (cont.): when executionId is present but toolCall.id
    // is missing, we can still advance the server-side dispatch by posting
    // an isError /resume for the tool name. Dedupe falls apart but the
    // dispatch doesn't hang.
    const { session, resumeSpy } = makeSession();
    const partial: AgentWidgetMessage = {
      id: "msg-no-toolid",
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      agentMetadata: { executionId: "exec-x", awaitingLocalTool: true },
      toolCall: {
        id: "",
        name: "webmcp:search",
        status: "complete",
      },
    };
    await session.resolveWebMcpToolCall(partial);
    expect(resumeSpy).toHaveBeenCalledTimes(1);
    const payload = (resumeSpy.mock.calls[0]! as unknown[])[1] as {
      "webmcp:search": WebMcpToolResult;
    };
    expect(payload["webmcp:search"].isError).toBe(true);
  });
});
