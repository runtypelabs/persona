// Tests for the Runtype hosted TTS engine and the browser-fallback wrapper.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type {
  PcmStreamPlayer,
  SpeechCallbacks,
  SpeechEngine,
  SpeechRequest,
} from "../types";
import {
  RuntypeSpeechEngine,
  type RuntypeSpeechEngineOptions,
} from "./runtype-speech-engine";
import { FallbackSpeechEngine } from "./fallback-speech-engine";

/**
 * A fake {@link PcmStreamPlayer} whose started/finished callbacks the test can
 * fire. Injected via `createPlaybackEngine` so the engine never touches a real
 * AudioContext (and so the test no longer mocks the worklet module — the engine
 * defaults to the in-bundle AudioPlaybackManager, which we substitute here).
 */
function makeFakePlayer() {
  let startedCbs: Array<() => void> = [];
  let finishedCbs: Array<() => void> = [];
  return {
    enqueue: vi.fn(),
    markStreamEnd: vi.fn(),
    flush: vi.fn(() => {
      startedCbs = [];
      finishedCbs = [];
    }),
    resume: vi.fn(),
    pause: vi.fn(),
    destroy: vi.fn(),
    onStarted: vi.fn((cb: () => void) => startedCbs.push(cb)),
    onFinished: vi.fn((cb: () => void) => finishedCbs.push(cb)),
    fireStarted: () => startedCbs.slice().forEach((c) => c()),
    fireFinished: () => finishedCbs.slice().forEach((c) => c()),
  };
}

/** Yield to the macrotask queue so the engine's async read loop fully drains. */
const settle = () => new Promise((r) => setTimeout(r, 0));

/** A fetch Response stub that streams the given chunks then ends. */
function streamingResponse(chunks: Uint8Array[]) {
  let i = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () =>
          i < chunks.length
            ? { done: false, value: chunks[i++] }
            : { done: true, value: undefined },
        cancel: async () => {},
      }),
    },
  };
}

describe("RuntypeSpeechEngine", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let player: ReturnType<typeof makeFakePlayer>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
    player = makeFakePlayer();
  });

  /** Build an engine whose playback is the injected fake (no AudioContext). */
  const makeEngine = (opts: Partial<RuntypeSpeechEngineOptions> = {}) =>
    new RuntypeSpeechEngine({
      host: "https://api.runtype.com",
      agentId: "agent_123",
      clientToken: "ct_live_abc",
      createPlaybackEngine: () => player as unknown as PcmStreamPlayer,
      ...opts,
    });

  afterEach(() => {
    delete (globalThis as unknown as { fetch?: unknown }).fetch;
  });

  it("POSTs to /v1/agents/:id/speak with bearer auth and pcm body", async () => {
    fetchMock.mockResolvedValue(streamingResponse([new Uint8Array([1, 2, 3, 4])]));
    const engine = makeEngine({ host: "https://api.runtype.com/" });

    engine.speak({ text: "hello there" }, {});
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    // Trailing slash on host must not double up.
    expect(url).toBe("https://api.runtype.com/v1/agents/agent_123/speak");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer ct_live_abc");
    expect(JSON.parse(init.body)).toEqual({
      text: "hello there",
      voice: undefined,
      format: "pcm",
    });
  });

  it("streams chunks into the player and marks stream end", async () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4]);
    fetchMock.mockResolvedValue(streamingResponse([a, b]));
    const engine = makeEngine();

    engine.speak({ text: "hi" }, {});
    await settle();

    expect(player.enqueue).toHaveBeenCalledTimes(2);
    expect(player.enqueue).toHaveBeenNthCalledWith(1, a);
    expect(player.enqueue).toHaveBeenNthCalledWith(2, b);
    expect(player.markStreamEnd).toHaveBeenCalledTimes(1);
  });

  it("drives onStart/onEnd from the player, not chunk arrival", async () => {
    fetchMock.mockResolvedValue(streamingResponse([new Uint8Array([1])]));
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const engine = makeEngine();

    engine.speak({ text: "hi" }, { onStart, onEnd });
    await settle();

    expect(onStart).not.toHaveBeenCalled();
    player.fireStarted();
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();
    player.fireFinished();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("sends the request voice when provided, else the engine default", async () => {
    fetchMock.mockResolvedValue(streamingResponse([]));
    const engine = makeEngine({ voice: "default-voice" });

    engine.speak({ text: "x", voice: "request-voice" }, {});
    await settle();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).voice).toBe("request-voice");

    engine.speak({ text: "y" }, {});
    await settle();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).voice).toBe("default-voice");
  });

  it("reports a descriptive error on a non-OK response", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      body: null,
      json: async () => ({ error: "Invalid or expired client token." }),
    });
    const onError = vi.fn();
    const optsOnError = vi.fn();
    const engine = makeEngine({ clientToken: "bad", onError: optsOnError });

    engine.speak({ text: "hi" }, { onError });
    await settle();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toContain("Invalid or expired");
    expect(optsOnError).toHaveBeenCalledTimes(1);
  });

  it("ignores callbacks from a superseded speak()", async () => {
    fetchMock.mockResolvedValue(streamingResponse([new Uint8Array([1])]));
    const firstEnd = vi.fn();
    const engine = makeEngine();

    engine.speak({ text: "first" }, { onEnd: firstEnd });
    engine.speak({ text: "second" }, {}); // supersedes the first
    await settle();

    // The first request's onEnd must not fire even if its (stale) finish lands.
    player.fireFinished();
    expect(firstEnd).not.toHaveBeenCalled();
  });
});

