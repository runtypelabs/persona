/**
 * AudioPlaybackManager
 *
 * Manages streaming playback of PCM audio chunks via the Web Audio API.
 * Receives raw PCM data (24 kHz, 16-bit signed little-endian, mono),
 * converts to Float32 AudioBuffers, and schedules gap-free sequential
 * playback using AudioBufferSourceNode.
 *
 * Works on all browsers including iOS Safari (no MediaSource dependency).
 */
export class AudioPlaybackManager {
  private ctx: AudioContext | null = null;
  private nextStartTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private finishedCallbacks: (() => void)[] = [];
  private playing = false;
  private streamEnded = false;
  private pendingCount = 0;

  // PCM format constants
  private readonly sampleRate: number;

  // Remainder byte from a previous chunk when the chunk had an odd byte count.
  // Network chunks don't respect 2-byte sample boundaries, so we carry over
  // the orphaned byte and prepend it to the next chunk.
  private remainder: Uint8Array | null = null;

  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
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
    // Resume if suspended (autoplay policy)
    if (ctx.state === "suspended") {
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

    const ctx = this.ensureContext();
    const float32 = this.pcmToFloat32(data);

    const buffer = ctx.createBuffer(1, float32.length, this.sampleRate);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    // Schedule gap-free playback
    const now = ctx.currentTime;
    if (this.nextStartTime < now) {
      this.nextStartTime = now;
    }
    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;

    this.activeSources.push(source);
    this.pendingCount++;
    this.playing = true;

    source.onended = () => {
      const idx = this.activeSources.indexOf(source);
      if (idx !== -1) this.activeSources.splice(idx, 1);
      this.pendingCount--;
      this.checkFinished();
    };
  }

  /**
   * Signal that no more chunks will arrive.
   * The onFinished callback fires after all queued audio has played.
   */
  markStreamEnd(): void {
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
    this.remainder = null;
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
   * Clean up AudioContext resources.
   */
  async destroy(): Promise<void> {
    this.flush();
    if (this.ctx) {
      await this.ctx.close();
      this.ctx = null;
    }
  }

  private checkFinished(): void {
    if (this.streamEnded && this.pendingCount <= 0 && this.playing) {
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
