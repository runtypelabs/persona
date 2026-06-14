// Read-Aloud Controller
//
// Engine-agnostic orchestrator for the per-message "Read aloud" action and the
// auto-speak path. Owns the three things the UI shouldn't: which message is
// currently active, its playback state, and the single speech engine instance.
//
// The button drives a single `toggle(id, request)`; listeners are notified on
// every state change so the UI can reflect play / pause / resume. The engine is
// resolved lazily (on first playback, inside the user gesture) via the
// `resolveEngine` factory, so swapping the browser engine for a hosted one
// (Runtype or custom) is a config change — this class is unchanged.

import type { ReadAloudState, SpeechEngine, SpeechRequest } from "../types";

export type ReadAloudListener = (
  activeId: string | null,
  state: ReadAloudState
) => void;

export class ReadAloudController {
  private engine: SpeechEngine | null = null;
  private activeId: string | null = null;
  private state: ReadAloudState = "idle";
  private listeners = new Set<ReadAloudListener>();
  // Bumped on every play/stop so a late async engine creation or a stale
  // utterance callback from a superseded request can't mutate current state.
  private generation = 0;

  constructor(
    private resolveEngine: () => SpeechEngine | Promise<SpeechEngine> | null
  ) {}

  /** Whether the active engine supports pause/resume (vs. stop-only). */
  get supportsPause(): boolean {
    return this.engine?.supportsPause ?? true;
  }

  /** Playback state for a message id (`idle` unless it's the active message). */
  stateFor(id: string): ReadAloudState {
    return this.activeId === id ? this.state : "idle";
  }

  /** The message currently being read aloud, if any. */
  activeMessageId(): string | null {
    return this.activeId;
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  onChange(listener: ReadAloudListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Primary entry point for the button: cycle this message through
   * play → pause → resume (or play → stop when the engine can't pause), and
   * start fresh when a different message is requested.
   */
  toggle(id: string, request: SpeechRequest): void {
    if (this.activeId === id) {
      if (this.state === "playing") {
        if (this.engine?.supportsPause) {
          this.engine.pause();
          this.set(id, "paused");
        } else {
          this.stop();
        }
        return;
      }
      if (this.state === "paused") {
        this.engine?.resume();
        this.set(id, "playing");
        return;
      }
      if (this.state === "loading") {
        this.stop();
        return;
      }
    }
    void this.play(id, request);
  }

  /** Start (or restart) playback for a message, stopping any current playback. */
  async play(id: string, request: SpeechRequest): Promise<void> {
    const generation = ++this.generation;
    this.engine?.stop();
    this.set(id, "loading");

    try {
      if (!this.engine) {
        const resolved = await this.resolveEngine();
        if (generation !== this.generation) return; // superseded mid-resolve
        if (!resolved) {
          this.set(null, "idle");
          return;
        }
        this.engine = resolved;
      }

      this.engine.speak(request, {
        onStart: () => {
          if (generation === this.generation) this.set(id, "playing");
        },
        onEnd: () => {
          if (generation === this.generation) this.set(null, "idle");
        },
        onError: () => {
          if (generation === this.generation) this.set(null, "idle");
        },
      });
    } catch {
      if (generation === this.generation) this.set(null, "idle");
    }
  }

  /** Stop playback and return to idle. */
  stop(): void {
    this.generation++;
    this.engine?.stop();
    this.set(null, "idle");
  }

  /** Drop the controller and its engine (called on widget teardown). */
  destroy(): void {
    this.stop();
    this.engine?.destroy?.();
    this.engine = null;
    this.listeners.clear();
  }

  private set(id: string | null, state: ReadAloudState): void {
    this.activeId = state === "idle" ? null : id;
    this.state = state;
    for (const listener of this.listeners) listener(this.activeId, this.state);
  }
}