/** A scriptable SpeechEngine that exposes the callbacks handed to speak(). */
function fakeEngine(id: string) {
  let cbs: SpeechCallbacks = {};
  return {
    id,
    supportsPause: true,
    speak: vi.fn((_req: SpeechRequest, c: SpeechCallbacks) => {
      cbs = c;
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
    emitStart: () => cbs.onStart?.(),
    emitEnd: () => cbs.onEnd?.(),
    emitError: (e: Error) => cbs.onError?.(e),
  };
}

describe("FallbackSpeechEngine", () => {
  it("falls back to the secondary engine when the primary fails before audio", () => {
    const primary = fakeEngine("primary");
    const fallback = fakeEngine("fallback");
    const onFallback = vi.fn();
    const engine = new FallbackSpeechEngine(
      primary as unknown as SpeechEngine,
      fallback as unknown as SpeechEngine,
      { onFallback },
    );
    const onError = vi.fn();
    const req: SpeechRequest = { text: "hi" };

    engine.speak(req, { onError });
    primary.emitError(new Error("no endpoint"));

    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(fallback.speak).toHaveBeenCalledTimes(1);
    expect(fallback.speak.mock.calls[0][0]).toBe(req);
    expect(onError).not.toHaveBeenCalled();
  });

  it("surfaces a failure that happens after playback has started", () => {
    const primary = fakeEngine("primary");
    const fallback = fakeEngine("fallback");
    const engine = new FallbackSpeechEngine(
      primary as unknown as SpeechEngine,
      fallback as unknown as SpeechEngine,
    );
    const onError = vi.fn();

    engine.speak({ text: "hi" }, { onError });
    primary.emitStart();
    primary.emitError(new Error("mid-stream drop"));

    expect(fallback.speak).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe("mid-stream drop");
  });

  it("routes pause/resume/stop to the active engine", () => {
    const primary = fakeEngine("primary");
    const fallback = fakeEngine("fallback");
    const engine = new FallbackSpeechEngine(
      primary as unknown as SpeechEngine,
      fallback as unknown as SpeechEngine,
    );

    // Before any failure, the primary is active.
    engine.speak({ text: "hi" }, {});
    engine.pause();
    expect(primary.pause).toHaveBeenCalledTimes(1);
    expect(fallback.pause).not.toHaveBeenCalled();

    // After a pre-start failure the fallback becomes active.
    primary.emitError(new Error("fail"));
    engine.resume();
    engine.stop();
    expect(fallback.resume).toHaveBeenCalledTimes(1);
    expect(fallback.stop).toHaveBeenCalledTimes(1);
    expect(primary.resume).not.toHaveBeenCalled();
  });

  it("destroys both wrapped engines", () => {
    const primary = fakeEngine("primary");
    const fallback = fakeEngine("fallback");
    const engine = new FallbackSpeechEngine(
      primary as unknown as SpeechEngine,
      fallback as unknown as SpeechEngine,
    );
    engine.destroy();
    expect(primary.destroy).toHaveBeenCalledTimes(1);
    expect(fallback.destroy).toHaveBeenCalledTimes(1);
  });
});
