import { describe, it, expect } from "vitest";
import {
  ThroughputTracker,
  estimateOutputTokens,
  type ThroughputMetric,
} from "./throughput-tracker";

/**
 * Builds a tracker with a manually-advanced clock so durations are
 * deterministic. Call `clock.set(ms)` before feeding an event.
 */
function makeTracker() {
  let nowMs = 0;
  const tracker = new ThroughputTracker(() => nowMs);
  return {
    tracker,
    at(ms: number) {
      nowMs = ms;
      return tracker;
    },
    metric(): ThroughputMetric {
      return tracker.getMetric();
    },
  };
}

const text = (n: number) => "a".repeat(n);

describe("estimateOutputTokens", () => {
  it("uses the ~4 chars/token heuristic with a floor of 1", () => {
    expect(estimateOutputTokens("")).toBe(0);
    expect(estimateOutputTokens("   ")).toBe(0);
    expect(estimateOutputTokens("a")).toBe(1);
    expect(estimateOutputTokens(text(40))).toBe(10);
  });
});

describe("ThroughputTracker: live estimate", () => {
  it("estimates output tokens live from visible text deltas", () => {
    const h = makeTracker();

    // First delta: lazily starts the run. Duration is 0 so no rate yet.
    h.at(1000).processEvent("step_delta", {
      type: "step_delta",
      text: text(40),
    });
    let m = h.metric();
    expect(m.status).toBe("running");
    expect(m.outputTokens).toBe(10);
    expect(m.source).toBe("estimate");
    expect(m.tokensPerSecond).toBeUndefined();

    // Second delta 1s later via a different visible event type.
    h.at(2000).processEvent("chunk", { type: "chunk", text: text(40) });
    m = h.metric();
    expect(m.outputTokens).toBe(20);
    expect(m.durationMs).toBe(1000);
    expect(m.source).toBe("estimate");
    expect(m.tokensPerSecond).toBeCloseTo(20);
  });

  it("counts agent_turn_delta text deltas as visible output", () => {
    const h = makeTracker();
    h.at(0).processEvent("agent_turn_delta", {
      type: "agent_turn_delta",
      contentType: "text",
      text: text(40),
    });
    h.at(1000).processEvent("agent_turn_delta", {
      type: "agent_turn_delta",
      contentType: "text",
      text: text(40),
    });
    const m = h.metric();
    expect(m.status).toBe("running");
    expect(m.outputTokens).toBe(20);
    expect(m.tokensPerSecond).toBeCloseTo(20);
  });

  it("ignores agent_turn_delta with a missing contentType (matches client)", () => {
    const h = makeTracker();
    // The client only renders agent text when contentType === "text"; a delta
    // without a contentType is not visible output, so it must not be counted.
    h.at(0).processEvent("agent_turn_delta", {
      type: "agent_turn_delta",
      text: text(400),
    });
    expect(h.metric().status).toBe("idle");

    // An explicit text delta is still counted.
    h.at(1000).processEvent("agent_turn_delta", {
      type: "agent_turn_delta",
      contentType: "text",
      text: text(40),
    });
    expect(h.metric().outputTokens).toBe(10);
  });
});

describe("ThroughputTracker: exact usage finalization", () => {
  it("prefers exact output tokens from the terminal event over the estimate", () => {
    const h = makeTracker();
    h.at(1000).processEvent("step_delta", { type: "step_delta", text: text(40) });
    h.at(2000).processEvent("agent_turn_delta", {
      type: "agent_turn_delta",
      contentType: "text",
      text: text(40),
    });

    // estimate so far would be 20 tokens; terminal usage overrides it.
    h.at(2000).processEvent("flow_complete", {
      type: "flow_complete",
      usage: { outputTokens: 123 },
    });

    const m = h.metric();
    expect(m.status).toBe("complete");
    expect(m.outputTokens).toBe(123);
    expect(m.source).toBe("usage");
    expect(m.durationMs).toBe(1000); // streamed window 1000ms
    expect(m.tokensPerSecond).toBeCloseTo(123);
  });

  it("accumulates exact usage from intermediate completes and uses it on terminal", () => {
    const h = makeTracker();
    h.at(1000).processEvent("step_delta", { type: "step_delta", text: text(40) });
    h.at(1500).processEvent("step_complete", {
      type: "step_complete",
      result: { tokens: { output: 50 } },
    });
    h.at(2000).processEvent("agent_turn_complete", {
      type: "agent_turn_complete",
      usage: { outputTokens: 30 },
    });

    // Terminal carries no usage of its own → fall back to accumulated 80.
    h.at(2000).processEvent("agent_complete", { type: "agent_complete" });

    const m = h.metric();
    expect(m.status).toBe("complete");
    expect(m.outputTokens).toBe(80);
    expect(m.source).toBe("usage");
  });

  it("falls back to provider execution time when the streamed window is too short", () => {
    const h = makeTracker();
    h.at(1000).processEvent("flow_start", { type: "flow_start" });
    h.at(1100).processEvent("step_delta", { type: "step_delta", text: text(40) });
    // streamed window = 50ms (< 250ms threshold) → use executionTime.
    h.at(1150).processEvent("flow_complete", {
      type: "flow_complete",
      executionTime: 5000,
    });

    const m = h.metric();
    expect(m.status).toBe("complete");
    expect(m.outputTokens).toBe(10);
    expect(m.durationMs).toBe(5000);
    expect(m.tokensPerSecond).toBeCloseTo(2);
  });
});

