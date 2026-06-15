// Tests for the AudioPlaybackManager PcmStreamPlayer surface: prebuffer gating,
// onStarted-once, short/empty-reply finish, and pause/resume via AudioContext
// suspension. Web Audio is faked — these assert scheduling decisions, not sound.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AudioPlaybackManager } from "./audio-playback-manager";

class MockBufferSource {
  buffer: { duration: number } | null = null;
  onended: (() => void) | null = null;
  startTime = -1;
  connect() {}
  disconnect() {}
  start(t: number) {
    this.startTime = t;
  }
  stop() {}
}

class MockAudioContext {
  static instances: MockAudioContext[] = [];
  state: "running" | "suspended" | "closed" = "running";
  currentTime = 0;
  destination = {};
  sampleRate: number;
  sources: MockBufferSource[] = [];
  suspendCalls = 0;
  resumeCalls = 0;

  constructor(opts?: { sampleRate?: number }) {
    this.sampleRate = opts?.sampleRate ?? 44100;
    MockAudioContext.instances.push(this);
  }
  createBuffer(_channels: number, length: number, rate: number) {
    const data = new Float32Array(length);
    return { length, duration: length / rate, getChannelData: () => data };
  }
  createBufferSource() {
    const s = new MockBufferSource();
    this.sources.push(s);
    return s as unknown as AudioBufferSourceNode;
  }
  async suspend() {
    this.suspendCalls++;
    this.state = "suspended";
  }
  async resume() {
    this.resumeCalls++;
    this.state = "running";
  }
  async close() {
    this.state = "closed";
  }
}

/** A PCM16 chunk of `n` samples (content is irrelevant — we assert scheduling). */
const pcm = (n: number) => new Uint8Array(n * 2);

describe("AudioPlaybackManager (PcmStreamPlayer surface)", () => {
  beforeEach(() => {
    MockAudioContext.instances = [];
    (global as any).window = {
      AudioContext: MockAudioContext,
      webkitAudioContext: MockAudioContext,
    };
  });

  afterEach(() => {
    delete (global as any).window;
  });

  // waterline @ 24kHz / 200ms = round(24000 * 200 / 1000) = 4800 samples.
  it("holds audio until the prebuffer waterline, then releases and fires onStarted once", () => {
    const m = new AudioPlaybackManager(24000, { prebufferMs: 200 });
    const started = vi.fn();
    m.onStarted(started);

    // Below the waterline: nothing is scheduled and no AudioContext is created.
    m.enqueue(pcm(1000));
    expect(MockAudioContext.instances).toHaveLength(0);
    expect(started).not.toHaveBeenCalled();

    // Crossing the waterline releases the whole held batch as scheduled sources.
    m.enqueue(pcm(4000)); // 1000 + 4000 = 5000 >= 4800
    const ctx = MockAudioContext.instances[0];
    expect(ctx.sources).toHaveLength(2);
    expect(started).toHaveBeenCalledTimes(1);

    // Subsequent post-release chunks schedule directly and never re-fire onStarted.
    m.enqueue(pcm(100));
    expect(ctx.sources).toHaveLength(3);
    expect(started).toHaveBeenCalledTimes(1);
  });

  it("plays a reply shorter than the prebuffer (markStreamEnd flushes the gate)", () => {
    const m = new AudioPlaybackManager(24000, { prebufferMs: 200 });
    const finished = vi.fn();
    m.onFinished(finished);

    m.enqueue(pcm(500)); // well below the 4800 waterline
    expect(MockAudioContext.instances).toHaveLength(0);

    m.markStreamEnd();
    const ctx = MockAudioContext.instances[0];
    expect(ctx.sources).toHaveLength(1); // released so it still plays
    expect(finished).not.toHaveBeenCalled(); // not until the source ends

    ctx.sources[0].onended?.();
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it("resolves an empty reply to finished without ever opening an AudioContext", () => {
    const m = new AudioPlaybackManager(24000, { prebufferMs: 200 });
    const finished = vi.fn();
    m.onFinished(finished);

    m.markStreamEnd(); // no audio ever enqueued
    expect(finished).toHaveBeenCalledTimes(1);
    expect(MockAudioContext.instances).toHaveLength(0);
  });

  it("pauses via AudioContext.suspend and does not auto-resume on further audio", () => {
    const m = new AudioPlaybackManager(24000); // prebufferMs 0 → realtime, no gate
    const started = vi.fn();
    m.onStarted(started);

    m.enqueue(pcm(100)); // schedules immediately
    const ctx = MockAudioContext.instances[0];
    expect(ctx.sources).toHaveLength(1);
    expect(started).toHaveBeenCalledTimes(1);
    expect(ctx.state).toBe("running");

    m.pause();
    expect(ctx.suspendCalls).toBe(1);
    expect(ctx.state).toBe("suspended");

    // More audio arriving while paused must NOT silently un-pause the context.
    m.enqueue(pcm(100));
    expect(ctx.state).toBe("suspended");

    m.resume();
    expect(ctx.resumeCalls).toBeGreaterThanOrEqual(1);
    expect(ctx.state).toBe("running");
  });

  it("clears the started latch on flush so the next reply can fire onStarted again", () => {
    const m = new AudioPlaybackManager(24000); // realtime: schedules on first chunk
    const started = vi.fn();
    m.onStarted(started);

    m.enqueue(pcm(100));
    expect(started).toHaveBeenCalledTimes(1);

    m.flush();
    const startedAgain = vi.fn();
    m.onStarted(startedAgain);
    m.enqueue(pcm(100));
    expect(startedAgain).toHaveBeenCalledTimes(1);
  });
});
