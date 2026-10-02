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
  userStartMs?: number;
  assistantStartMs?: number;
  /** Submitted as a chat turn: the chat pipeline renders its reply. */
  claimed?: boolean;
};

/** Loose text match between a transcript and the delegated request text. */
const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Reconciles turn-keyed voice transcripts (full-duplex providers such as
 * GPT-Live) into chat bubbles: each `(turnId, role)` owns one bubble that later
 * frames replace in place, so overlapping turns stay separate and may arrive in
 * any order. No empty assistant placeholder is injected; the session's
 * `streaming` flag drives the standalone typing indicator instead. A new bubble
 * with a `startMs` sorts above any keyed bubble of the call that started later,
 * so a late user transcript still renders above the reply it prompted.
 *
 * Cancelled output is the provider's to drop (until the server acknowledges
 * the cancel): every reply that reaches `apply` after a stop renders, which
 * keeps a later answer (e.g. a delegation result) visible while its audio plays.
 *
 * Ships in the lazy voice-runtime chunk: only sessions with a voice provider
 * ever construct one.
 */
export class KeyedVoiceTranscript {
  private turns = new Map<string, KeyedTurn>();
  private latestId: string | null = null;
  private cancelled = new Set<string>();

  constructor(private host: KeyedVoiceTranscriptHost) {}

  apply(
    role: "user" | "assistant",
    text: string,
    isFinal: boolean,
    turnId: string,
    startMs?: number,
    caption?: boolean,
  ): void {
    const host = this.host;
    // Speech-to-speech transcripts can carry a leading space (" What are…").
    text = text.trim();
    let turn = this.turns.get(turnId);
    if (!turn) {
      turn = {};
      this.turns.set(turnId, turn);
      this.latestId = turnId;
    }

    if (role === "user") {
      turn.userFinal = isFinal;
      const existing = turn.userId ? host.find(turn.userId) : undefined;
      if (existing) {
        const moved = turn.userStartMs === undefined && startMs !== undefined;
        if (moved) turn.userStartMs = startMs;
        host.upsert({
          ...existing,
          content: text,
          voiceProcessing: !isFinal,
          ...(moved && this.placeBefore(this.startedAfter(startMs))),
        });
      } else {
        // A user transcript that lands after its own turn's reply started still
        // renders above that reply: borrow the reply's timestamp, sort just ahead.
        turn.userStartMs = startMs;
        const reply = turn.assistantId ? host.find(turn.assistantId) : undefined;
        turn.userId = host.inject({
          role: "user",
          content: text,
          streaming: false,
          voiceProcessing: !isFinal,
          voiceCaption: caption,
          ...this.placeBefore(this.startedAfter(startMs) ?? reply),
        }).id;
      }
    } else if (!this.cancelled.has(turnId)) {
      turn.assistantFinal = isFinal;
      const existing = turn.assistantId ? host.find(turn.assistantId) : undefined;
      if (existing) {
        // A timestamp that arrives after the bubble did re-positions it.
        const moved = turn.assistantStartMs === undefined && startMs !== undefined;
        if (moved) turn.assistantStartMs = startMs;
        host.upsert({
          ...existing,
          content: text,
          streaming: !isFinal,
          voiceProcessing: !isFinal,
          ...(moved && this.placeBefore(this.startedAfter(startMs))),
        });
      } else if (text) {
        turn.assistantStartMs = startMs;
        turn.assistantId = host.inject({
          role: "assistant",
          content: text,
          streaming: !isFinal,
          voiceProcessing: !isFinal,
          voiceCaption: caption,
          ...this.placeBefore(this.startedAfter(startMs)),
        }).id;
      }
      if (isFinal && turn.assistantId) host.markSpoken(turn.assistantId);
    }
    this.sync();
  }

  /**
   * The user bubble a delegated request came from, claimed so it is submitted
   * once. With `userTurnId` it is that utterance's bubble; one that hasn't been
   * transcribed yet is created now (from `userText`), so its transcript later
   * fills it instead of adding a second bubble. Without an id it is the newest
   * unclaimed bubble whose text matches exactly, else one where either text
   * is a prefix of the other (the request can beat the final transcript).
   * `null` when nothing matches: never someone else's bubble.
   */
  claimUserTurn(userText: string, userTurnId?: string): string | null {
    let pick: KeyedTurn | undefined;
    if (userTurnId) {
      pick = this.turns.get(userTurnId);
      if (!pick) {
        pick = {};
        this.turns.set(userTurnId, pick);
      }
      if (pick.claimed) return null;
      if (!pick.userId || !this.host.find(pick.userId)) {
        pick.userFinal = true;
        pick.userId = this.host.inject({ role: "user", content: userText.trim() }).id;
      }
    } else {
      const want = normalize(userText);
      const open = [...this.turns.values()]
        .reverse()
        .flatMap((turn) => {
          const bubble = turn.userId && !turn.claimed ? this.host.find(turn.userId) : undefined;
          return bubble ? [{ turn, text: normalize(bubble.content) }] : [];
        })
        .filter(({ text }) => text && want);
      pick = (
        open.find(({ text }) => text === want) ??
        open.find(({ text }) => text.startsWith(want) || want.startsWith(text))
      )?.turn;
    }
    if (!pick) return null;
    // No sync: the chat turn about to start owns the streaming flag.
    pick.claimed = true;
    return pick.userId!;
  }

  /** Explicit stop: drop the rest of every in-flight reply, else the awaited one. */
  cancel(): void {
    let targets = this.inFlight();
    if (targets.length === 0) {
      const awaiting = this.awaiting();
      if (!awaiting) return;
      targets = [awaiting];
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
    this.host.settle(ids);
    if (wasPending) this.host.setStreaming(false);
  }

  /** The call's earliest-starting keyed bubble that began after `startMs`. */
  private startedAfter(startMs: number | undefined): AgentWidgetMessage | undefined {
    if (startMs === undefined) return undefined;
    let best: { start: number; id: string } | undefined;
    for (const turn of this.turns.values()) {
      for (const [id, start] of [
        [turn.userId, turn.userStartMs],
        [turn.assistantId, turn.assistantStartMs],
      ] as const) {
        if (id && start !== undefined && start > startMs && (!best || start < best.start)) {
          best = { start, id };
        }
      }
    }
    return best && this.host.find(best.id);
  }

  /** Sort a new bubble just ahead of `next` (messages order by time, then sequence). */
  private placeBefore(next: AgentWidgetMessage | undefined) {
    return next && { createdAt: next.createdAt, sequence: (next.sequence ?? 0) - 0.001 };
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
    return turn?.userFinal && !turn.assistantId && !turn.claimed && !this.cancelled.has(id)
      ? id
      : null;
  }

  private pending(): boolean {
    return this.awaiting() !== null || this.inFlight().length > 0;
  }

  private sync(): void {
    this.host.setStreaming(this.pending());
  }
}
