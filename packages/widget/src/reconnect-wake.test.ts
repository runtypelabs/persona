// @vitest-environment jsdom
//
// Wake-listener behavior for durable reconnect (`session-reconnect.ts`). These
// need a DOM so the `visibilitychange` / `online` listeners actually attach, so
// this file runs in jsdom (the sibling `reconnect.test.ts` is node-env, where
// the `typeof document/window` guards skip the listeners entirely).
//
// The crux: `online` must short-circuit the backoff sleep even when the tab is
// backgrounded, while `visibilitychange` must only wake on the show transition.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AgentWidgetSession, AgentWidgetSessionStatus } from "./session";
import { AgentWidgetMessage } from "./types";

const enc = new TextEncoder();

function sseStream(frames: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const f of frames) controller.enqueue(enc.encode(f));
      controller.close();
    },
  });
}

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

function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

describe("AgentWidgetSession - reconnect wake listeners", () => {
  let messages: AgentWidgetMessage[];
  let status: AgentWidgetSessionStatus;
  let reconnectPhases: string[];

  const baseCallbacks = () => ({
    onMessagesChanged: (m: AgentWidgetMessage[]) => {
      messages = m;
    },
    onStatusChanged: (s: AgentWidgetSessionStatus) => {
      status = s;
    },
    onStreamingChanged: () => {},
    onError: () => {},
    onReconnect: (ev: { phase: string }) => {
      reconnectPhases.push(ev.phase);
    },
  });

  const assistantText = () =>
    messages.find((m) => m.role === "assistant" && !m.variant)?.content ?? "";

  // A session that drops mid-stream, fails its first reconnect attempt (forcing
  // a deliberately long backoff sleep), then succeeds on the second. A prompt
  // 2nd attempt can therefore only mean a wake fired — never the 10s timer.
  function dropThenResumeSession() {
    const initial = sseStream([
      frame(1, "text_delta", {
        id: "text_0",
        delta: "Hello",
        executionId: "exec_1",
      }),
    ]);
    const resume = sseStream([
      frame(2, "text_delta", {
        id: "text_0",
        delta: " world",
        executionId: "exec_1",
      }),
      frame(3, "execution_complete", { success: true, kind: "agent" }),
    ]);
    let calls = 0;
    const session = new AgentWidgetSession(
      {
        apiUrl: "http://x",
        customFetch: async () => ({ ok: true, body: initial }) as any,
        reconnectStream: async () => {
          calls += 1;
          if (calls === 1) return { ok: false } as any;
          return { ok: true, body: resume } as any;
        },
        reconnect: { backoffMs: [10000], maxAttempts: 5 },
      },
      baseCallbacks()
    );
    return {
      session,
      getCalls: () => calls,
    };
  }

  beforeEach(() => {
    messages = [];
    status = "idle";
    reconnectPhases = [];
    setVisibility("visible");
  });

  afterEach(() => {
    setVisibility("visible");
    vi.restoreAllMocks();
  });

  it("online wakes the backoff immediately even when the tab is backgrounded", async () => {
    const { session, getCalls } = dropThenResumeSession();

    await session.sendMessage("hi");
    // Wait until the first reconnect attempt has failed and we're sleeping in
    // the (10s) backoff before the second attempt.
    await waitFor(() => status === "paused");
    expect(getCalls()).toBe(1);

    // Background the tab, then regain connectivity. The visibility guard must
    // NOT suppress the `online` wake.
    setVisibility("hidden");
    window.dispatchEvent(new Event("online"));

    // Without the fix this times out (the loop would wait the full 10s).
    await waitFor(() => reconnectPhases.includes("resumed"));
    expect(getCalls()).toBe(2);
    expect(assistantText()).toBe("Hello world");
    expect(status).toBe("idle");
  });

  it("visibilitychange wakes the backoff when the tab becomes visible", async () => {
    const { session, getCalls } = dropThenResumeSession();

    await session.sendMessage("hi");
    await waitFor(() => status === "paused");
    expect(getCalls()).toBe(1);

    // Tab brought back to the foreground: the show transition should wake.
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => reconnectPhases.includes("resumed"));
    expect(getCalls()).toBe(2);
    expect(assistantText()).toBe("Hello world");
    expect(status).toBe("idle");
  });
});
