import type { AgentWidgetMessage, InjectMessageOptions } from "../types";

/** The session surface the keyed reconciler drives. */
export interface KeyedVoiceTranscriptHost {
  find(id: string): AgentWidgetMessage | undefined;
  inject(options: InjectMessageOptions): AgentWidgetMessage;
  upsert(message: AgentWidgetMessage): void;
  /** Clear `streaming` / `voiceProcessing` on these messages in one update. */
  settle(ids: Set<string>): void;
  setStreaming(streaming: boolean): void;
  /** The provider already played this reply's audio: browser TTS must skip it. */
  markSpoken(id: string): void;
}

/** Bubbles owned by one provider turnId. */
type KeyedTurn = {
  userId?: string;
  assistantId?: string;
  userFinal?: boolean;
  assistantFinal?: boolean;
};

/**
 * Reconciles turn-keyed voice transcripts (full-duplex providers such as
 * GPT-Live) into chat bubbles: each `(turnId, role)` owns one bubble that later
 * frames replace in place, so overlapping turns stay separate and may arrive in
 * any order. No empty assistant placeholder is injected; the session's
 * `streaming` flag drives the standalone typing indicator instead.
 *
 * Ships in the lazy voice-runtime chunk: only sessions with a voice provider
 * ever construct one.
 */
export class KeyedVoiceTranscript {
  private turns = new Map<string, KeyedTurn>();
  private latestId: string | null = null;
  private cancelled = new Set<string>();
  // A cancel that hit a turn still waiting for its reply also drops replies
  // keyed under a new turnId, until the next user turn starts.
  private suppressNewReplies = false;

  constructor(private host: KeyedVoiceTranscriptHost) {}

  apply(role: "user" | "assistant", text: string, isFinal: boolean, turnId: string): void {
    const host = this.host;
    let turn = this.turns.get(turnId);
    if (!turn) {
      if (role === "user") this.suppressNewReplies = false;
      else if (this.suppressNewReplies) this.cancelled.add(turnId);
      turn = {};
      this.turns.set(turnId, turn);
      this.latestId = turnId;
    }

    if (role === "user") {
      turn.userFinal = isFinal;
      const existing = turn.userId ? host.find(turn.userId) : undefined;
      if (existing) {
        host.upsert({ ...existing, content: text, voiceProcessing: !isFinal });
      } else {
        // A user transcript that lands after its own turn's reply started still
        // renders above that reply: borrow the reply's timestamp, sort just ahead.
        const reply = turn.assistantId ? host.find(turn.assistantId) : undefined;
        turn.userId = host.inject({
          role: "user",
          content: text,
          streaming: false,
          voiceProcessing: !isFinal,
          ...(reply && { createdAt: reply.createdAt, sequence: (reply.sequence ?? 0) - 0.5 }),
        }).id;
      }
    } else if (!this.cancelled.has(turnId)) {
      turn.assistantFinal = isFinal;
      const existing = turn.assistantId ? host.find(turn.assistantId) : undefined;
      if (existing) {
        host.upsert({ ...existing, content: text, streaming: !isFinal, voiceProcessing: !isFinal });
      } else if (text.trim()) {
        turn.assistantId = host.inject({
          role: "assistant",
          content: text,
          streaming: !isFinal,
          voiceProcessing: !isFinal,
        }).id;
      }
      if (isFinal && turn.assistantId) host.markSpoken(turn.assistantId);
    }
    this.sync();
  }

  /** Explicit stop: drop the rest of every in-flight reply, else the awaited one. */
  cancel(): void {
    let targets = this.inFlight();
    if (targets.length === 0) {
      const awaiting = this.awaiting();
      if (!awaiting) return;
      targets = [awaiting];
      this.suppressNewReplies = true;
    }
    for (const id of targets) this.cancelled.add(id);
    this.closeReplies(targets);
    this.sync();
  }

  /**
   * Voice error: close every in-flight reply as-is and show the error text (as
   * the awaited turn's reply, when one is waiting), so `streaming` clears.
   */
  fail(errorText: string): void {
    const awaitingId = this.awaiting();
    const inFlight = this.inFlight();
    if (!awaitingId && inFlight.length === 0) return;
    for (const id of inFlight) this.turns.get(id)!.assistantFinal = true;
    this.closeReplies(inFlight);
    const msg = this.host.inject({
      role: "assistant",
      content: errorText,
      streaming: false,
      voiceProcessing: false,
    });
    const awaiting = awaitingId ? this.turns.get(awaitingId) : undefined;
    if (awaiting) {
      awaiting.assistantId = msg.id;
      awaiting.assistantFinal = true;
    }
    this.sync();
  }

  /** Call ended: freeze every keyed bubble as-is and forget the turns. */
  settle(): void {
    if (this.turns.size === 0) return;
    const wasPending = this.pending();
    const ids = new Set<string>();
    for (const turn of this.turns.values()) {
      if (turn.userId) ids.add(turn.userId);
      if (turn.assistantId) {
        ids.add(turn.assistantId);
        this.host.markSpoken(turn.assistantId);
      }
    }
    this.turns.clear();
    this.latestId = null;
    this.suppressNewReplies = false;
    this.host.settle(ids);
    if (wasPending) this.host.setStreaming(false);
  }

  private closeReplies(turnIds: string[]): void {
    const ids = new Set<string>();
    for (const id of turnIds) {
      const assistantId = this.turns.get(id)?.assistantId;
      if (assistantId) {
        ids.add(assistantId);
        this.host.markSpoken(assistantId);
      }
    }
    if (ids.size > 0) this.host.settle(ids);
  }

  /** Turns whose assistant bubble is visible but not yet final. */
  private inFlight(): string[] {
    const ids: string[] = [];
    for (const [id, turn] of this.turns) {
      if (turn.assistantId && !turn.assistantFinal && !this.cancelled.has(id)) ids.push(id);
    }
    return ids;
  }

  /** The newest turn has a final user utterance and no reply text yet. */
  private awaiting(): string | null {
    const id = this.latestId;
    if (!id) return null;
    const turn = this.turns.get(id);
    return turn?.userFinal && !turn.assistantId && !this.cancelled.has(id) ? id : null;
  }

  private pending(): boolean {
    return this.awaiting() !== null || this.inFlight().length > 0;
  }

  private sync(): void {
    this.host.setStreaming(this.pending());
  }
}
