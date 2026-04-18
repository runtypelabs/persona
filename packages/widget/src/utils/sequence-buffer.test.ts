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

  it("no-seq event flushes pending buffer and cancels the gap timer", () => {
    const buf = new SequenceReorderBuffer(emitter, 50);
    buf.push("step_delta", { seq: 1, text: "a" });
    buf.push("step_delta", { seq: 3, text: "c" }); // buffered, starts gap timer
    expect(emitted).toHaveLength(1);

    // A no-seq event triggers flushAll, which drains the buffer in seq order
    // and cancels the gap timer.
    buf.push("flow_complete", { flowId: "done" });
    expect(emitted).toHaveLength(3); // a, c, flow_complete

    // The gap timer must no longer fire after the flushAll.
    vi.advanceTimersByTime(100);
    expect(emitted).toHaveLength(3);
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

  it("handles a stream whose first seq is > 1 via the gap timeout (no loss)", () => {
    // Defensive: if the server's counter ever starts above 1 (e.g. a resumed
    // stream), the hardcoded nextExpectedSeq=1 would buffer the first event.
    // The gap timer must still flush it so nothing is lost.
    const buf = new SequenceReorderBuffer(emitter, 50);
    buf.push("step_delta", { seq: 5, text: "first" });
    buf.push("step_delta", { seq: 6, text: "second" });
    expect(emitted).toHaveLength(0);

    vi.advanceTimersByTime(50);

    expect(emitted).toHaveLength(2);
    expect(emitted[0].payload.text).toBe("first");
    expect(emitted[1].payload.text).toBe("second");

    // Subsequent in-order events should pass through immediately.
    buf.push("step_delta", { seq: 7, text: "third" });
    expect(emitted).toHaveLength(3);
    expect(emitted[2].payload.text).toBe("third");
    buf.destroy();
  });

  it("warns and emits both events on seq collision (does not silently drop)", () => {
    // Server invariant: seq is unique per stream. If it's ever violated
    // (bug, replay, mixed counters), Map.set would silently overwrite. The
    // buffer must detect this, warn, and emit the prior event so nothing is
    // dropped.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const buf = new SequenceReorderBuffer(emitter, 50);

    buf.push("step_delta", { seq: 1, text: "a" });
    // seq=3 buffered, waiting for seq=2
    buf.push("step_delta", { seq: 3, text: "first-at-3" });
    expect(emitted).toHaveLength(1);

    // Second event with same seq=3 — prior one should be emitted out-of-order
    buf.push("reason_delta", { seq: 3, text: "second-at-3" });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("duplicate seq=3");
    expect(warnSpy.mock.calls[0][0]).toContain("step_delta");
    expect(warnSpy.mock.calls[0][0]).toContain("reason_delta");

    // Prior event flushed immediately (out of seq order), nothing lost
    expect(emitted).toHaveLength(2);
    expect(emitted[1].payload.text).toBe("first-at-3");

    // seq=2 arrives — advances nextExpected through the buffered second-at-3
    buf.push("step_delta", { seq: 2, text: "b" });
    expect(emitted).toHaveLength(4);
    expect(emitted[2].payload.text).toBe("b");
    expect(emitted[3].payload.text).toBe("second-at-3");

    warnSpy.mockRestore();
    buf.destroy();
  });
});
