/** Correlate provider transcripts across cancellation and overlapping turns. */
export class VoiceTurnTracker {
  private turnId?: string;
  private cancelled = false;
  // Turn-keyed (full-duplex) flows cancel specific turns: their output stays discarded
  // even after newer turns start, unlike the single-turn `cancelled` latch.
  private cancelledTurnIds = new Set<string>();

  start(turnId?: string): void {
    this.turnId = turnId;
    this.cancelled = false;
  }

  cancel(): void {
    this.cancelled = true;
  }

  accepts(turnId?: string): boolean {
    return !this.cancelled && (!turnId || !this.turnId || turnId === this.turnId);
  }

  /** Discard all further output for a specific turn (turn-keyed flows). */
  cancelTurn(turnId: string): void {
    this.cancelledTurnIds.add(turnId);
  }

  isTurnCancelled(turnId: string): boolean {
    return this.cancelledTurnIds.has(turnId);
  }
}
