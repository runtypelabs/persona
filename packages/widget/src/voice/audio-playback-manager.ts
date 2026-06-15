import type { PcmStreamPlayer } from "../types";

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
 * With the default `prebufferMs: 0` this behaves exactly like a bare scheduler
 * (the realtime path), so that path is unchanged. A non-zero `prebufferMs`
 * (the read-aloud path passes ~200) holds incoming audio until a waterline of
 * samples is buffered before starting, and re-enters buffering on underrun —
 * softening the schedule-clock snap that a hand-scheduled BufferSource otherwise
 * turns into a click on bursty HTTP-streamed audio. This is a pragmatic
 * approximation of the worklet's audio-thread silence, not parity.
 */
export class AudioPlaybackManager implements PcmStreamPlayer {
  private ctx: AudioContext | null = null;
  private nextStartTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private finishedCallbacks: (() => void)[] = [];
  private startedCallbacks: (() => void)[] = [];
  private playing = false;
  private streamEnded = false;
  private pendingCount = 0;
  // Fires once per playback session when the first sample is actually scheduled
  // (loading→playing). Cleared by flush(); a mid-reply underrun does not re-fire.
  private started = false;
  // Explicit user pause via pause(); kept separate from the AudioContext's
  // autoplay-policy suspension so ensureContext() doesn't auto-resume over it.
  private userPaused = false;

  // Prebuffer gate: while `buffering`, incoming samples accumulate in
  // `pendingBuffers` until they reach `waterlineSamples`, then release into the
  // scheduler. With `waterlineSamples === 0` the gate is off (realtime default).
  private buffering: boolean;
  private pendingBuffers: Float32Array[] = [];
  private pendingSamples = 0;

  // PCM format constants
  private readonly sampleRate: number;
  private readonly waterlineSamples: number;

  // Remainder byte from a previous chunk when the chunk had an odd byte count.
  // Network chunks don't respect 2-byte sample boundaries, so we carry over
  // the orphaned byte and prepend it to the next chunk.
  private remainder: Uint8Array | null = null;

  constructor(sampleRate = 24000, options: { prebufferMs?: number } = {}) {
    this.sampleRate = sampleRate;
    const prebufferMs = Math.max(0, options.prebufferMs ?? 0);
    this.waterlineSamples = Math.round((sampleRate * prebufferMs) / 1000);
    this.buffering = this.waterlineSamples > 0;
  }

