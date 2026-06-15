// Server TTS engine (streaming) — example `SpeechEngine` for Persona's
// per-message "Read aloud" action and auto-speak path.
//
// It POSTs the message text to the demo proxy's `/api/tts` route (which holds
// the OpenAI key server-side) and streams the returned raw PCM (24 kHz / 16-bit
// signed LE / mono) into Persona's `createPcmStreamPlayer` — the jitter-buffered
// AudioWorklet player that also backs the realtime voice provider. The player
// owns prebuffering, gapless scheduling, graceful underrun (a late chunk →
// silence + re-buffer, not a click), and pause/resume. So this engine stays tiny:
// fetch → enqueue chunks → markStreamEnd.
//
// Drop it into a widget with:
//   textToSpeech: { enabled: false, createEngine: () => new ServerTtsEngine({ endpoint }) }
//   messageActions: { showReadAloud: true }
//
// Swap the proxy's upstream fetch (ElevenLabs `pcm_24000`, Azure, Polly, …) and
// nothing here changes — the contract is "stream 24 kHz PCM".

import { createPcmStreamPlayer } from "@runtypelabs/persona/voice-worklet-player";
import type {
  PcmStreamPlayer,
  SpeechCallbacks,
  SpeechEngine,
  SpeechRequest,
} from "@runtypelabs/persona";

export interface ServerTtsEngineOptions {
  /** Proxy route that streams PCM, e.g. `http://localhost:43111/api/tts`. */
  endpoint: string;
  /**
   * Resolve the voice id at speak time (lets a demo dropdown switch voices
   * without rebuilding the widget). Ignored when the widget passes an explicit
   * `request.voice` (from `textToSpeech.voice`).
   */
  getVoice?: () => string | undefined;
  /**
   * Resolve the TTS model at speak time (same live-switch pattern as
   * {@link getVoice}). The proxy defaults to a low-latency model; a slower,
   * higher-quality one trades responsiveness for fidelity.
   */
  getModel?: () => string | undefined;
  /**
   * Optional hook for surfacing fetch/stream failures (e.g. a missing API key
   * or an upstream 4xx) somewhere visible — the widget itself only flips the
   * read-aloud state back to idle, so without this the reason is invisible.
   */
  onError?: (error: Error) => void;
  /**
   * Audio (ms) the player buffers before the first sample and after an underrun.
   * Default 250 — enough for a low-latency, steadily-delivered model (the proxy
   * default), where first sound lands right after time-to-first-byte. A burstier
   * model (e.g. gpt-4o-mini-tts stalls ~700ms mid-start) underruns at 250ms, but
   * the worklet degrades that to a clean silence + re-buffer, not a click; raise
   * this to ~600 to ride such stalls out smoothly. See {@link createPcmStreamPlayer}.
   */
  prebufferMs?: number;
}

/** Streaming `SpeechEngine` backed by a server `/api/tts` route returning PCM. */
export class ServerTtsEngine implements SpeechEngine {
  readonly id = "server-openai";
  // The worklet player pauses/resumes via AudioContext.suspend() — solid, unlike
  // speechSynthesis.pause().
  readonly supportsPause = true;

  private player: PcmStreamPlayer | null = null;
  private playerPromise: Promise<PcmStreamPlayer> | null = null;
  // Bumped on every speak()/stop() so a superseded request's async callbacks and
  // its in-flight stream read loop become no-ops.
  private generation = 0;

  constructor(private readonly opts: ServerTtsEngineOptions) {}

  // Create one worklet player lazily (it's async — addModule), then reuse it
  // across speaks; flush() between replies clears the queue without tearing down
  // the AudioContext.
  private ensurePlayer(): Promise<PcmStreamPlayer> {
    return (this.playerPromise ??= createPcmStreamPlayer({
      prebufferMs: this.opts.prebufferMs ?? 250,
    }).then((player) => (this.player = player)));
  }

  speak(request: SpeechRequest, callbacks: SpeechCallbacks): void {
    const gen = ++this.generation;
    // Run the async fetch/stream without making speak() itself async — the
    // widget surfaces the time until audio starts as the "loading" state.
    void this.run(gen, request, callbacks);
  }

  private async run(
    gen: number,
    request: SpeechRequest,
    callbacks: SpeechCallbacks,
  ): Promise<void> {
    try {
      const player = await this.ensurePlayer();
      if (gen !== this.generation) return; // superseded while the worklet booted
      player.flush(); // drop any prior playback (and its callbacks)
      player.resume(); // clear a prior pause so this reply isn't stuck suspended

      const voice = request.voice ?? this.opts.getVoice?.();
      const model = this.opts.getModel?.();
      // Drive the read-aloud state from the player, not from chunk arrival:
      // onStarted fires when the prebuffer fills and audio is actually audible
      // (loading → playing); onFinished when it drains (→ idle). An empty stream
      // produces no onStarted and an immediate onFinished, so the UI skips
      // straight back to idle without a phantom "playing".
      player.onStarted(() => {
        if (gen === this.generation) callbacks.onStart?.();
      });
      player.onFinished(() => {
        if (gen === this.generation) callbacks.onEnd?.();
      });

      const res = await fetch(this.opts.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: request.text, voice, rate: request.rate, model }),
      });
      if (gen !== this.generation) return; // superseded while awaiting headers
      if (!res.ok || !res.body) throw new Error(await describeError(res));

      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (gen !== this.generation) {
          // A newer speak()/stop() won — stop pulling and release the stream.
          await reader.cancel().catch(() => {});
          return;
        }
        if (done) break;
        if (value && value.byteLength > 0) player.enqueue(value);
      }

      player.markStreamEnd();
    } catch (err) {
      if (gen !== this.generation) return; // error from a superseded request
      const error = err instanceof Error ? err : new Error(String(err));
      this.opts.onError?.(error); // surface the reason (demo log, telemetry, …)
      callbacks.onError?.(error); // and let the widget return to idle
    }
  }

  pause(): void {
    this.player?.pause();
  }

  resume(): void {
    this.player?.resume();
  }

  stop(): void {
    this.generation++; // invalidate any in-flight stream + pending onFinished
    this.player?.flush();
  }

  destroy(): void {
    this.generation++;
    void this.player?.destroy();
    this.player = null;
    this.playerPromise = null;
  }
}

/** Best-effort human-readable message from a non-OK TTS response. */
async function describeError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; detail?: string };
    return data.detail
      ? `${data.error ?? `TTS ${res.status}`}: ${data.detail}`
      : data.error ?? `TTS request failed (${res.status})`;
  } catch {
    return `TTS request failed (${res.status})`;
  }
}