describe("ThroughputTracker: non-visible deltas ignored", () => {
  it("ignores agent thinking and tool_input deltas", () => {
    const h = makeTracker();

    h.at(1000).processEvent("agent_turn_delta", {
      type: "agent_turn_delta",
      contentType: "thinking",
      text: text(400),
    });
    expect(h.metric().status).toBe("idle");

    h.at(1000).processEvent("agent_turn_delta", {
      type: "agent_turn_delta",
      contentType: "tool_input",
      text: text(400),
    });
    expect(h.metric().status).toBe("idle");

    // Only the visible text delta is counted.
    h.at(1000).processEvent("agent_turn_delta", {
      type: "agent_turn_delta",
      contentType: "text",
      text: text(40),
    });
    h.at(2000).processEvent("agent_turn_delta", {
      type: "agent_turn_delta",
      contentType: "thinking",
      text: text(400),
    });

    const m = h.metric();
    expect(m.status).toBe("running");
    expect(m.outputTokens).toBe(10); // thinking text excluded
  });

  it("ignores tool and context step deltas", () => {
    const h = makeTracker();

    h.at(1000).processEvent("step_delta", {
      type: "step_delta",
      stepType: "tool",
      text: text(400),
    });
    expect(h.metric().status).toBe("idle");

    h.at(1000).processEvent("step_delta", {
      type: "step_delta",
      executionType: "context",
      text: text(400),
    });
    expect(h.metric().status).toBe("idle");

    // A prompt-step delta is counted.
    h.at(1000).processEvent("step_delta", {
      type: "step_delta",
      stepType: "prompt",
      text: text(40),
    });
    expect(h.metric().status).toBe("running");
    expect(h.metric().outputTokens).toBe(10);
  });
});

describe("ThroughputTracker: intermediate completes do not finalize", () => {
  it("keeps the run running across step_complete / agent_turn_complete", () => {
    const h = makeTracker();
    h.at(1000).processEvent("step_delta", { type: "step_delta", text: text(40) });

    h.at(1500).processEvent("step_complete", {
      type: "step_complete",
      result: { tokens: { output: 10 } },
    });
    expect(h.metric().status).toBe("running");

    h.at(1800).processEvent("agent_turn_complete", {
      type: "agent_turn_complete",
      usage: { outputTokens: 5 },
    });
    expect(h.metric().status).toBe("running");

    h.at(2000).processEvent("flow_complete", { type: "flow_complete" });
    expect(h.metric().status).toBe("complete");
  });
});

describe("ThroughputTracker: error handling", () => {
  it.each(["step_error", "flow_error", "agent_error", "error"])(
    "marks the metric unavailable on %s",
    (errorType: string) => {
      const h = makeTracker();
      h.at(1000).processEvent("step_delta", {
        type: "step_delta",
        text: text(40),
      });
      expect(h.metric().status).toBe("running");

      h.at(1500).processEvent(errorType, { type: errorType });
      expect(h.metric().status).toBe("error");
      expect(h.metric().tokensPerSecond).toBeUndefined();
    }
  );

  it("treats a bare non-object error payload as an error", () => {
    const h = makeTracker();
    h.at(1000).processEvent("step_delta", { type: "step_delta", text: text(40) });
    h.at(1500).processEvent("error", "boom");
    expect(h.metric().status).toBe("error");
  });

  it("ignores terminal/error events when no run is active", () => {
    const h = makeTracker();
    h.at(1000).processEvent("flow_complete", { type: "flow_complete" });
    expect(h.metric().status).toBe("idle");
    h.at(1000).processEvent("flow_error", { type: "flow_error" });
    expect(h.metric().status).toBe("idle");
  });
});

