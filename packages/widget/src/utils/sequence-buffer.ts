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

    // Initialize expected seq from first event
    if (this.nextExpectedSeq === null) {
      this.nextExpectedSeq = seq;
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

    // seq > nextExpected — buffer it and start gap timer
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
    this.flushTimer = null;
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
}
