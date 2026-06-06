import { describe, it, expect, vi, beforeEach } from "vitest";

import { AgentWidgetSession } from "./session";
import type {
  AgentWidgetMessage,
  WebMcpConfirmInfo,
  WebMcpToolResult,
} from "./types";

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

  it("does NOT abort the shared session abortController", async () => {
    // The chained-turn fix: a webmcp resolve must leave `this.abortController`
    // untouched. In a chain (tool A → /resume → tool B) that shared controller
    // is still piping A's resume SSE — the very stream that just delivered B's
    // step_await — so aborting it strands B (it never executes; its /resume is
    // never POSTed; the dispatch hangs forever). Resolves use a dedicated
    // per-call controller tracked in `webMcpResolveControllers` instead.
    const { session } = makeSession();
    const shared = new AbortController();
    (session as unknown as { abortController: AbortController | null })
      .abortController = shared;
    await session.resolveWebMcpToolCall(
      awaitingMessage("tool-1", "webmcp:search"),
    );
    expect(shared.signal.aborted).toBe(false);
    expect(
      (session as unknown as { abortController: AbortController | null })
        .abortController,
    ).toBe(shared);
  });

  it("a second resolve does not abort the first (chained / parallel)", () => {
    // Two `webmcp:*` resolves in one turn each own a controller; neither aborts
    // the other. (Previously the second pre-aborted the shared controller,
    // killing the first / the in-flight resume stream.)
    const stuck = new Promise<WebMcpToolResult>(() => undefined);
    const { session } = makeSession({ executeImpl: () => stuck });
    const set = (
      session as unknown as { webMcpResolveControllers: Set<AbortController> }
    ).webMcpResolveControllers;

    void session.resolveWebMcpToolCall(awaitingMessage("tool-1", "webmcp:search"));
    const first = [...set][0]!;
    void session.resolveWebMcpToolCall(awaitingMessage("tool-2", "webmcp:add"));

    expect(set.size).toBe(2);
    expect(first.signal.aborted).toBe(false);
  });

  it("cancel() aborts and clears every in-flight resolve controller", () => {
    const stuck = new Promise<WebMcpToolResult>(() => undefined);
    const { session } = makeSession({ executeImpl: () => stuck });
    const set = (
      session as unknown as { webMcpResolveControllers: Set<AbortController> }
    ).webMcpResolveControllers;

    void session.resolveWebMcpToolCall(awaitingMessage("tool-1", "webmcp:search"));
    void session.resolveWebMcpToolCall(awaitingMessage("tool-2", "webmcp:add"));
    const controllers = [...set];
    expect(controllers).toHaveLength(2);

    session.cancel();
    expect(set.size).toBe(0);
    for (const c of controllers) expect(c.signal.aborted).toBe(true);
  });

  it("clearMessages() tears down in-flight resolve controllers", () => {
    const stuck = new Promise<WebMcpToolResult>(() => undefined);
    const { session } = makeSession({ executeImpl: () => stuck });
    const set = (
      session as unknown as { webMcpResolveControllers: Set<AbortController> }
    ).webMcpResolveControllers;

    void session.resolveWebMcpToolCall(awaitingMessage("tool-1", "webmcp:search"));
    const c = [...set][0]!;

    session.clearMessages();
    expect(set.size).toBe(0);
    expect(c.signal.aborted).toBe(true);
  });

  it("a microtask-deferred resolve bails if a teardown bumped the epoch", async () => {
    // Problem #3 from the reverted iter-10: a resolve deferred via
    // queueMicrotask must not escape a teardown that happened between queue and
    // run. handleEvent captures the epoch; clearMessages bumps it; the deferred
    // resolve sees the mismatch and never executes the page tool.
    const { session, executeSpy } = makeSession();
    (
      session as unknown as { handleEvent: (e: unknown) => void }
    ).handleEvent({
      type: "message",
      message: awaitingMessage("tool-1", "webmcp:search"),
    });
    // Teardown BEFORE the queued microtask runs.
    session.clearMessages();
    // Flush the microtask queue.
    await Promise.resolve();
    await Promise.resolve();
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it("a stale step_await re-emit does not resurrect awaitingLocalTool once resolved", () => {
    // BugBot: a duplicate step_await (awaitingLocalTool:true) for an
    // already-resolved webmcp tool must not flip the message back to awaiting
    // and show a stuck local-tool wait. upsertMessage clears it when the
    // tool's `${executionId}:${toolCallId}` key is inflight/resolved.
    const session = makeSession().session;
    const s = session as unknown as {
      webMcpResolvedKeys: Set<string>;
      upsertMessage: (m: AgentWidgetMessage) => void;
      messages: AgentWidgetMessage[];
    };
    s.webMcpResolvedKeys.add("exec-1:tool-1");
    // Baseline: the resolved message with awaiting already cleared.
    s.upsertMessage({
      ...awaitingMessage("tool-1", "webmcp:search"),
      agentMetadata: { executionId: "exec-1", awaitingLocalTool: false },
    });
    // Stale re-emit flips awaiting back to true on the wire.
    s.upsertMessage(awaitingMessage("tool-1", "webmcp:search"));
    const stored = s.messages.find((m) => m.toolCall?.id === "tool-1");
    expect(stored?.agentMetadata?.awaitingLocalTool).toBe(false);
  });

  it("an error event does not clear streaming while a webmcp resolve is in flight", () => {
    // BugBot: the error handler mirrors the idle handler — it must not tear
    // down streaming while a sibling/successor resolve is still executing.
    const stuck = new Promise<WebMcpToolResult>(() => undefined);
    const session = makeSession({ executeImpl: () => stuck }).session;
    void session.resolveWebMcpToolCall(awaitingMessage("tool-1", "webmcp:search"));
    (
      session as unknown as { handleEvent: (e: unknown) => void }
    ).handleEvent({ type: "error", error: new Error("stream blip") });
    expect((session as unknown as { streaming: boolean }).streaming).toBe(true);
  });

  it("connectStream error does not clear streaming while a webmcp resolve is in flight", async () => {
    // BugBot: connectStream's catch mirrors the error/idle handlers — a failed
    // resume stream must not tear down streaming while another resolve runs.
    const session = new AgentWidgetSession(
      { apiUrl: "http://test", webmcp: { enabled: true } },
      {
        onMessagesChanged: () => undefined,
        onStatusChanged: () => undefined,
        onStreamingChanged: () => undefined,
      },
    );
    const s = session as unknown as {
      client: { processStream: (...a: unknown[]) => Promise<void> };
      webMcpResolveControllers: Set<AbortController>;
      streaming: boolean;
    };
    s.client.processStream = vi.fn(async () => {
      throw new Error("stream blip");
    });
    // Simulate a resolve still in flight.
    s.webMcpResolveControllers.add(new AbortController());
    await session.connectStream(new ReadableStream(), { allowReentry: true });
    expect(s.streaming).toBe(true);
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

  it("dedupes repeated malformed (missing toolCall.id) re-emits", async () => {
    // BugBot iter 9: posting an isError /resume for a no-toolCallId message
    // is recovery, not a license to repeat. Identical re-emits of the same
    // malformed step_await (same executionId + wireToolName) must collapse
    // to a single POST.
    const { session, resumeSpy } = makeSession();
    const partial = (): AgentWidgetMessage => ({
      id: `msg-${Math.random()}`,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      agentMetadata: { executionId: "exec-x", awaitingLocalTool: true },
      toolCall: { id: "", name: "webmcp:search", status: "complete" },
    });
    await session.resolveWebMcpToolCall(partial());
    await session.resolveWebMcpToolCall(partial());
    await session.resolveWebMcpToolCall(partial());
    expect(resumeSpy).toHaveBeenCalledTimes(1);
  });

  it("keys a single call's /resume by webMcpToolCallId when present", async () => {
    // core#3878: when the server emits a per-call id, the single-call path keys
    // /resume by it (server prefers id over name) — not by the wire tool name.
    const { session, resumeSpy } = makeSession({
      executeReturn: { content: [{ type: "text", text: "added" }] },
    });
    const msg: AgentWidgetMessage = {
      id: "msg-single",
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      agentMetadata: {
        executionId: "exec-1",
        awaitingLocalTool: true,
        webMcpToolCallId: "toolu_AAA",
      },
      toolCall: {
        id: "toolu_AAA",
        name: "webmcp:add_to_cart",
        status: "complete",
        args: { sku: "SHOE-001" },
      },
    };
    await session.resolveWebMcpToolCall(msg);
    expect(resumeSpy).toHaveBeenCalledTimes(1);
    const payload = (resumeSpy.mock.calls[0]! as unknown[])[1] as Record<
      string,
      unknown
    >;
    expect(Object.keys(payload)).toEqual(["toolu_AAA"]);
  });
});

describe("AgentWidgetSession — WebMCP parallel batched resume (core#3878)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // A `step_await(local_tool_required)` message as client.ts emits it for a
  // PARALLEL local-tool call: the per-call `toolCallId` is both the toolCall.id
  // AND `agentMetadata.webMcpToolCallId`. Two of these for one executionId share
  // a tool name but differ by id (the whole point of core#3878).
  const parallelAwait = (
    toolCallId: string,
    sku: string,
    executionId = "exec-par",
  ): AgentWidgetMessage => ({
    id: `tool-${toolCallId}`,
    role: "assistant",
    content: "",
    createdAt: new Date().toISOString(),
    agentMetadata: {
      executionId,
      awaitingLocalTool: true,
      webMcpToolCallId: toolCallId,
    },
    toolCall: {
      id: toolCallId,
      name: "webmcp:add_to_cart",
      status: "complete",
      args: { sku },
    },
  });

  const feed = (session: AgentWidgetSession, msg: AgentWidgetMessage) =>
    (session as unknown as { handleEvent: (e: unknown) => void }).handleEvent({
      type: "message",
      message: msg,
    });

  const flushMicrotasks = async () => {
    // enqueue → queueMicrotask(flush) → resolveWebMcpToolCallBatch (async).
    for (let i = 0; i < 6; i++) await Promise.resolve();
  };

  it("two parallel same-tool awaits → both execute → exactly ONE batched /resume keyed by toolCallId", async () => {
    const { session, executeSpy, resumeSpy } = makeSession({
      // Echo the sku so we can prove each call's output is mapped to its id.
      executeImpl: undefined,
    });
    // Make execute return a per-call result derived from its args.
    const client = (session as unknown as { client: Record<string, unknown> })
      .client;
    (client.executeWebMcpToolCall as ReturnType<typeof vi.fn>).mockImplementation(
      (_name: string, args: { sku: string }) => {
        executeSpy();
        return Promise.resolve({
          content: [{ type: "text", text: `added ${args.sku}` }],
        });
      },
    );

    // Two parallel step_awaits arrive in the SAME tick (one paused execution).
    feed(session, parallelAwait("toolu_A", "SHOE-001"));
    feed(session, parallelAwait("toolu_B", "SHOE-007"));
    await flushMicrotasks();

    // Both page tools ran.
    expect(executeSpy).toHaveBeenCalledTimes(2);

    // Exactly ONE /resume for the shared execution — not one per tool.
    expect(resumeSpy).toHaveBeenCalledTimes(1);
    const [execId, toolOutputs] = resumeSpy.mock.calls[0]! as unknown as [
      string,
      Record<string, { content: { text: string }[] }>,
    ];
    expect(execId).toBe("exec-par");
    // Keyed by per-call toolCallId, with each call's own output.
    expect(Object.keys(toolOutputs).sort()).toEqual(["toolu_A", "toolu_B"]);
    expect(toolOutputs["toolu_A"].content[0].text).toBe("added SHOE-001");
    expect(toolOutputs["toolu_B"].content[0].text).toBe("added SHOE-007");
  });

  it("executes siblings concurrently — one call's gate Promise does not block the other", async () => {
    // The native approval bubble parks each call's execute on a Promise. A
    // gated sibling must not head-of-line-block the others: both executes
    // should be in flight before either completes.
    let releaseA: (r: WebMcpToolResult) => void = () => undefined;
    let releaseB: (r: WebMcpToolResult) => void = () => undefined;
    const pA = new Promise<WebMcpToolResult>((r) => (releaseA = r));
    const pB = new Promise<WebMcpToolResult>((r) => (releaseB = r));
    const started: string[] = [];

    const { session, resumeSpy } = makeSession();
    const client = (session as unknown as { client: Record<string, unknown> })
      .client;
    (client.executeWebMcpToolCall as ReturnType<typeof vi.fn>).mockImplementation(
      (_name: string, args: { sku: string }) => {
        started.push(args.sku);
        return args.sku === "SHOE-001" ? pA : pB;
      },
    );

    feed(session, parallelAwait("toolu_A", "SHOE-001"));
    feed(session, parallelAwait("toolu_B", "SHOE-007"));
    await flushMicrotasks();

    // Both executes are in flight even though neither has resolved → no
    // head-of-line blocking. No /resume yet (both still parked).
    expect(started.sort()).toEqual(["SHOE-001", "SHOE-007"]);
    expect(resumeSpy).not.toHaveBeenCalled();

    // Release out of order; the batched resume waits for BOTH.
    releaseB({ content: [{ type: "text", text: "b" }] });
    await flushMicrotasks();
    expect(resumeSpy).not.toHaveBeenCalled();
    releaseA({ content: [{ type: "text", text: "a" }] });
    await flushMicrotasks();
    expect(resumeSpy).toHaveBeenCalledTimes(1);
    const toolOutputs = (resumeSpy.mock.calls[0]! as unknown[])[1] as Record<
      string,
      unknown
    >;
    expect(Object.keys(toolOutputs).sort()).toEqual(["toolu_A", "toolu_B"]);
  });

  it("dedupes a duplicate parallel await within the same batch", async () => {
    const { session, executeSpy, resumeSpy } = makeSession();
    feed(session, parallelAwait("toolu_A", "SHOE-001"));
    feed(session, parallelAwait("toolu_A", "SHOE-001")); // duplicate id
    feed(session, parallelAwait("toolu_B", "SHOE-007"));
    await flushMicrotasks();
    expect(executeSpy).toHaveBeenCalledTimes(2); // A once, B once
    expect(resumeSpy).toHaveBeenCalledTimes(1);
  });

  it("a teardown before the batch flush strands it (epoch guard)", async () => {
    const { session, executeSpy, resumeSpy } = makeSession();
    feed(session, parallelAwait("toolu_A", "SHOE-001"));
    feed(session, parallelAwait("toolu_B", "SHOE-007"));
    // Teardown BEFORE the queued flush microtask runs.
    session.clearMessages();
    await flushMicrotasks();
    expect(executeSpy).not.toHaveBeenCalled();
    expect(resumeSpy).not.toHaveBeenCalled();
  });

  it("settles pending approval bubbles on teardown so a parked resolve can't hang", async () => {
    // BugBot (PR #214): the bridge parks a resolve on `await requestConfirm`
    // and only re-checks signal.aborted AFTER that await. If a teardown
    // (cancel/clearMessages/hydrate/sendMessage) happens while an approval
    // bubble is still awaiting a click, the resolver must be settled or the
    // bridge execute / its /resume / the resolve's finally all hang forever.
    const { session } = makeSession();
    const s = session as unknown as {
      webMcpApprovalResolvers: Map<string, (b: boolean) => void>;
    };

    // No autoApprove → the gate parks on a pending Promise.
    const pending = session.requestWebMcpApproval({
      toolName: "add_to_cart",
      args: { sku: "SHOE-001" },
    } as WebMcpConfirmInfo);
    expect(s.webMcpApprovalResolvers.size).toBe(1);

    session.cancel();

    // The parked confirm Promise resolves false (declined) and the map clears.
    await expect(pending).resolves.toBe(false);
    expect(s.webMcpApprovalResolvers.size).toBe(0);
  });

  it("clearMessages() also settles pending approval bubbles", async () => {
    const { session } = makeSession();
    const s = session as unknown as {
      webMcpApprovalResolvers: Map<string, (b: boolean) => void>;
    };
    const pending = session.requestWebMcpApproval({
      toolName: "add_to_cart",
      args: { sku: "SHOE-007" },
    } as WebMcpConfirmInfo);
    expect(s.webMcpApprovalResolvers.size).toBe(1);
    session.clearMessages();
    await expect(pending).resolves.toBe(false);
    expect(s.webMcpApprovalResolvers.size).toBe(0);
  });
});
