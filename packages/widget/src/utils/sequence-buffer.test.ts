import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SequenceReorderBuffer } from "./sequence-buffer";

describe("SequenceReorderBuffer", () => {
  let emitted: Array<{ payloadType: string; payload: any }>;
  let emitter: (payloadType: string, payload: any) => void;

  beforeEach(() => {
    vi.useFakeTimers();
    emitted = [];
    emitter = (payloadType, payload) => {
      emitted.push({ payloadType, payload });
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes in-order events through immediately", () => {
    const buf = new SequenceReorderBuffer(emitter);
    buf.push("step_delta", { seq: 1, text: "a" });
    buf.push("step_delta", { seq: 2, text: "b" });
    buf.push("step_delta", { seq: 3, text: "c" });

    expect(emitted).toHaveLength(3);
    expect(emitted[0].payload.text).toBe("a");
    expect(emitted[1].payload.text).toBe("b");
    expect(emitted[2].payload.text).toBe("c");
    buf.destroy();
  });

  it("reorders leading out-of-order events (3, 1, 2 → 1, 2, 3)", () => {
    const buf = new SequenceReorderBuffer(emitter);
    // seq=3 arrives first — should be buffered (3 > nextExpected=1)
    buf.push("step_delta", { seq: 3, text: "c" });
    expect(emitted).toHaveLength(0);

    // seq=1 arrives — matches nextExpected, emits, then drains seq=2 (not present), stops
    buf.push("step_delta", { seq: 1, text: "a" });
    expect(emitted).toHaveLength(1);
    expect(emitted[0].payload.text).toBe("a");

    // seq=2 arrives — matches nextExpected=2, emits, drains seq=3 from buffer
    buf.push("step_delta", { seq: 2, text: "b" });
    expect(emitted).toHaveLength(3);
    expect(emitted[1].payload.text).toBe("b");
    expect(emitted[2].payload.text).toBe("c");
    buf.destroy();
  });

  it("reorders mid-stream out-of-order events", () => {
    const buf = new SequenceReorderBuffer(emitter);
    buf.push("step_delta", { seq: 1, text: "a" });
    buf.push("step_delta", { seq: 3, text: "c" }); // buffered
    buf.push("step_delta", { seq: 2, text: "b" }); // emits, drains 3

    expect(emitted).toHaveLength(3);
    expect(emitted[0].payload.text).toBe("a");
    expect(emitted[1].payload.text).toBe("b");
    expect(emitted[2].payload.text).toBe("c");
    buf.destroy();
  });

  it("flushes buffered events after gap timeout when a seq is missing", () => {
    const buf = new SequenceReorderBuffer(emitter, 50);
    buf.push("step_delta", { seq: 1, text: "a" }); // emits
    buf.push("step_delta", { seq: 3, text: "c" }); // buffered (waiting for seq 2)

    expect(emitted).toHaveLength(1);

    // Advance past gap timeout — seq=2 never arrives, flush seq=3 anyway
    vi.advanceTimersByTime(60);

    expect(emitted).toHaveLength(2);
    expect(emitted[1].payload.text).toBe("c");
    buf.destroy();
  });

  it("passes no-seq events through immediately (backward compat)", () => {
    const buf = new SequenceReorderBuffer(emitter);
    buf.push("flow_start", { flowId: "abc" });
    buf.push("step_start", { name: "test" });

    expect(emitted).toHaveLength(2);
    expect(emitted[0].payload.flowId).toBe("abc");
    expect(emitted[1].payload.name).toBe("test");
    buf.destroy();
  });

  it("emits late/duplicate events (seq < nextExpected)", () => {
    const buf = new SequenceReorderBuffer(emitter);
    // Process seq 1-3 normally to advance nextExpected to 4
    buf.push("step_delta", { seq: 1, text: "a" });
    buf.push("step_delta", { seq: 2, text: "b" });
    buf.push("step_delta", { seq: 3, text: "c" });
    expect(emitted).toHaveLength(3);

    // Now seq=1 arrives again — it's a duplicate (1 < nextExpected=4), still emitted
    buf.push("step_delta", { seq: 1, text: "a-dup" });
    expect(emitted).toHaveLength(4);
    expect(emitted[3].payload.text).toBe("a-dup");
    buf.destroy();
  });

  it("reset() clears state and re-initializes nextExpectedSeq", () => {
    const buf = new SequenceReorderBuffer(emitter);
    buf.push("step_delta", { seq: 1, text: "a" });
    buf.push("step_delta", { seq: 3, text: "c" }); // buffered

    expect(emitted).toHaveLength(1);

    buf.reset();

    // After reset, nextExpectedSeq is null, so next push re-initializes to 1.
    // seq=1 matches, emits immediately.
    buf.push("step_delta", { seq: 1, text: "x" });
    expect(emitted).toHaveLength(2);
    expect(emitted[1].payload.text).toBe("x");

    // Buffered seq=3 from before reset should NOT flush
    vi.advanceTimersByTime(100);
    expect(emitted).toHaveLength(2);
    buf.destroy();
  });

  it("handles mixed seq and no-seq events", () => {
    const buf = new SequenceReorderBuffer(emitter);
    buf.push("step_delta", { seq: 1, text: "a" });
    buf.push("status", { status: "streaming" }); // no seq
    buf.push("step_delta", { seq: 2, text: "b" });
    buf.push("error", { error: "oops" }); // no seq

    expect(emitted).toHaveLength(4);
    expect(emitted[0].payload.text).toBe("a");
    expect(emitted[1].payload.status).toBe("streaming");
    expect(emitted[2].payload.text).toBe("b");
    expect(emitted[3].payload.error).toBe("oops");
    buf.destroy();
  });

  it("handles large burst of out-of-order events correctly", () => {
    const buf = new SequenceReorderBuffer(emitter);
    // Send events in reverse order: 10, 9, 8, ..., 1
    // All are buffered until seq=1 arrives (last), then everything drains
    const seqs = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    for (const seq of seqs) {
      buf.push("step_delta", { seq, text: `chunk-${seq}` });
    }

    expect(emitted).toHaveLength(10);
    const emittedTexts = emitted.map(e => e.payload.text);
    expect(emittedTexts).toEqual([
      "chunk-1", "chunk-2", "chunk-3", "chunk-4", "chunk-5",
      "chunk-6", "chunk-7", "chunk-8", "chunk-9", "chunk-10"
    ]);
    buf.destroy();
  });

  it("handles scrambled arrival order", () => {
    const buf = new SequenceReorderBuffer(emitter);
    const scrambled = [1, 5, 3, 2, 4, 8, 6, 7, 10, 9];
    for (const seq of scrambled) {
      buf.push("step_delta", { seq, text: `chunk-${seq}` });
    }

    expect(emitted).toHaveLength(10);
    const emittedTexts = emitted.map(e => e.payload.text);
    expect(emittedTexts).toEqual([
      "chunk-1", "chunk-2", "chunk-3", "chunk-4", "chunk-5",
      "chunk-6", "chunk-7", "chunk-8", "chunk-9", "chunk-10"
    ]);
    buf.destroy();
  });

  it("no-seq event flushes pending buffer and does not leak timer", () => {
    const buf = new SequenceReorderBuffer(emitter, 50);
    buf.push("step_delta", { seq: 1, text: "a" });
    buf.push("step_delta", { seq: 3, text: "c" }); // buffered, starts gap timer
    expect(emitted).toHaveLength(1);

    // A no-seq event triggers flushAll, which cancels the gap timer
    buf.push("flow_complete", { flowId: "done" });
    expect(emitted).toHaveLength(3); // a, c, flow_complete

    // Reset to simulate a new flow
    buf.reset();

    // Push new events — seq=1 emits immediately, seq=3 is buffered
    buf.push("step_delta", { seq: 1, text: "j" });
    buf.push("step_delta", { seq: 3, text: "l" }); // buffered, starts new timer

    // Advance 50ms — only the new timer should fire (old was cancelled)
    vi.advanceTimersByTime(50);
    expect(emitted).toHaveLength(5); // a, c, flow_complete, j, l
    expect(emitted[3].payload.text).toBe("j");
    expect(emitted[4].payload.text).toBe("l");
    buf.destroy();
  });

  it("supports sequenceIndex as an alternative to seq", () => {
    const buf = new SequenceReorderBuffer(emitter);
    buf.push("reason_delta", { sequenceIndex: 1, text: "a" });
    buf.push("reason_delta", { sequenceIndex: 3, text: "c" });
    buf.push("reason_delta", { sequenceIndex: 2, text: "b" });

    expect(emitted).toHaveLength(3);
    expect(emitted[0].payload.text).toBe("a");
    expect(emitted[1].payload.text).toBe("b");
    expect(emitted[2].payload.text).toBe("c");
    buf.destroy();
  });

  it("leading gap flushes via timeout when seq=1 never arrives", () => {
    const buf = new SequenceReorderBuffer(emitter, 50);
    // Only seq=2 and seq=3 arrive — seq=1 is missing
    buf.push("step_delta", { seq: 2, text: "b" });
    buf.push("step_delta", { seq: 3, text: "c" });
    expect(emitted).toHaveLength(0); // both buffered

    vi.advanceTimersByTime(50);
    // Gap timer flushes in seq order
    expect(emitted).toHaveLength(2);
    expect(emitted[0].payload.text).toBe("b");
    expect(emitted[1].payload.text).toBe("c");
    buf.destroy();
  });
});
