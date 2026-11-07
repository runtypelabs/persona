import type { PcmStreamPlayer, VoicePlaybackMetrics } from "../types";

/**
 * AudioPlaybackManager
 *
 * Manages streaming playback of PCM audio chunks via the Web Audio API.
 * Receives raw PCM data (24 kHz, 16-bit signed little-endian, mono),
 * converts to Float32 AudioBuffers, and schedules gap-free sequential
 * playback using AudioBufferSourceNode.
 *
 * Works on all browsers including iOS Safari (no MediaSource dependency).
 *
 * This is the default {@link PcmStreamPlayer} for both the realtime voice
 * provider and the `provider: 'runtype'` "Read aloud" path. It runs entirely on
 * the main thread, so it stays in the main bundle (no AudioWorklet module). The
 * jitter-buffered AudioWorklet player (`createPcmStreamPlayer` from
 * `@runtypelabs/persona/voice-worklet-player`) is the higher-quality, opt-in
 * alternative — inject it via `voiceRecognition.provider.runtype.createPlaybackEngine`
 * or `textToSpeech.createPlaybackEngine` and it lands in the consumer's bundle.
 *
 * The default 150 ms prebuffer holds incoming samples before starting and
 * refills after an underrun, absorbing short delivery gaps. Read-aloud uses
 * its own prebuffer. An explicit `prebufferMs: 0` opts into immediate playback.
 */
export class AudioPlaybackManager implements PcmStreamPlayer {
  #ctx: AudioContext | null = null;
  #nextStartTime = 0;
  #activeSources: AudioBufferSourceNode[] = [];
  #finishedCallbacks: (() => void)[] = [];
  #startedCallbacks: (() => void)[] = [];
  #playing = false;
  #streamEnded = false;
  #pendingCount = 0;
  // Fires once per playback session when the first sample is actually scheduled
  // (loading→playing). Cleared by flush(); a mid-reply underrun does not re-fire.
  #started = false;
  // Explicit user pause via pause(); kept separate from the AudioContext's
  // autoplay-policy suspension so ensureContext() doesn't auto-resume over it.
  #userPaused = false;

  // Prebuffer gate: while `buffering`, incoming samples accumulate in
  // `pendingBuffers` until they reach `waterlineSamples`, then release into the
  // scheduler. With `waterlineSamples === 0` the gate is off.
  #buffering: boolean;
  #pendingBuffers: Float32Array[] = [];
  #pendingSamples = 0;
  // Continuous streams never call markStreamEnd: a held tail is released after one
  // prebuffer's worth of quiet instead.
  #continuous = false;
  #tailTimer: ReturnType<typeof setTimeout> | undefined;
  #metricsCallbacks: ((metrics: VoicePlaybackMetrics) => void)[] = [];
  #lastMetricsAt = -Infinity;
  #awaitingAudio = false;
  #underrunCount = 0;
  #refillStartedAt: number | null = null;
  #refillCount = 0;
  #lastRefillMs: number | null = null;
  #totalRefillMs = 0;

  // PCM format constants
  readonly #sampleRate: number;
  readonly #waterlineSamples: number;

  // Remainder byte from a previous chunk when the chunk had an odd byte count.
  // Network chunks don't respect 2-byte sample boundaries, so we carry over
  // the orphaned byte and prepend it to the next chunk.
  #remainder: Uint8Array | null = null;

  constructor(sampleRate = 24000, options: { prebufferMs?: number } = {}) {
    this.#sampleRate = sampleRate;
    const prebufferMs = Math.max(0, options.prebufferMs ?? 150);
    this.#waterlineSamples = Math.round((sampleRate * prebufferMs) / 1000);
    this.#buffering = this.#waterlineSamples > 0;
  }

