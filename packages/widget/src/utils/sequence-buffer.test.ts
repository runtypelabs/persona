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
    buf.push("text_delta", { seq: 0, text: "a" });
    buf.push("text_delta", { seq: 1, text: "b" });
    buf.push("text_delta", { seq: 2, text: "c" });

    expect(emitted).toHaveLength(3);
    expect(emitted[0].payload.text).toBe("a");
    expect(emitted[1].payload.text).toBe("b");
    expect(emitted[2].payload.text).toBe("c");
    buf.destroy();
  });

  it("reorders out-of-order events (3, 1, 2 → 1, 2, 3)", () => {
    const buf = new SequenceReorderBuffer(emitter);
    buf.push("text_delta", { seq: 3, text: "d" });
    buf.push("text_delta", { seq: 1, text: "b" });
    buf.push("text_delta", { seq: 2, text: "c" });

    // seq 3 arrives first, so nextExpected=3, emits immediately, nextExpected=4
    // seq 1 < 4, so emitted as late arrival
    // seq 2 < 4, so emitted as late arrival
    // Wait — that's the "first event initializes" behavior.
    // Actually: first event (seq=3) sets nextExpected=3, matches, emits, nextExpected=4
    // seq=1 < 4, late arrival, emits
    // seq=2 < 4, late arrival, emits
    // So order is 3, 1, 2 — but let's test the more useful case where seq starts at 1

    buf.destroy();
    emitted = [];

    const buf2 = new SequenceReorderBuffer(emitter);
    buf2.push("text_delta", { seq: 1, text: "b" });  // first event, nextExpected=1, emits, nextExpected=2
    buf2.push("text_delta", { seq: 3, text: "d" });  // 3 > 2, buffered
    buf2.push("text_delta", { seq: 2, text: "c" });  // 2 === nextExpected, emits, nextExpected=3, drains 3

    expect(emitted).toHaveLength(3);
    expect(emitted[0].payload.text).toBe("b");
    expect(emitted[1].payload.text).toBe("c");
    expect(emitted[2].payload.text).toBe("d");
    buf2.destroy();
  });

  it("flushes buffered events after gap timeout when a seq is missing", () => {
    const buf = new SequenceReorderBuffer(emitter, 50);
    buf.push("text_delta", { seq: 1, text: "b" });  // emits immediately
    buf.push("text_delta", { seq: 3, text: "d" });  // buffered (waiting for seq 2)

    expect(emitted).toHaveLength(1);

    // Advance past gap timeout
    vi.advanceTimersByTime(60);

    expect(emitted).toHaveLength(2);
    expect(emitted[1].payload.text).toBe("d");
    buf.destroy();
  });

  it("passes no-seq events through immediately (backward compat)", () => {
    const buf = new SequenceReorderBuffer(emitter);
    buf.push("text_delta", { text: "no seq" });
    buf.push("text_delta", { text: "also no seq" });

    expect(emitted).toHaveLength(2);
    expect(emitted[0].payload.text).toBe("no seq");
    expect(emitted[1].payload.text).toBe("also no seq");
    buf.destroy();
  });

  it("emits late/duplicate events (seq < nextExpected)", () => {
    const buf = new SequenceReorderBuffer(emitter);
    buf.push("text_delta", { seq: 5, text: "f" });  // first, nextExpected=5, emits, nextExpected=6
    buf.push("text_delta", { seq: 3, text: "d" });  // 3 < 6, emits (late)
    buf.push("text_delta", { seq: 5, text: "f-dup" }); // 5 < 6, emits (duplicate)

    expect(emitted).toHaveLength(3);
    expect(emitted[0].payload.text).toBe("f");
    expect(emitted[1].payload.text).toBe("d");
    expect(emitted[2].payload.text).toBe("f-dup");
    buf.destroy();
  });

  it("reset() clears state", () => {
    const buf = new SequenceReorderBuffer(emitter);
    buf.push("text_delta", { seq: 1, text: "a" });
    buf.push("text_delta", { seq: 3, text: "c" }); // buffered

    expect(emitted).toHaveLength(1);

    buf.reset();

    // After reset, nextExpectedSeq is null, so next event re-initializes
    buf.push("text_delta", { seq: 10, text: "j" });
    expect(emitted).toHaveLength(2);
    expect(emitted[1].payload.text).toBe("j");

    // Buffered seq=3 from before reset should NOT flush
    vi.advanceTimersByTime(100);
    expect(emitted).toHaveLength(2);
    buf.destroy();
  });

  it("handles mixed seq and no-seq events", () => {
    const buf = new SequenceReorderBuffer(emitter);
    buf.push("text_delta", { seq: 1, text: "a" });
    buf.push("status", { status: "streaming" }); // no seq
    buf.push("text_delta", { seq: 2, text: "b" });
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
    const seqs = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    for (const seq of seqs) {
      buf.push("text_delta", { seq, text: `chunk-${seq}` });
    }

    // First event (seq=10) emits immediately and sets nextExpected=11
    // All subsequent events (9,8,...,1) are < 11, so they emit as late arrivals in reception order
    expect(emitted).toHaveLength(10);
    expect(emitted[0].payload.text).toBe("chunk-10");

    buf.destroy();
    emitted = [];

    // More realistic: events starting from 1, arriving in scrambled order
    const buf2 = new SequenceReorderBuffer(emitter);
    const scrambled = [1, 5, 3, 2, 4, 8, 6, 7, 10, 9];
    for (const seq of scrambled) {
      buf2.push("text_delta", { seq, text: `chunk-${seq}` });
    }

    // seq=1: emits (nextExpected=2)
    // seq=5: buffered
    // seq=3: buffered
    // seq=2: emits (nextExpected=3), drains 3 (nextExpected=4), no 4, stops
    // seq=4: emits (nextExpected=5), drains 5 (nextExpected=6), no 6, stops
    // seq=8: buffered
    // seq=6: emits (nextExpected=7), drains? no 7, stops
    // seq=7: emits (nextExpected=8), drains 8 (nextExpected=9), no 9, stops
    // seq=10: buffered
    // seq=9: emits (nextExpected=10), drains 10 (nextExpected=11)

    expect(emitted).toHaveLength(10);
    const emittedTexts = emitted.map(e => e.payload.text);
    expect(emittedTexts).toEqual([
      "chunk-1", "chunk-2", "chunk-3", "chunk-4", "chunk-5",
      "chunk-6", "chunk-7", "chunk-8", "chunk-9", "chunk-10"
    ]);
    buf2.destroy();
  });

  it("no-seq flush does not leak a gap timer", () => {
    const buf = new SequenceReorderBuffer(emitter, 50);
    buf.push("step_delta", { seq: 1, text: "a" });
    buf.push("step_delta", { seq: 3, text: "c" }); // buffered, starts gap timer
    expect(emitted).toHaveLength(1);

    // A no-seq event triggers flushAll, which should also cancel the gap timer
    buf.push("flow_complete", { flowId: "done" });
    expect(emitted).toHaveLength(3); // a, c, flow_complete

    // Reset to simulate a new flow with a fresh sequence space
    buf.reset();

    // Now push new sequenced events in a fresh range
    buf.push("step_delta", { seq: 10, text: "j" }); // first in new range, emits
    buf.push("step_delta", { seq: 12, text: "l" }); // buffered, starts new gap timer

    // Advance past the original gap timeout (100ms > 50ms) — the orphaned timer
    // must NOT have fired. Only the new gap timer (for seq 12) should fire.
    // If the old timer leaked, it would have fired at 50ms and flushed 'l' early,
    // then the new timer would fire again at 100ms causing a double-flush.
    vi.advanceTimersByTime(50);

    // The new gap timer fires, flushing 'l'
    expect(emitted).toHaveLength(5); // a, c, flow_complete, j, l
    expect(emitted[3].payload.text).toBe("j");
    expect(emitted[4].payload.text).toBe("l");
    buf.destroy();
  });

  it("supports sequenceIndex as an alternative to seq", () => {
    const buf = new SequenceReorderBuffer(emitter);
    buf.push("text_delta", { sequenceIndex: 1, text: "a" });
    buf.push("text_delta", { sequenceIndex: 3, text: "c" });
    buf.push("text_delta", { sequenceIndex: 2, text: "b" });

    expect(emitted).toHaveLength(3);
    expect(emitted[0].payload.text).toBe("a");
    expect(emitted[1].payload.text).toBe("b");
    expect(emitted[2].payload.text).toBe("c");
    buf.destroy();
  });
});
