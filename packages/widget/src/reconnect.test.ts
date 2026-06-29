import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { AgentWidgetClient } from "./client";
import { AgentWidgetSession, AgentWidgetSessionStatus } from "./session";
import { AgentWidgetEvent, AgentWidgetMessage, ResumableHandle } from "./types";

// ── Helpers ────────────────────────────────────────────────────────────────

const enc = new TextEncoder();

/** Build a closed SSE ReadableStream from raw frame strings. */
function sseStream(frames: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const f of frames) controller.enqueue(enc.encode(f));
      controller.close();
    },
  });
}

/** Build one SSE frame; `id` becomes the `id:` cursor line when non-null. */
function frame(
  id: number | null,
  type: string,
  data: Record<string, unknown> = {}
): string {
  const head = id !== null ? `id: ${id}\n` : "";
  return `${head}event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
}

async function waitFor(pred: () => boolean, timeoutMs = 1500): Promise<void> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (pred()) return;
    if (Date.now() - start > timeoutMs) throw new Error("waitFor: timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

// ── Client: cursor (`id:`) parsing + terminal tagging ────────────────────────

describe("AgentWidgetClient - durable cursor + terminal", () => {
  let client: AgentWidgetClient;
  let events: AgentWidgetEvent[];

  beforeEach(() => {
    events = [];
    client = new AgentWidgetClient({ apiUrl: "http://localhost:8000" });
  });

  it("emits a `cursor` event per frame carrying an `id:` line", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: sseStream([
        frame(1, "text_delta", { id: "text_0", delta: "Hello" }),
        frame(2, "text_delta", { id: "text_0", delta: " world" }),
        frame(3, "execution_complete", { success: true, kind: "agent" }),
      ]),
    });

    await client.dispatch({ messages: [] }, (e) => events.push(e));

    const cursors = events
      .filter((e): e is { type: "cursor"; id: string } => e.type === "cursor")
      .map((e) => e.id);
    expect(cursors).toEqual(["1", "2", "3"]);
  });

  it("tags the graceful terminal `idle` with `terminal: true`", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: sseStream([
        frame(1, "text_delta", { id: "text_0", delta: "Hi" }),
        frame(2, "execution_complete", { success: true, kind: "agent" }),
      ]),
    });

    await client.dispatch({ messages: [] }, (e) => events.push(e));

    const terminalIdle = events.find(
      (e) => e.type === "status" && e.status === "idle" && e.terminal === true
    );
    expect(terminalIdle).toBeDefined();
  });

  it("emits no `cursor` events for a stream without `id:` lines", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: sseStream([
        frame(null, "text_delta", { id: "text_0", delta: "Hi" }),
        frame(null, "execution_complete", { success: true, kind: "agent" }),
      ]),
    });

    await client.dispatch({ messages: [] }, (e) => events.push(e));

    expect(events.some((e) => e.type === "cursor")).toBe(false);
  });
});

// ── Session: drop detection, reconnect, resume ───────────────────────────────

describe("AgentWidgetSession - durable reconnect", () => {
  let messages: AgentWidgetMessage[];
  let status: AgentWidgetSessionStatus;
  let statusHistory: AgentWidgetSessionStatus[];
  let lastError: Error | undefined;
  let reconnectPhases: string[];
  let executionStates: (ResumableHandle | null)[];

  const baseCallbacks = () => ({
    onMessagesChanged: (m: AgentWidgetMessage[]) => {
      messages = m;
    },
    onStatusChanged: (s: AgentWidgetSessionStatus) => {
      status = s;
      statusHistory.push(s);
    },
    onStreamingChanged: () => {},
    onError: (e: Error) => {
      lastError = e;
    },
    onReconnect: (ev: { phase: string }) => {
      reconnectPhases.push(ev.phase);
    },
  });

  beforeEach(() => {
    messages = [];
    status = "idle";
    statusHistory = [];
    lastError = undefined;
    reconnectPhases = [];
    executionStates = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const assistantText = () =>
    messages.find((m) => m.role === "assistant" && !m.variant)?.content ?? "";

  it("reconnects after a drop and appends replayed deltas to the same bubble", async () => {
    // Initial stream: one delta, then closes WITHOUT a terminal (a drop).
    const initial = sseStream([
      frame(1, "text_delta", {
        id: "text_0",
        delta: "Hello",
        executionId: "exec_1",
      }),
    ]);
    // Reconnect stream: replays post-cursor delta, then a graceful terminal.
    const resume = sseStream([
      frame(2, "text_delta", {
        id: "text_0",
        delta: " world",
        executionId: "exec_1",
      }),
      frame(3, "execution_complete", { success: true, kind: "agent" }),
    ]);

    let reconnectCtx: { executionId: string; after: string } | null = null;
    const session = new AgentWidgetSession(
      {
        apiUrl: "http://x",
        customFetch: async () => ({ ok: true, body: initial }) as any,
        reconnectStream: async (ctx) => {
          reconnectCtx = { executionId: ctx.executionId, after: ctx.after };
          return { ok: true, body: resume } as any;
        },
      },
      baseCallbacks()
    );

    await session.sendMessage("hi");
    await waitFor(() => reconnectPhases.includes("resumed"));

    expect(status).toBe("idle");
    // The turn passed through `resuming` before settling.
    expect(statusHistory).toContain("resuming");
    expect(assistantText()).toBe("Hello world");
    expect(reconnectCtx).toEqual({ executionId: "exec_1", after: "1" });
    expect(reconnectPhases).toContain("paused");
    expect(reconnectPhases).toContain("resuming");
    expect(reconnectPhases).toContain("resumed");
    expect(lastError).toBeUndefined();
    // No dispatch-error fallback bubble.
    expect(messages.every((m) => !/couldn't reach/i.test(m.content ?? ""))).toBe(
      true
    );
  });

  it("does NOT reconnect when no reconnectStream is configured (finalizes as today)", async () => {
    const initial = sseStream([
      frame(1, "text_delta", {
        id: "text_0",
        delta: "Hello",
        executionId: "exec_1",
      }),
    ]);
    const session = new AgentWidgetSession(
      {
        apiUrl: "http://x",
        customFetch: async () => ({ ok: true, body: initial }) as any,
      },
      baseCallbacks()
    );

    await session.sendMessage("hi");
    await waitFor(() => status === "idle");

    expect(status).toBe("idle");
    expect(reconnectPhases).toEqual([]);
  });

  it("does NOT reconnect on a graceful terminal", async () => {
    const stream = sseStream([
      frame(1, "text_delta", {
        id: "text_0",
        delta: "Done",
        executionId: "exec_1",
      }),
      frame(2, "execution_complete", { success: true, kind: "agent" }),
    ]);
    const reconnectStream = vi.fn();
    const session = new AgentWidgetSession(
      {
        apiUrl: "http://x",
        customFetch: async () => ({ ok: true, body: stream }) as any,
        reconnectStream,
      },
      baseCallbacks()
    );

    await session.sendMessage("hi");
    await waitFor(() => status === "idle");

    expect(reconnectStream).not.toHaveBeenCalled();
    expect(reconnectPhases).toEqual([]);
    expect(assistantText()).toBe("Done");
  });

  it("does NOT reconnect when the user cancels (abort)", async () => {
    // A stream that stays open after the first delta, so cancel() (not a drop)
    // drives the end. The drop gate must not arm after a user stop.
    const initial = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          enc.encode(
            frame(1, "text_delta", {
              id: "text_0",
              delta: "Hello",
              executionId: "exec_1",
            })
          )
        );
        // Intentionally never closed: cancel() ends the turn.
      },
    });
    const reconnectStream = vi.fn();
    const session = new AgentWidgetSession(
      {
        apiUrl: "http://x",
        customFetch: async () => ({ ok: true, body: initial }) as any,
        reconnectStream,
      },
      baseCallbacks()
    );

    void session.sendMessage("hi");
    await waitFor(() => assistantText() === "Hello");
    session.cancel();
    await new Promise((r) => setTimeout(r, 20));

    expect(reconnectStream).not.toHaveBeenCalled();
    expect(status).toBe("idle");
  });

  it("finalizes with an error after exhausting reconnect attempts", async () => {
    const initial = sseStream([
      frame(1, "text_delta", {
        id: "text_0",
        delta: "Hello",
        executionId: "exec_1",
      }),
    ]);
    const reconnectStream = vi.fn(async () => {
      throw new Error("network down");
    });
    const session = new AgentWidgetSession(
      {
        apiUrl: "http://x",
        customFetch: async () => ({ ok: true, body: initial }) as any,
        reconnectStream,
        reconnect: { backoffMs: [1, 1], maxAttempts: 2 },
      },
      baseCallbacks()
    );

    await session.sendMessage("hi");
    await waitFor(() => status === "idle");

    expect(reconnectStream).toHaveBeenCalledTimes(2);
    expect(lastError).toBeDefined();
    // The partial text is preserved; a failure bubble is appended.
    expect(assistantText()).toContain("Hello");
  });

  it("notifies onExecutionState on create and clears it on terminal", async () => {
    const stream = sseStream([
      frame(1, "text_delta", {
        id: "text_0",
        delta: "Hi",
        executionId: "exec_9",
      }),
      frame(2, "execution_complete", { success: true, kind: "agent" }),
    ]);
    const session = new AgentWidgetSession(
      {
        apiUrl: "http://x",
        customFetch: async () => ({ ok: true, body: stream }) as any,
        reconnectStream: async () => ({ ok: true, body: sseStream([]) }) as any,
        onExecutionState: (h) => executionStates.push(h),
      },
      baseCallbacks()
    );

    await session.sendMessage("hi");
    await waitFor(() => status === "idle");

    // At least one non-null handle was surfaced, and the final state is null.
    expect(executionStates.some((h) => h?.executionId === "exec_9")).toBe(true);
    expect(executionStates[executionStates.length - 1]).toBeNull();
  });

  it("resumeFromHandle boots straight into resuming and reconnects", async () => {
    const resume = sseStream([
      frame(6, "text_delta", {
        id: "text_0",
        delta: " more",
        executionId: "exec_5",
      }),
      frame(7, "execution_complete", { success: true, kind: "agent" }),
    ]);
    let reconnectCtx: { executionId: string; after: string } | null = null;
    const session = new AgentWidgetSession(
      {
        apiUrl: "http://x",
        reconnectStream: async (ctx) => {
          reconnectCtx = { executionId: ctx.executionId, after: ctx.after };
          return { ok: true, body: resume } as any;
        },
      },
      baseCallbacks()
    );

    // Simulate restored history: a prior user + partial assistant bubble.
    session.hydrateMessages([
      {
        id: "u1",
        role: "user",
        content: "tell me a story",
        createdAt: new Date().toISOString(),
      },
      {
        id: "a1",
        role: "assistant",
        content: "Once upon a time",
        createdAt: new Date().toISOString(),
      },
    ]);

    session.resumeFromHandle({ executionId: "exec_5", after: "5" });
    expect(status).toBe("resuming");

    await waitFor(() => status === "idle");

    expect(reconnectCtx).toEqual({ executionId: "exec_5", after: "5" });
    // Replayed delta appended to the reopened trailing assistant bubble.
    expect(assistantText()).toBe("Once upon a time more");
  });
});
