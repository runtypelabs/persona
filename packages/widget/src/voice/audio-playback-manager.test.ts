// Tests for the AudioPlaybackManager PcmStreamPlayer surface: prebuffer gating,
// onStarted-once, short/empty-reply finish, and pause/resume via AudioContext
// suspension. Web Audio is faked — these assert scheduling decisions, not sound.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AudioPlaybackManager } from "./audio-playback-manager";
import type { VoicePlaybackMetrics } from "../types";

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
    vi.restoreAllMocks();
    delete (global as any).window;
  });

  it("samples held and scheduled audio without polling or changing the 150 ms gate", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const player = new AudioPlaybackManager();
    const seen: VoicePlaybackMetrics[] = [];
    player.onPlaybackMetrics((metrics) => seen.push(metrics));
    player.enqueue(pcm(2400));
    expect(seen.at(-1)).toMatchObject({ queuedAudioMs: 100, buffering: true, underrunCount: 0 });
    now = 100;
    player.enqueue(pcm(1200));
    const ctx = MockAudioContext.instances[0];
    expect(ctx.sources).toHaveLength(2);
    expect(seen).toHaveLength(1);
    ctx.currentTime = 0.05;
    now = 250;
    player.enqueue(pcm(2400));
    expect(seen.at(-1)).toMatchObject({ queuedAudioMs: 200, buffering: false, refillCount: 0 });
    ctx.currentTime = 1;
    ctx.sources.forEach((source) => source.onended?.());
    expect(seen.at(-1)).toMatchObject({ reason: "drained", queuedAudioMs: 0 });
  });

  it("counts one underrun per refill and measures from the first late chunk to release", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const player = new AudioPlaybackManager();
    const seen: VoicePlaybackMetrics[] = [];
    player.onPlaybackMetrics((metrics) => seen.push(metrics));
    player.enqueue(pcm(4800));
    const ctx = MockAudioContext.instances[0];
    ctx.currentTime = 0.4;
    now = 400;
    player.enqueue(pcm(2400));
    expect(seen.at(-1)).toMatchObject({ reason: "underrun", queuedAudioMs: 100, underrunCount: 1, refillCount: 0 });
    ctx.currentTime = 0.46;
    now = 460;
    player.enqueue(pcm(2400));
    expect(seen.at(-1)).toMatchObject({ reason: "refill", queuedAudioMs: 200, underrunCount: 1, refillCount: 1, lastRefillMs: 60, totalRefillMs: 60 });
    ctx.currentTime = 0.8;
    now = 800;
    player.enqueue(pcm(2400));
    ctx.currentTime = 0.83;
    now = 830;
    player.markStreamEnd();
    expect(seen.at(-1)).toMatchObject({ reason: "refill", underrunCount: 2, refillCount: 2, lastRefillMs: 30, totalRefillMs: 90 });
  });

  it("does not count startup, explicit stream endings, or interrupted refills as completed refills", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const player = new AudioPlaybackManager();
    const seen: VoicePlaybackMetrics[] = [];
    player.onPlaybackMetrics((metrics) => seen.push(metrics));
    player.enqueue(pcm(960));
    player.markStreamEnd();
    const ctx = MockAudioContext.instances[0];
    ctx.currentTime = 5;
    now = 5000;
    player.enqueue(pcm(4800));
    expect(seen.at(-1)).toMatchObject({ underrunCount: 0, refillCount: 0, lastRefillMs: null });
    ctx.currentTime = 6;
    now = 6000;
    player.enqueue(pcm(960));
    player.flush();
    expect(seen.at(-1)).toMatchObject({ reason: "flushed", queuedAudioMs: 0, underrunCount: 1, refillCount: 0, totalRefillMs: 0 });
    now = 7000;
    player.enqueue(pcm(4800));
    expect(seen.at(-1)).toMatchObject({ underrunCount: 1, refillCount: 0 });
  });

  it("reports continuous short-tail refill time without counting the startup tail", () => {
    vi.useFakeTimers();
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    try {
      const player = new AudioPlaybackManager();
      const seen: VoicePlaybackMetrics[] = [];
      player.onPlaybackMetrics((metrics) => seen.push(metrics));
      player.setContinuousMode(true);
      player.enqueue(pcm(960));
      now = 150;
      vi.advanceTimersByTime(150);
      const ctx = MockAudioContext.instances[0];
      ctx.currentTime = 1;
      now = 1000;
      player.enqueue(pcm(960));
      now = 1150;
      vi.advanceTimersByTime(150);
      expect(seen.at(-1)).toMatchObject({ reason: "refill", continuous: true, underrunCount: 1, refillCount: 1, lastRefillMs: 150 });
      expect(seen.at(-1)?.queuedAudioMs).toBeCloseTo(40);
    } finally {
      vi.useRealTimers();
    }
  });

  it("isolates a failing metrics consumer from playback and other subscribers", () => {
    const player = new AudioPlaybackManager();
    const seen: VoicePlaybackMetrics[] = [];
    player.onPlaybackMetrics(() => { throw new Error("broken telemetry"); });
    player.onPlaybackMetrics((metrics) => seen.push(metrics));
    expect(() => player.enqueue(pcm(4800))).not.toThrow();
    expect(MockAudioContext.instances[0].sources).toHaveLength(1);
    expect(seen.at(-1)?.queuedAudioMs).toBe(200);
  });

  it("ignores empty input and explicit pauses and installs no measurement timer", () => {
    vi.useFakeTimers();
    try {
      const player = new AudioPlaybackManager(24000, { prebufferMs: 0 });
      const seen: VoicePlaybackMetrics[] = [];
      player.onPlaybackMetrics((metrics) => seen.push(metrics));
      player.enqueue(new Uint8Array());
      player.enqueue(new Uint8Array([0]));
      expect(seen).toEqual([]);
      player.enqueue(new Uint8Array([0]));
      player.pause();
      const ctx = MockAudioContext.instances[0];
      ctx.currentTime = 10;
      player.enqueue(pcm(2400));
      player.flush();
      expect(seen.at(-1)).toMatchObject({ underrunCount: 0, refillCount: 0, queuedAudioMs: 0 });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts immediate-playback underruns without inventing a refill wait", () => {
    const player = new AudioPlaybackManager(24000, { prebufferMs: 0 });
    const seen: VoicePlaybackMetrics[] = [];
    player.onPlaybackMetrics((metrics) => seen.push(metrics));
    player.enqueue(pcm(2400));
    MockAudioContext.instances[0].currentTime = 1;
    player.enqueue(pcm(2400));
    expect(seen.at(-1)).toMatchObject({ reason: "underrun", underrunCount: 1, refillCount: 0, lastRefillMs: null });
    expect(seen.at(-1)?.queuedAudioMs).toBeCloseTo(100);
  });

  it("buffers 150 ms by default before scheduling realtime audio", () => {
    const player = new AudioPlaybackManager();
    player.enqueue(pcm(2400));
    expect(MockAudioContext.instances).toHaveLength(0);
    player.enqueue(pcm(1200));
    const ctx = MockAudioContext.instances[0];
    expect(ctx.sources.map((source) => source.startTime)).toEqual([0, 0.1]);
  });

  it("re-buffers the first late chunk instead of playing it alone after an underrun", () => {
    const player = new AudioPlaybackManager(24000, { prebufferMs: 150 });
    player.enqueue(pcm(4800));
    const ctx = MockAudioContext.instances[0];
    ctx.currentTime = 0.4;
    player.enqueue(pcm(2400));
    expect(ctx.sources).toHaveLength(1);
    ctx.currentTime = 0.46;
    player.enqueue(pcm(2400));
    expect(ctx.sources).toHaveLength(3);
    expect(ctx.sources[1].startTime).toBeCloseTo(0.46);
    expect(ctx.sources[2].startTime).toBeCloseTo(0.56);
  });

  it("flush discards a short buffered reply and its pending release timer", () => {
    vi.useFakeTimers();
    try {
      const player = new AudioPlaybackManager(24000, { prebufferMs: 150 });
      player.setContinuousMode(true);
      player.enqueue(pcm(960));
      player.flush();
      vi.advanceTimersByTime(300);
      expect(MockAudioContext.instances).toHaveLength(0);
      player.enqueue(pcm(2400));
      expect(MockAudioContext.instances).toHaveLength(0);
      vi.advanceTimersByTime(150);
      expect(MockAudioContext.instances[0].sources).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("releases a short continuous reply after an underrun without waiting for audio_end", () => {
    vi.useFakeTimers();
    try {
      const player = new AudioPlaybackManager(24000, { prebufferMs: 150 });
      player.setContinuousMode(true);
      player.enqueue(pcm(4800));
      const ctx = MockAudioContext.instances[0];
      ctx.currentTime = 0.5;
      player.enqueue(pcm(960));
      expect(ctx.sources).toHaveLength(1);
      vi.advanceTimersByTime(149);
      expect(ctx.sources).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(ctx.sources).toHaveLength(2);
      expect(ctx.sources[1].startTime).toBe(0.5);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a cleared short-tail timer cannot disable buffering for the next reply", () => {
    vi.useFakeTimers();
    try {
      const player = new AudioPlaybackManager(24000, { prebufferMs: 150 });
      player.setContinuousMode(true);
      player.enqueue(pcm(960));
      player.markStreamEnd();
      const ctx = MockAudioContext.instances[0];
      ctx.sources[0].onended?.();
      ctx.currentTime = 0.5;
      player.enqueue(pcm(960));
      vi.advanceTimersByTime(150);
      expect(ctx.sources).toHaveLength(2);
      ctx.currentTime = 1;
      player.enqueue(pcm(960));
      expect(ctx.sources).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
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

  it("continuous mode releases a held tail after a prebuffer of quiet, and stays usable", () => {
    vi.useFakeTimers();
    try {
      const m = new AudioPlaybackManager(24000, { prebufferMs: 200 });
      m.setContinuousMode(true);
      m.enqueue(pcm(500)); // below the waterline and no markStreamEnd will ever come
      vi.advanceTimersByTime(150);
      m.enqueue(pcm(500)); // more input restarts the quiet window
      vi.advanceTimersByTime(150);
      expect(MockAudioContext.instances).toHaveLength(0);
      vi.advanceTimersByTime(50);
      const ctx = MockAudioContext.instances[0];
      expect(ctx.sources).toHaveLength(2);

      // The next reply still plays through the same, never-ended stream.
      m.enqueue(pcm(100));
      expect(ctx.sources).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("without continuous mode a short held tail waits for markStreamEnd", () => {
    vi.useFakeTimers();
    try {
      const m = new AudioPlaybackManager(24000, { prebufferMs: 200 });
      m.enqueue(pcm(500));
      vi.advanceTimersByTime(1000);
      expect(MockAudioContext.instances).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
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
    const m = new AudioPlaybackManager(24000, { prebufferMs: 0 });
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
    const m = new AudioPlaybackManager(24000, { prebufferMs: 0 });
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

  it("ignores onended from sources a flush stopped, so the next reply drains on its own audio", () => {
    const m = new AudioPlaybackManager(24000, { prebufferMs: 0 });
    m.enqueue(pcm(100));
    m.enqueue(pcm(100));
    const ctx = MockAudioContext.instances[0];
    // Browsers fire onended for stopped sources after flush(); capture the
    // handlers as the browser would have them queued.
    const staleEnded = ctx.sources.map((s) => s.onended);
    m.flush();
    expect(ctx.sources.every((s) => s.onended === null)).toBe(true);

    const finished = vi.fn();
    m.onFinished(finished);
    m.enqueue(pcm(100)); // the next reply
    m.markStreamEnd();
    for (const ended of staleEnded) ended?.();
    expect(finished).not.toHaveBeenCalled();
    expect(m.isPlaying()).toBe(true);

    ctx.sources[2].onended?.();
    expect(finished).toHaveBeenCalledTimes(1);
  });
});