  /**
   * Ensure AudioContext is created and running.
   * Must be called after a user gesture on iOS Safari.
   */
  #ensureContext(): AudioContext {
    if (!this.#ctx) {
      const w = typeof window !== "undefined" ? (window as any) : undefined;
      if (!w) throw new Error("AudioPlaybackManager requires a browser environment");
      const AudioCtx = w.AudioContext || w.webkitAudioContext;
      this.#ctx = new AudioCtx({ sampleRate: this.#sampleRate }) as AudioContext;
    }
    const ctx = this.#ctx!;
    // Resume if suspended (autoplay policy) — but never override an explicit
    // user pause(): more audio may still stream in while paused.
    if (ctx.state === "suspended" && !this.#userPaused) {
      ctx.resume();
    }
    return ctx;
  }

  /**
   * Enqueue a PCM chunk for playback.
   * @param pcmData Raw PCM bytes (16-bit signed LE mono)
   */
  enqueue(pcmData: Uint8Array): void {
    if (pcmData.length === 0) return;

    // Prepend any remainder byte from the previous chunk
    let data = pcmData;
    if (this.#remainder) {
      const merged = new Uint8Array(this.#remainder.length + pcmData.length);
      merged.set(this.#remainder);
      merged.set(pcmData, this.#remainder.length);
      data = merged;
      this.#remainder = null;
    }

    // If odd byte count, save the trailing byte for next chunk
    if (data.length % 2 !== 0) {
      this.#remainder = new Uint8Array([data[data.length - 1]]);
      data = data.subarray(0, data.length - 1);
    }

    if (data.length === 0) return;

    const float32 = this.#pcmToFloat32(data);
    if (float32.length === 0) return;

    const underrun =
      !this.#buffering && this.#awaitingAudio &&
      !this.#userPaused && this.#ctx !== null && this.#nextStartTime < this.#ctx.currentTime;
    if (underrun) {
      this.#underrunCount++;
      if (this.#waterlineSamples > 0) this.#refillStartedAt = performance.now();
    }
    this.#awaitingAudio = true;

    if (
      this.#waterlineSamples > 0 &&
      this.#ctx &&
      this.#nextStartTime < this.#ctx.currentTime
    ) {
      this.#buffering = true;
    }

    if (this.#buffering) {
      // Hold until the prebuffer waterline fills, then release as a batch.
      this.#pendingBuffers.push(float32);
      this.#pendingSamples += float32.length;
      clearTimeout(this.#tailTimer);
      if (underrun) this.#emitPlaybackMetrics("underrun");
      if (this.#pendingSamples >= this.#waterlineSamples) this.#releaseBuffer();
      else if (this.#continuous) {
        this.#tailTimer = setTimeout(
          () => this.#releaseBuffer(),
          (this.#waterlineSamples / this.#sampleRate) * 1000,
        );
      }
    } else {
      this.#scheduleSamples(float32);
      if (underrun) this.#emitPlaybackMetrics("underrun");
    }
    this.#emitPlaybackMetrics("queue");
  }

  /**
   * Signal that no more chunks will arrive.
   * The onFinished callback fires after all queued audio has played.
   */
  markStreamEnd(): void {
    this.#awaitingAudio = false;
    // A reply shorter than the prebuffer never reaches the waterline; release
    // whatever we held so it still plays.
    if (this.#pendingBuffers.length > 0) this.#releaseBuffer();
    this.#streamEnded = true;
    this.#checkFinished();
  }

  /**
   * Immediately stop all playback and discard queued audio.
   */
  flush(): void {
    for (const source of this.#activeSources) {
      // A stopped source still fires `onended` later; detach it so a flushed
      // batch can't decrement the next reply's pendingCount and drain it early.
      source.onended = null;
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Ignore errors from already-stopped sources
      }
    }
    this.#activeSources = [];
    this.#pendingCount = 0;
    this.#nextStartTime = 0;
    this.#playing = false;
    this.#streamEnded = false;
    this.#finishedCallbacks = [];
    this.#startedCallbacks = [];
    this.#remainder = null;
    // Reset the prebuffer gate and the started latch for the next reply.
    this.#pendingBuffers = [];
    this.#pendingSamples = 0;
    this.#buffering = this.#waterlineSamples > 0;
    this.#started = false;
    this.#awaitingAudio = false;
    this.#refillStartedAt = null;
    clearTimeout(this.#tailTimer);
    this.#emitPlaybackMetrics("flushed");
  }

  /** See {@link VoicePlaybackEngine.setContinuousMode}. */
  setContinuousMode(enabled: boolean): void {
    this.#continuous = enabled;
  }

  /**
   * Whether audio is currently playing or queued.
   */
  isPlaying(): boolean {
    return this.#playing;
  }

  /**
   * Register a callback for when all queued audio finishes playing.
   */
  onFinished(callback: () => void): void {
    this.#finishedCallbacks.push(callback);
  }

  /**
   * Register a callback fired once when audible playback first begins (the first
   * sample is scheduled, after any prebuffer). Cleared by {@link flush}; a
   * mid-reply underrun re-buffer does not re-fire it.
   */
  onStarted(callback: () => void): void {
    this.#startedCallbacks.push(callback);
  }

  /** Subscribe without starting a polling timer or retaining audio in the measurements. */
  onPlaybackMetrics(callback: (metrics: VoicePlaybackMetrics) => void): void {
    this.#metricsCallbacks.push(callback);
  }

  /**
   * Pause playback. Suspends the AudioContext clock; queued/scheduled audio
   * freezes in place and {@link resume} continues exactly where it left off.
   */
  pause(): void {
    this.#userPaused = true;
    if (this.#ctx && this.#ctx.state === "running") void this.#ctx.suspend();
  }

  /** Resume playback after {@link pause}. */
  resume(): void {
    this.#userPaused = false;
    if (this.#ctx && this.#ctx.state === "suspended") void this.#ctx.resume();
  }

  /**
   * Clean up AudioContext resources.
   */
  async destroy(): Promise<void> {
    this.flush();
    this.#metricsCallbacks = [];
    if (this.#ctx) {
      await this.#ctx.close();
      this.#ctx = null;
    }
  }

  /** Release held prebuffer samples into the scheduler in arrival order. */
  #releaseBuffer(): void {
    clearTimeout(this.#tailTimer);
    this.#tailTimer = undefined;
    if (this.#pendingBuffers.length === 0) return;
    this.#buffering = false;
    const held = this.#pendingBuffers;
    this.#pendingBuffers = [];
    this.#pendingSamples = 0;
    for (const samples of held) this.#scheduleSamples(samples);
    if (this.#refillStartedAt !== null) {
      this.#lastRefillMs = Math.max(0, performance.now() - this.#refillStartedAt);
      this.#refillStartedAt = null;
      this.#refillCount++;
      this.#totalRefillMs += this.#lastRefillMs;
      this.#emitPlaybackMetrics("refill");
    }
  }

  /** Schedule one Float32 sample block for gap-free playback. */
  #scheduleSamples(float32: Float32Array): void {
    if (float32.length === 0) return;
    const ctx = this.#ensureContext();

    const buffer = ctx.createBuffer(1, float32.length, this.#sampleRate);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    this.#nextStartTime = Math.max(this.#nextStartTime, now);
    source.start(this.#nextStartTime);
    this.#nextStartTime += buffer.duration;

    this.#activeSources.push(source);
    this.#pendingCount++;
    this.#playing = true;

    if (!this.#started) {
      this.#started = true;
      const cbs = this.#startedCallbacks.slice();
      this.#startedCallbacks = [];
      for (const cb of cbs) cb();
    }

    source.onended = () => {
      const idx = this.#activeSources.indexOf(source);
      // Not active: removed by flush(), so it no longer counts toward a drain.
      if (idx === -1) return;
      this.#activeSources.splice(idx, 1);
      this.#pendingCount--;
      this.#checkFinished();
      this.#emitPlaybackMetrics(this.#pendingCount === 0 && this.#pendingSamples === 0 ? "drained" : "queue");
    };
  }

  #emitPlaybackMetrics(reason: VoicePlaybackMetrics["reason"]): void {
    if (this.#metricsCallbacks.length === 0) return;
    const now = performance.now();
    if (reason === "queue" && now - this.#lastMetricsAt < 250) return;
    this.#lastMetricsAt = now;
    const scheduledMs = this.#ctx ? Math.max(0, this.#nextStartTime - this.#ctx.currentTime) * 1000 : 0;
    const metrics: VoicePlaybackMetrics = {
      reason,
      queuedAudioMs: scheduledMs + this.#pendingSamples / this.#sampleRate * 1000,
      buffering: this.#buffering,
      continuous: this.#continuous,
      underrunCount: this.#underrunCount,
      refillCount: this.#refillCount,
      lastRefillMs: this.#lastRefillMs,
      totalRefillMs: this.#totalRefillMs,
    };
    for (const callback of this.#metricsCallbacks) {
      try {
        callback(metrics);
      } catch {
        // SAFETY: optional diagnostics must not interrupt audio playback.
      }
    }
  }

  #checkFinished(): void {
    // Fire once the stream has ended and nothing is scheduled or held. No
    // `playing` precondition: an empty reply (markStreamEnd with no audio) must
    // still resolve to idle, matching the worklet's immediate 'drained'.
    if (
      this.#streamEnded &&
      this.#pendingCount <= 0 &&
      this.#pendingBuffers.length === 0
    ) {
      this.#playing = false;
      this.#streamEnded = false;
      const cbs = this.#finishedCallbacks.slice();
      this.#finishedCallbacks = [];
      for (const cb of cbs) cb();
    }
  }

  /**
   * Convert 16-bit signed LE PCM to Float32 samples in [-1, 1].
   */
  #pcmToFloat32(pcmData: Uint8Array): Float32Array {
    // 2 bytes per sample (16-bit)
    const numSamples = Math.floor(pcmData.length / 2);
    const float32 = new Float32Array(numSamples);
    const view = new DataView(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength);

    for (let i = 0; i < numSamples; i++) {
      const int16 = view.getInt16(i * 2, true); // little-endian
      float32[i] = int16 / 32768;
    }

    return float32;
  }
}
