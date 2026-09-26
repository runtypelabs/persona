/** Correlate provider transcripts across cancellation and overlapping turns. */
export class VoiceTurnTracker {
  private turnId?: string;
  private cancelled = false;

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
}