describe("ThroughputTracker: reset & re-run", () => {
  it("reset() returns to idle", () => {
    const h = makeTracker();
    h.at(1000).processEvent("step_delta", { type: "step_delta", text: text(40) });
    h.tracker.reset();
    expect(h.metric()).toEqual({ status: "idle" });
  });

  it("starts a fresh run after a completed one", () => {
    const h = makeTracker();
    h.at(1000).processEvent("step_delta", { type: "step_delta", text: text(80) });
    h.at(2000).processEvent("flow_complete", { type: "flow_complete" });
    expect(h.metric().status).toBe("complete");

    // New stream → accumulation resets, does not carry the prior 20 tokens.
    h.at(3000).processEvent("step_delta", { type: "step_delta", text: text(40) });
    const m = h.metric();
    expect(m.status).toBe("running");
    expect(m.outputTokens).toBe(10);
  });

  it("resets a stale run on the next request's start event (no bleed)", () => {
    const h = makeTracker();
    // First request streams visible output but never terminates (e.g. the
    // user cancels mid-stream: no flow_complete / error frame is emitted).
    h.at(1000).processEvent("step_delta", { type: "step_delta", text: text(120) });
    expect(h.metric().outputTokens).toBe(30);
    expect(h.metric().status).toBe("running");

    // Next request begins. Its flow_start must discard the stale run so the
    // prior request's 30 tokens don't bleed into this one.
    h.at(5000).processEvent("flow_start", { type: "flow_start" });
    h.at(5200).processEvent("step_delta", { type: "step_delta", text: text(40) });
    const m = h.metric();
    expect(m.status).toBe("running");
    expect(m.outputTokens).toBe(10); // only the new request's text
  });

  it("does not reset between per-step starts within one request", () => {
    const h = makeTracker();
    h.at(1000).processEvent("flow_start", { type: "flow_start" });
    h.at(1100).processEvent("step_start", { type: "step_start" });
    h.at(1200).processEvent("step_delta", { type: "step_delta", text: text(40) });
    // A second step within the same request must not restart accumulation.
    h.at(1300).processEvent("step_start", { type: "step_start" });
    h.at(1400).processEvent("step_delta", { type: "step_delta", text: text(40) });
    expect(h.metric().outputTokens).toBe(20);
  });
});

describe("ThroughputTracker: exact usage never drops mid-run", () => {
  it("keeps exact tokens as a floor when later steps stream more text", () => {
    const h = makeTracker();
    h.at(1000).processEvent("step_delta", { type: "step_delta", text: text(40) });

    // Step 1 reports exact usage; the running total switches to it.
    h.at(1500).processEvent("step_complete", {
      type: "step_complete",
      result: { tokens: { output: 50 } },
    });
    let m = h.metric();
    expect(m.outputTokens).toBe(50);
    expect(m.source).toBe("usage");

    // Step 2 streams more visible text: the total must grow from 50, not
    // collapse back to a bare 10-token estimate of the new text.
    h.at(2000).processEvent("step_delta", { type: "step_delta", text: text(40) });
    m = h.metric();
    expect(m.outputTokens).toBe(60); // 50 exact + 10 estimated
    expect(m.source).toBe("usage");
  });
});

describe("ThroughputTracker: live rate decays while paused", () => {
  it("recomputes duration/tok-s from the clock between events", () => {
    const h = makeTracker();
    h.at(1000).processEvent("step_delta", { type: "step_delta", text: text(400) });
    // 100 tokens over a 1s window read at t=2000 → ~100 tok/s.
    h.at(2000);
    expect(h.metric().tokensPerSecond).toBeCloseTo(100);
    // Same tokens, but the model has paused: reading at t=5000 (4s window)
    // must decay the displayed rate even though no new event arrived.
    h.at(5000);
    expect(h.metric().tokensPerSecond).toBeCloseTo(25);
  });
});