  /**
   * Ensure AudioContext is created and running.
   * Must be called after a user gesture on iOS Safari.
   */
  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const w = typeof window !== "undefined" ? (window as any) : undefined;
      if (!w) throw new Error("AudioPlaybackManager requires a browser environment");
      const AudioCtx = w.AudioContext || w.webkitAudioContext;
      this.ctx = new AudioCtx({ sampleRate: this.sampleRate }) as AudioContext;
    }
    const ctx = this.ctx!;
    // Resume if suspended (autoplay policy) — but never override an explicit
    // user pause(): more audio may still stream in while paused.
    if (ctx.state === "suspended" && !this.userPaused) {
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
    if (this.remainder) {
      const merged = new Uint8Array(this.remainder.length + pcmData.length);
      merged.set(this.remainder);
      merged.set(pcmData, this.remainder.length);
      data = merged;
      this.remainder = null;
    }

    // If odd byte count, save the trailing byte for next chunk
    if (data.length % 2 !== 0) {
      this.remainder = new Uint8Array([data[data.length - 1]]);
      data = data.subarray(0, data.length - 1);
    }

    if (data.length === 0) return;

    const float32 = this.pcmToFloat32(data);
    if (float32.length === 0) return;

    if (this.buffering) {
      // Hold until the prebuffer waterline fills, then release as a batch.
      this.pendingBuffers.push(float32);
      this.pendingSamples += float32.length;
      if (this.pendingSamples >= this.waterlineSamples) this.releaseBuffer();
    } else {
      this.scheduleSamples(float32);
    }
  }

  /**
   * Signal that no more chunks will arrive.
   * The onFinished callback fires after all queued audio has played.
   */
  markStreamEnd(): void {
    // A reply shorter than the prebuffer never reaches the waterline; release
    // whatever we held so it still plays.
    if (this.pendingBuffers.length > 0) this.releaseBuffer();
    this.streamEnded = true;
    this.checkFinished();
  }

  /**
   * Immediately stop all playback and discard queued audio.
   */
  flush(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Ignore errors from already-stopped sources
      }
    }
    this.activeSources = [];
    this.pendingCount = 0;
    this.nextStartTime = 0;
    this.playing = false;
    this.streamEnded = false;
    this.finishedCallbacks = [];
    this.startedCallbacks = [];
    this.remainder = null;
    // Reset the prebuffer gate and the started latch for the next reply.
    this.pendingBuffers = [];
    this.pendingSamples = 0;
    this.buffering = this.waterlineSamples > 0;
    this.started = false;
  }

  /**
   * Whether audio is currently playing or queued.
   */
  isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Register a callback for when all queued audio finishes playing.
   */
  onFinished(callback: () => void): void {
    this.finishedCallbacks.push(callback);
  }

  /**
   * Register a callback fired once when audible playback first begins (the first
   * sample is scheduled, after any prebuffer). Cleared by {@link flush}; a
   * mid-reply underrun re-buffer does not re-fire it.
   */
  onStarted(callback: () => void): void {
    this.startedCallbacks.push(callback);
  }

  /**
   * Pause playback. Suspends the AudioContext clock; queued/scheduled audio
   * freezes in place and {@link resume} continues exactly where it left off.
   */
  pause(): void {
    this.userPaused = true;
    if (this.ctx && this.ctx.state === "running") void this.ctx.suspend();
  }

  /** Resume playback after {@link pause}. */
  resume(): void {
    this.userPaused = false;
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  /**
   * Clean up AudioContext resources.
   */
  async destroy(): Promise<void> {
    this.flush();
    if (this.ctx) {
      await this.ctx.close();
      this.ctx = null;
    }
  }

  /** Release held prebuffer samples into the scheduler in arrival order. */
  private releaseBuffer(): void {
    this.buffering = false;
    const held = this.pendingBuffers;
    this.pendingBuffers = [];
    this.pendingSamples = 0;
    for (const samples of held) this.scheduleSamples(samples);
  }

  /** Schedule one Float32 sample block for gap-free playback. */
  private scheduleSamples(float32: Float32Array): void {
    if (float32.length === 0) return;
    const ctx = this.ensureContext();

    const buffer = ctx.createBuffer(1, float32.length, this.sampleRate);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    if (this.nextStartTime === 0) {
      // Fresh start (first audio of this session, or after flush).
      this.nextStartTime = now;
    } else if (this.nextStartTime < now) {
      // Underrun: the playhead caught up to the queue. Snap to now (a small,
      // unavoidable gap) and, when a prebuffer is configured, re-enter buffering
      // so subsequent chunks re-accumulate before scheduling — collapsing a
      // train of clicks into a single rebuffer.
      this.nextStartTime = now;
      if (this.waterlineSamples > 0) this.buffering = true;
    }
    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;

    this.activeSources.push(source);
    this.pendingCount++;
    this.playing = true;

    if (!this.started) {
      this.started = true;
      const cbs = this.startedCallbacks.slice();
      this.startedCallbacks = [];
      for (const cb of cbs) cb();
    }

    source.onended = () => {
      const idx = this.activeSources.indexOf(source);
      if (idx !== -1) this.activeSources.splice(idx, 1);
      this.pendingCount--;
      this.checkFinished();
    };
  }

  private checkFinished(): void {
    // Fire once the stream has ended and nothing is scheduled or held. No
    // `playing` precondition: an empty reply (markStreamEnd with no audio) must
    // still resolve to idle, matching the worklet's immediate 'drained'.
    if (
      this.streamEnded &&
      this.pendingCount <= 0 &&
      this.pendingBuffers.length === 0
    ) {
      this.playing = false;
      this.streamEnded = false;
      const cbs = this.finishedCallbacks.slice();
      this.finishedCallbacks = [];
      for (const cb of cbs) cb();
    }
  }

  /**
   * Convert 16-bit signed LE PCM to Float32 samples in [-1, 1].
   */
  private pcmToFloat32(pcmData: Uint8Array): Float32Array {
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
