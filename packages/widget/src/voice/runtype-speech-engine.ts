// Runtype Speech Engine (streaming TTS)
//
// Built-in `SpeechEngine` that backs the per-message "Read aloud" action (and
// the auto-speak path) with Runtype-hosted text-to-speech. It is the client
// half of the "Option A" HTTP synthesize design: a stateless
//
//   POST {host}/v1/agents/:agentId/speak  ->  streamed PCM16 / 24 kHz / mono
//
// The `clientToken` is browser-safe (same one the chat widget uses, scoped by
// `allowedOrigins`), so this calls Runtype directly from the page — no proxy.
// The streamed PCM is fed chunk-by-chunk into a {@link PcmStreamPlayer}, so this
// engine stays tiny: fetch -> enqueue chunks -> markStreamEnd. The player owns
// prebuffering, gapless scheduling, graceful underrun, and pause/resume.
//
// By default the player is the in-bundle, main-thread `AudioPlaybackManager`
// (no AudioWorklet module — keeps the main bundle lean). Consumers who want the
// jitter-buffered AudioWorklet player inject `createPcmStreamPlayer` from
// `@runtypelabs/persona/voice-worklet-player` via `createPlaybackEngine` (config:
// `textToSpeech.createPlaybackEngine`); the worklet then lands in their bundle.
//
// Wired automatically by `textToSpeech: { provider: 'runtype' }` (see
// `session.ts`), which derives `host`/`agentId`/`clientToken` from the widget
// config and — unless `browserFallback: false` — wraps this in a
// `FallbackSpeechEngine` so a missing endpoint or transient failure falls back
// to the browser voice instead of erroring.

import type {
  PcmStreamPlayer,
  SpeechCallbacks,
  SpeechEngine,
  SpeechRequest,
} from "../types";
import { AudioPlaybackManager } from "./audio-playback-manager";

export interface RuntypeSpeechEngineOptions {
  /**
   * Runtype API host, e.g. `https://api.runtype.com` (typically the widget's
   * `apiUrl`). A trailing slash is tolerated.
   */
  host: string;
  /** Agent whose configured voice synthesizes the text. */
  agentId: string;
  /** Browser-safe client token — the same one the chat widget uses. */
  clientToken: string;
  /**
   * Default voice id, used when a `SpeechRequest` doesn't carry its own. When
   * omitted the agent's configured voice is used.
   */
  voice?: string;
  /**
   * Audio (ms) the player buffers before the first sample and after an
   * underrun. Runtype streams steadily, so the default (200) keeps first sound
   * close to time-to-first-byte while still riding out small hiccups. Applies to
   * the default {@link AudioPlaybackManager}; a custom `createPlaybackEngine` is
   * responsible for its own prebuffer.
   */
  prebufferMs?: number;
  /**
   * Factory for the streaming PCM player. Defaults to the in-bundle, main-thread
   * {@link AudioPlaybackManager} (with `prebufferMs`). Pass `createPcmStreamPlayer`
   * from `@runtypelabs/persona/voice-worklet-player` for the jitter-buffered
   * AudioWorklet player (it then ships in your bundle, not Persona's). May be
   * async — it is resolved on first playback, inside the user gesture.
   */
  createPlaybackEngine?: () => PcmStreamPlayer | Promise<PcmStreamPlayer>;
  /**
   * Optional hook for surfacing fetch/stream failures (a missing endpoint, an
   * expired token, an upstream 4xx) to a log or telemetry. The widget itself
   * only returns the read-aloud button to idle (or, with a fallback engine,
   * silently switches to the browser voice), so without this the reason is
   * invisible.
   */
  onError?: (error: Error) => void;
}

/** Strip a trailing slash so `${host}/v1/...` never doubles up. */
function normalizeHost(host: string): string {
  return host.replace(/\/+$/, "");
}

/** Streaming `SpeechEngine` backed by Runtype's `/v1/agents/:id/speak`. */
export class RuntypeSpeechEngine implements SpeechEngine {
  readonly id = "runtype-tts";
  // The PCM player pauses/resumes via AudioContext.suspend() — solid, unlike
  // speechSynthesis.pause().
  readonly supportsPause = true;

  private player: PcmStreamPlayer | null = null;
  private playerPromise: Promise<PcmStreamPlayer> | null = null;
  // Bumped on every speak()/stop() so a superseded request's async callbacks and
  // its in-flight stream read loop become no-ops.
  private generation = 0;

  constructor(private readonly opts: RuntypeSpeechEngineOptions) {}

  // Create one player lazily (a worklet engine's addModule is async), then reuse
  // it across speaks; flush() between replies clears the queue without tearing
  // down the AudioContext. Defaults to the in-bundle AudioPlaybackManager.
  private ensurePlayer(): Promise<PcmStreamPlayer> {
    return (this.playerPromise ??= Promise.resolve(
      this.opts.createPlaybackEngine
        ? this.opts.createPlaybackEngine()
        : new AudioPlaybackManager(24000, {
            prebufferMs: this.opts.prebufferMs ?? 200,
          }),
    ).then((player) => (this.player = player)));
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

      // Drive read-aloud state from the player, not from chunk arrival: onStarted
      // fires when the prebuffer fills and audio is actually audible (loading ->
      // playing); onFinished when it drains (-> idle). An empty stream produces
      // no onStarted and an immediate onFinished, so the UI skips straight back
      // to idle without a phantom "playing".
      player.onStarted(() => {
        if (gen === this.generation) callbacks.onStart?.();
      });
      player.onFinished(() => {
        if (gen === this.generation) callbacks.onEnd?.();
      });

      const url = `${normalizeHost(this.opts.host)}/v1/agents/${encodeURIComponent(
        this.opts.agentId,
      )}/speak`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Match Runtype's client-token auth convention. Never placed in the
          // URL/query string.
          Authorization: `Bearer ${this.opts.clientToken}`,
        },
        body: JSON.stringify({
          text: request.text,
          voice: request.voice ?? this.opts.voice,
          format: "pcm",
        }),
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
      this.opts.onError?.(error); // surface the reason (log, telemetry, …)
      callbacks.onError?.(error); // and let the widget (or fallback) react
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

/** Best-effort human-readable message from a non-OK speak response. */
async function describeError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; detail?: string };
    return data.detail
      ? `${data.error ?? `Runtype TTS ${res.status}`}: ${data.detail}`
      : data.error ?? `Runtype TTS request failed (${res.status})`;
  } catch {
    return `Runtype TTS request failed (${res.status})`;
  }
}
