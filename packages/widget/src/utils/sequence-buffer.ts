type BufferedEvent = { payloadType: string; payload: any; seq: number };

export class SequenceReorderBuffer {
  private nextExpectedSeq: number | null = null;
  private buffer: Map<number, BufferedEvent> = new Map();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private emitter: (payloadType: string, payload: any) => void;
  private gapTimeoutMs: number;

  constructor(emitter: (payloadType: string, payload: any) => void, gapTimeoutMs = 50) {
    this.emitter = emitter;
    this.gapTimeoutMs = gapTimeoutMs;
  }

  push(payloadType: string, payload: any): void {
    // All three fields are sourced from the same FlowExecutionEngine.sequenceCounter:
    //   - `seq`: step_delta, text_start, text_end, agent_* events (top-level)
    //   - `sequenceIndex`: reason_start, reason_delta, reason_complete, source
    //   - `agentContext.seq`: tool_start, tool_delta, tool_complete (agent loop)
    const seq = payload?.seq ?? payload?.sequenceIndex ?? payload?.agentContext?.seq;

    // No seq field — emit immediately (backward compat).
    // If there are buffered events waiting for a gap to fill, flush them
    // first: the server sending an unsequenced event means it has moved on
    // and the missing seq numbers are not coming.
    if (seq === undefined || seq === null) {
      if (this.buffer.size > 0) {
        this.flushAll();
      }
      this.emitter(payloadType, payload);
      return;
    }

    // Server's sequenceCounter resets to 0 on each execution and pre-increments,
    // so the first sequenced event in any stream is expected to have seq=1.
    // If a server ever starts at a different number (e.g. a resumed stream),
    // the 50ms gap timer below is the safety net: the first event gets
    // buffered, then flushed after the gap elapses. Correctness is preserved;
    // the only cost is a one-time latency on the leading event.
    if (this.nextExpectedSeq === null) {
      this.nextExpectedSeq = 1;
    }

    // If this is the expected event, emit it and drain consecutive buffered events
    if (seq === this.nextExpectedSeq) {
      this.emitter(payloadType, payload);
      this.nextExpectedSeq = (seq as number) + 1;
      this.drainConsecutive();
      return;
    }

    // If seq < nextExpected, it's a duplicate or late arrival — emit anyway (don't drop)
    if (seq < this.nextExpectedSeq!) {
      this.emitter(payloadType, payload);
      return;
    }

    // seq > nextExpected — buffer it and start gap timer.
    // If another event with the same seq is already buffered, the server
    // broke its "seq is unique per stream" invariant. Rather than silently
    // overwrite (losing one event) or swallow the new one, emit the prior
    // event immediately — out of order, but better than dropping it — and
    // warn so the issue is visible.
    const existing = this.buffer.get(seq);
    if (existing !== undefined) {
      if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn(
          `[persona] SequenceReorderBuffer: duplicate seq=${seq} ` +
            `(${existing.payloadType} vs ${payloadType}); ` +
            `emitting earlier event out-of-order to avoid loss`
        );
      }
      this.emitter(existing.payloadType, existing.payload);
    }
    this.buffer.set(seq, { payloadType, payload, seq });
    this.startGapTimer();
  }

  private drainConsecutive(): void {
    while (this.buffer.has(this.nextExpectedSeq!)) {
      const event = this.buffer.get(this.nextExpectedSeq!)!;
      this.buffer.delete(this.nextExpectedSeq!);
      this.emitter(event.payloadType, event.payload);
      this.nextExpectedSeq!++;
    }
    // If buffer is empty, clear the gap timer
    if (this.buffer.size === 0) {
      this.clearGapTimer();
    }
  }

  private startGapTimer(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushAll();
    }, this.gapTimeoutMs);
  }

  private clearGapTimer(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private flushAll(): void {
    this.clearGapTimer();
    if (this.buffer.size === 0) return;

    // Flush all buffered events in seq order
    const sorted = [...this.buffer.entries()].sort((a, b) => a[0] - b[0]);
    for (const [seq, event] of sorted) {
      this.buffer.delete(seq);
      this.emitter(event.payloadType, event.payload);
    }
    // Update nextExpectedSeq to after the last flushed
    if (sorted.length > 0) {
      this.nextExpectedSeq = sorted[sorted.length - 1][0] + 1;
    }
  }

  reset(): void {
    this.clearGapTimer();
    this.buffer.clear();
    this.nextExpectedSeq = null;
  }

  destroy(): void {
    this.clearGapTimer();
    this.buffer.clear();
  }

  hasPending(): boolean {
    return this.buffer.size > 0;
  }

  flushPending(): void {
    this.flushAll();
  }
}
