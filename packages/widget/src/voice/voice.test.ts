// Voice SDK Tests
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { VoiceConfig, VoiceDelegationResult, VoiceSessionBridge } from '../types';
import { RuntypeVoiceProvider, buildCallContext } from './runtype-voice-provider';
import { BrowserVoiceProvider } from './browser-voice-provider';
import { createVoiceProvider, createBestAvailableVoiceProvider, isVoiceSupported } from './voice-factory';

// Mock window object for browser tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockWindow: any = {
  SpeechRecognition: undefined,
  webkitSpeechRecognition: undefined
};

beforeAll(() => {
  // @ts-ignore
  global.window = mockWindow;
});

afterAll(() => {
  // @ts-ignore
  delete global.window;
});

function mockBrowserSupport(supported: boolean) {
  if (supported) {
    mockWindow.SpeechRecognition = class {};
    mockWindow.webkitSpeechRecognition = class {};
  } else {
    delete mockWindow.SpeechRecognition;
    delete mockWindow.webkitSpeechRecognition;
  }
}

/** Minimal VoiceProvider-shaped object for the bring-your-own (`custom`) tests. */
function makeFakeProvider() {
  return {
    type: 'custom' as const,
    connect: async () => {},
    disconnect: async () => {},
    startListening: async () => {},
    stopListening: async () => {},
    onResult: () => {},
    onError: () => {},
    onStatusChange: () => {},
  };
}

describe('BrowserVoiceProvider', () => {
  it('should check browser support', () => {
    // Test supported
    mockBrowserSupport(true);
    expect(BrowserVoiceProvider.isSupported()).toBe(true);
    
    // Test unsupported
    mockBrowserSupport(false);
    expect(BrowserVoiceProvider.isSupported()).toBe(false);
  });
});

describe('Voice Factory', () => {
  it('should create Runtype provider', () => {
    const config: VoiceConfig = {
      type: 'runtype',
      runtype: {
        agentId: 'test-agent',
        clientToken: 'test-token'
      }
    };
    
    const provider = createVoiceProvider(config);
    expect(provider).toBeInstanceOf(RuntypeVoiceProvider);
    expect(provider.type).toBe('runtype');
  });
  
  it('should create Browser provider when supported', () => {
    // Mock browser support
    mockBrowserSupport(true);
    
    const config: VoiceConfig = {
      type: 'browser',
      browser: {
        language: 'en-US'
      }
    };
    
    const provider = createVoiceProvider(config);
    expect(provider).toBeInstanceOf(BrowserVoiceProvider);
    expect(provider.type).toBe('browser');
  });
  
  it('should throw error for unsupported browser provider', () => {
    // Mock no browser support
    mockBrowserSupport(false);
    
    const config: VoiceConfig = {
      type: 'browser'
    };
    
    expect(() => createVoiceProvider(config)).toThrow('Browser speech recognition not supported');
  });
  
  it('should throw when a custom provider is configured without `custom`', () => {
    const config: VoiceConfig = {
      type: 'custom'
    };

    expect(() => createVoiceProvider(config)).toThrow('requires a `custom` provider');
  });

  it('should return a bring-your-own custom provider instance', () => {
    const byo = makeFakeProvider();
    const provider = createVoiceProvider({ type: 'custom', custom: byo });
    expect(provider).toBe(byo);
  });

  it('should resolve a custom provider factory', () => {
    const byo = makeFakeProvider();
    let calls = 0;
    const provider = createVoiceProvider({
      type: 'custom',
      custom: () => {
        calls += 1;
        return byo;
      },
    });
    expect(provider).toBe(byo);
    expect(calls).toBe(1);
  });

  it('should throw when a custom factory returns a non-provider', () => {
    const config = {
      type: 'custom' as const,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      custom: (() => ({})) as any,
    };
    expect(() => createVoiceProvider(config)).toThrow('must be a VoiceProvider');
  });

  it('should throw error for unknown provider type', () => {
    const config = {
      type: 'unknown' as any
    };
    
    expect(() => createVoiceProvider(config)).toThrow('Unknown voice provider type: unknown');
  });
});

describe('Best Available Voice Provider', () => {
  it('should prefer Runtype when configured', () => {
    // Mock no browser support
    mockBrowserSupport(false);
    
    const config = {
      type: 'runtype' as const,
      runtype: {
        agentId: 'test-agent',
        clientToken: 'test-token'
      }
    };
    
    const provider = createBestAvailableVoiceProvider(config);
    expect(provider).toBeInstanceOf(RuntypeVoiceProvider);
  });
  
  it('should fall back to browser when Runtype not configured', () => {
    // Mock browser support
    mockBrowserSupport(true);
    
    const provider = createBestAvailableVoiceProvider();
    expect(provider).toBeInstanceOf(BrowserVoiceProvider);
  });
  
  it('should throw error when no providers available', () => {
    // Mock no browser support
    mockBrowserSupport(false);
    
    expect(() => createBestAvailableVoiceProvider()).toThrow('No supported voice providers available');
  });
});

describe('Voice Support Check', () => {
  it('should return true when voice is supported', () => {
    // Mock browser support
    mockBrowserSupport(true);
    
    expect(isVoiceSupported()).toBe(true);
  });
  
  it('should return true when Runtype is configured', () => {
    // Mock no browser support
    mockBrowserSupport(false);
    
    const config = {
      type: 'runtype' as const,
      runtype: {
        agentId: 'test-agent',
        clientToken: 'test-token'
      }
    };
    
    expect(isVoiceSupported(config)).toBe(true);
  });
  
  it('should return false when no voice support available', () => {
    // Mock no browser support
    mockBrowserSupport(false);

    expect(isVoiceSupported()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Realtime streaming protocol (RuntypeVoiceProvider rewrite)
// ---------------------------------------------------------------------------

const WS_OPEN = 1;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = WS_OPEN;
  static instances: MockWebSocket[] = [];

  url: string;
  protocols: string | string[] | undefined;
  /** Negotiated subprotocol, set by the test before `triggerOpen()`. */
  protocol = '';
  binaryType = '';
  readyState = 0;
  sent: Array<ArrayBuffer | string> = [];
  closeCalls: Array<{ code?: number; reason?: string }> = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number; reason?: string; wasClean: boolean }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    MockWebSocket.instances.push(this);
  }

  send(data: ArrayBuffer | string) {
    this.sent.push(data);
  }

  close(code?: number, reason?: string) {
    this.readyState = 3;
    this.closeCalls.push({ code, reason });
    this.onclose?.({ code: code ?? 1000, reason, wasClean: (code ?? 1000) === 1000 });
  }

  // --- test triggers ---
  triggerOpen() {
    this.readyState = WS_OPEN;
    this.onopen?.();
  }
  triggerMessage(data: unknown) {
    this.onmessage?.({ data });
  }
  triggerClose(code: number, reason?: string) {
    this.readyState = 3;
    this.onclose?.({ code, reason, wasClean: code === 1000 });
  }
  triggerError() {
    this.onerror?.({});
  }
}

class MockAudioContext {
  state = 'running';
  destination = {};
  sampleRate: number;
  constructor(opts?: { sampleRate?: number }) {
    this.sampleRate = opts?.sampleRate ?? 44100;
  }
  async resume() {
    this.state = 'running';
  }
  async close() {
    this.state = 'closed';
  }
  createMediaStreamSource() {
    return { connect() {}, disconnect() {} };
  }
  createScriptProcessor() {
    const node = { connect() {}, disconnect() {}, onaudioprocess: null as unknown };
    MockAudioContext.lastProcessor = node;
    return node;
  }
  static lastProcessor: { onaudioprocess: unknown } | null = null;
}

/** Feed the capture graph one buffer of samples. */
function pumpCapture(samples: number[]): void {
  const handler = MockAudioContext.lastProcessor?.onaudioprocess as
    | ((e: unknown) => void)
    | null;
  handler?.({
    inputBuffer: { getChannelData: () => Float32Array.from(samples) },
  });
}

/** `n` samples of a constant amplitude, which makes RMS exactly that value. */
const constantBuffer = (amplitude: number, n = 128): number[] =>
  Array.from({ length: n }, (_, i) => (i % 2 === 0 ? amplitude : -amplitude));

function makeStream() {
  const track = { stopped: false, stop() { track.stopped = true; } };
  return { stream: { getTracks: () => [track] }, track };
}

function makeFakeEngine() {
  const engine = {
    enqueued: [] as Uint8Array[],
    streamEnded: false,
    flushed: false,
    destroyed: false,
    finishedCb: null as null | (() => void),
    continuous: undefined as boolean | undefined,
    setContinuousMode(enabled: boolean) { engine.continuous = enabled; },
    enqueue(p: Uint8Array) { engine.enqueued.push(p); },
    markStreamEnd() { engine.streamEnded = true; },
    flush() { engine.flushed = true; },
    onFinished(cb: () => void) { engine.finishedCb = cb; },
    destroy() { engine.destroyed = true; },
  };
  return engine;
}

/** Build a WAV-wrapped frame: 44-byte RIFF header + the given PCM bytes. */
function makeWavFrame(pcmBytes: number[]): ArrayBuffer {
  const buf = new ArrayBuffer(44 + pcmBytes.length);
  const view = new DataView(buf);
  view.setUint32(0, 0x52494646, false); // "RIFF"
  new Uint8Array(buf).set(pcmBytes, 44);
  return buf;
}

describe('RuntypeVoiceProvider (realtime streaming)', () => {
  let getUserMedia: ReturnType<typeof vi.fn>;
  let currentStream: ReturnType<typeof makeStream>;

  beforeEach(() => {
    MockWebSocket.instances = [];
    currentStream = makeStream();
    getUserMedia = vi.fn(async () => currentStream.stream);

    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    (globalThis as any).window.AudioContext = MockAudioContext;
    (globalThis as any).window.webkitAudioContext = MockAudioContext;
    (globalThis as any).window.location = { protocol: 'https:' };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as any).window.AudioContext;
    delete (globalThis as any).window.webkitAudioContext;
    delete (globalThis as any).window.location;
  });

  const baseConfig = () => ({
    agentId: 'a1',
    clientToken: 'ct_secret',
    host: 'https://api.example.com',
  });

  const lastWs = () => MockWebSocket.instances[MockWebSocket.instances.length - 1];

  it('connects to /voice with subprotocol auth and arraybuffer (no token in URL)', async () => {
    const provider = new RuntypeVoiceProvider(baseConfig());
    await provider.startListening();

    const ws = lastWs();
    expect(ws.url).toBe('wss://api.example.com/ws/agents/a1/voice?voiceCapabilities=full-duplex-v1');
    expect(ws.protocols).toEqual(['runtype.bearer', 'ct_secret']);
    expect(ws.binaryType).toBe('arraybuffer');
    expect(ws.url).not.toContain('token=');
    expect(ws.url).not.toContain('ct_secret');
  });

  it.each([
    ['https://api.example.com', 'wss://api.example.com'],
    ['http://localhost:8787', 'ws://localhost:8787'],
    ['wss://api.example.com', 'wss://api.example.com'],
    ['api.example.com', 'wss://api.example.com'], // bare host → window.location.protocol
  ])('derives ws base %s -> %s', async (host, expected) => {
    const provider = new RuntypeVoiceProvider({ ...baseConfig(), host });
    await provider.startListening();
    expect(lastWs().url).toBe(`${expected}/ws/agents/a1/voice?voiceCapabilities=full-duplex-v1`);
  });

  it('declares full duplex without the browser-protocol param that 503s Cloudflare agents', async () => {
    const provider = new RuntypeVoiceProvider(baseConfig());
    await provider.startListening();
    const url = new URL(lastWs().url);
    expect(url.searchParams.get('voiceCapabilities')).toBe('full-duplex-v1');
    expect(url.searchParams.has('voiceProtocol')).toBe(false);
    expect([...url.searchParams.keys()]).toEqual(['voiceCapabilities']);
  });

  it('publishes a 0..1 capture level from the buffer it already sends', async () => {
    const levels: number[] = [];
    const provider = new RuntypeVoiceProvider(baseConfig());
    provider.onLevel((level) => levels.push(level));
    await provider.startListening();
    lastWs().triggerOpen();

    // RMS of a constant-magnitude buffer is that magnitude; the provider
    // scales it so a normal speaking voice lands mid-range.
    pumpCapture(constantBuffer(0.1));
    expect(levels).toHaveLength(1);
    expect(levels[0]).toBeCloseTo(0.4, 5);

    pumpCapture(constantBuffer(0));
    expect(levels[1]).toBe(0);
  });

  it('clamps a loud buffer to 1 rather than overshooting', async () => {
    const levels: number[] = [];
    const provider = new RuntypeVoiceProvider(baseConfig());
    provider.onLevel((level) => levels.push(level));
    await provider.startListening();
    lastWs().triggerOpen();

    pumpCapture(constantBuffer(0.9));
    expect(levels[0]).toBe(1);
  });

  it('still sends audio when nothing subscribed to the level', async () => {
    const provider = new RuntypeVoiceProvider(baseConfig());
    await provider.startListening();
    const ws = lastWs();
    ws.triggerOpen();
    const before = ws.sent.length;
    pumpCapture(constantBuffer(0.2));
    expect(ws.sent.length).toBe(before + 1);
  });

  it('drives status + onTranscript from control frames', async () => {
    const statuses: string[] = [];
    const transcripts: Array<[string, string, boolean]> = [];
    const provider = new RuntypeVoiceProvider(baseConfig());
    provider.onStatusChange((s) => statuses.push(s));
    provider.onTranscript((role, text, isFinal) => transcripts.push([role, text, isFinal]));

    await provider.startListening();
    lastWs().triggerOpen();
    lastWs().triggerMessage(JSON.stringify({ type: 'transcript_interim', text: 'hel' }));
    lastWs().triggerMessage(JSON.stringify({ type: 'transcript_final', role: 'user', text: 'hello' }));
    lastWs().triggerMessage(JSON.stringify({ type: 'transcript_final', role: 'assistant', text: 'hi there' }));

    expect(transcripts).toEqual([
      ['user', 'hel', false],
      ['user', 'hello', true],
      ['assistant', 'hi there', true],
    ]);
    expect(statuses).toContain('listening'); // ws open + interim
    expect(statuses).toContain('processing'); // user final
    expect(statuses).toContain('speaking'); // assistant final
  });

  it('strips the WAV header, enqueues raw PCM, and drains on audio_end', async () => {
    const engine = makeFakeEngine();
    const provider = new RuntypeVoiceProvider({ ...baseConfig(), createPlaybackEngine: () => engine });
    await provider.startListening();
    lastWs().triggerOpen();

    lastWs().triggerMessage(makeWavFrame([1, 2, 3, 4]));
    expect(engine.enqueued).toHaveLength(1);
    expect(Array.from(engine.enqueued[0])).toEqual([1, 2, 3, 4]); // 44-byte header stripped

    lastWs().triggerMessage(JSON.stringify({ type: 'audio_end' }));
    expect(engine.streamEnded).toBe(true);
  });

  it('treats a non-WAV binary frame as raw PCM', async () => {
    const engine = makeFakeEngine();
    const provider = new RuntypeVoiceProvider({ ...baseConfig(), createPlaybackEngine: () => engine });
    await provider.startListening();
    lastWs().triggerOpen();

    const raw = new Uint8Array([9, 8, 7, 6]).buffer;
    lastWs().triggerMessage(raw);
    expect(Array.from(engine.enqueued[0])).toEqual([9, 8, 7, 6]);
  });

  it('emits onMetrics with camelCase from the snake_case frame', async () => {
    const metrics: unknown[] = [];
    const provider = new RuntypeVoiceProvider(baseConfig());
    provider.onMetrics((m) => metrics.push(m));
    await provider.startListening();
    lastWs().triggerOpen();
    // Raw JSON string: the wire frame is snake_case (decoded to camelCase by
    // the provider); a literal avoids the no-snake_case-property lint rule.
    lastWs().triggerMessage(
      '{"type":"metrics","llm_ms":120,"tts_ms":80,"first_audio_ms":200,"total_ms":400}',
    );
    expect(metrics).toEqual([{ llmMs: 120, ttsMs: 80, firstAudioMs: 200, totalMs: 400 }]);
  });

  it('reports barge-in semantics while the call is live', async () => {
    const provider = new RuntypeVoiceProvider(baseConfig());
    expect(provider.getInterruptionMode()).toBe('barge-in');
    expect(provider.isBargeInActive()).toBe(false);
    await provider.startListening();
    expect(provider.isBargeInActive()).toBe(true);
    await provider.stopListening();
    expect(provider.isBargeInActive()).toBe(false);
  });

  it('hangs up cleanly and drops late frames after teardown', async () => {
    const engine = makeFakeEngine();
    const provider = new RuntypeVoiceProvider({ ...baseConfig(), createPlaybackEngine: () => engine });
    await provider.startListening();
    lastWs().triggerOpen();
    const ws = lastWs();

    await provider.stopListening();

    expect(ws.closeCalls).toEqual([{ code: 1000, reason: 'client ended call' }]);
    expect(currentStream.track.stopped).toBe(true);
    expect(engine.destroyed).toBe(true);

    // A frame arriving after teardown is dropped by the generation guard.
    const before = engine.enqueued.length;
    ws.triggerMessage(makeWavFrame([1, 2]));
    expect(engine.enqueued.length).toBe(before);
  });

  it('startListening is idempotent while a call is live', async () => {
    const provider = new RuntypeVoiceProvider(baseConfig());
    await provider.startListening();
    await provider.startListening();
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('returns to listening when playback drains (call stays open)', async () => {
    const engine = makeFakeEngine();
    const statuses: string[] = [];
    const provider = new RuntypeVoiceProvider({ ...baseConfig(), createPlaybackEngine: () => engine });
    provider.onStatusChange((s) => statuses.push(s));
    await provider.startListening();
    lastWs().triggerOpen();
    lastWs().triggerMessage(makeWavFrame([1, 2])); // → speaking
    statuses.length = 0;
    engine.finishedCb?.(); // playback drained
    expect(statuses).toEqual(['listening']);
  });

  it('re-arms the one-shot drain callback so later replies also return to listening', async () => {
    const engine = makeFakeEngine();
    const statuses: string[] = [];
    const provider = new RuntypeVoiceProvider({ ...baseConfig(), createPlaybackEngine: () => engine });
    provider.onStatusChange((s) => statuses.push(s));
    await provider.startListening();
    lastWs().triggerOpen();

    lastWs().triggerMessage(makeWavFrame([1, 2]));
    const firstDrain = engine.finishedCb;
    engine.finishedCb = null;
    firstDrain?.(); // engines clear their callbacks once they fire
    lastWs().triggerMessage(makeWavFrame([3, 4]));
    const rearmed = engine.finishedCb as (() => void) | null;
    expect(rearmed).toBeTypeOf('function');
    statuses.length = 0;
    rearmed?.();
    expect(statuses).toEqual(['listening']);
  });

  it('passes no turn metadata on the legacy transcript frames', async () => {
    const calls: unknown[][] = [];
    const provider = new RuntypeVoiceProvider(baseConfig());
    provider.onTranscript((...args) => calls.push(args));
    await provider.startListening();
    lastWs().triggerOpen();
    lastWs().triggerMessage(JSON.stringify({ type: 'transcript_final', role: 'user', text: 'hi' }));
    expect(calls).toHaveLength(1);
    expect(calls[0].slice(0, 3)).toEqual(['user', 'hi', true]);
    expect(calls[0][3]).toBeUndefined();
  });

  describe('full duplex (speech-to-speech)', () => {
    const PCM_100MS = 4800; // 2400 samples @ 24 kHz, 16-bit

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    async function startFullDuplexCall() {
      const engine = makeFakeEngine();
      const statuses: string[] = [];
      const transcripts: unknown[][] = [];
      const provider = new RuntypeVoiceProvider({ ...baseConfig(), createPlaybackEngine: () => engine });
      provider.onStatusChange((s) => statuses.push(s));
      provider.onTranscript((...args) => transcripts.push(args));
      await provider.startListening();
      const ws = lastWs();
      ws.triggerOpen();
      ws.triggerMessage(
        JSON.stringify({ type: 'session_config', interruptionMode: 'barge-in', speechMode: 'speech_to_speech' }),
      );
      statuses.length = 0;
      return { engine, statuses, transcripts, provider, ws };
    }

    const pcm = (bytes: number) => new Uint8Array(bytes).buffer;
    const sentJson = (ws: MockWebSocket) =>
      (ws.sent as unknown[]).filter((d): d is string => typeof d === 'string').map((d) => JSON.parse(d));

    it('puts the engine in continuous mode and keeps it across the follow-up session_config', async () => {
      const { engine, provider, ws } = await startFullDuplexCall();
      expect(engine.continuous).toBe(true);
      ws.triggerMessage(JSON.stringify({ type: 'session_config', interruptionMode: 'barge-in' }));
      expect(engine.continuous).toBe(true);
      provider.stopPlayback(); // still speech-to-speech: the stop is sent to the server
      expect(sentJson(ws)).toEqual([{ type: 'cancel' }]);
    });

    it('forwards transcript_update with its turnId and ignores frames without one', async () => {
      const { transcripts, ws } = await startFullDuplexCall();
      ws.triggerMessage(JSON.stringify({ type: 'transcript_update', role: 'user', text: 'hel', turnId: 'u1', final: false }));
      ws.triggerMessage(JSON.stringify({ type: 'transcript_update', role: 'assistant', text: 'Hi', turnId: 'a1', final: true }));
      ws.triggerMessage(JSON.stringify({ type: 'transcript_update', role: 'user', text: 'x' }));
      expect(transcripts).toEqual([
        ['user', 'hel', false, { turnId: 'u1' }],
        ['assistant', 'Hi', true, { turnId: 'a1' }],
      ]);
    });

    it('plays continuously: releases speaking after the queued audio, never ends the stream', async () => {
      const { engine, statuses, ws } = await startFullDuplexCall();
      ws.triggerMessage(pcm(PCM_100MS));
      ws.triggerMessage(pcm(PCM_100MS));
      expect(statuses).toEqual(['speaking']);
      expect(engine.enqueued).toHaveLength(2);

      vi.advanceTimersByTime(450); // 200ms of audio + 300ms grace not yet elapsed
      expect(statuses).toEqual(['speaking']);
      vi.advanceTimersByTime(100);
      expect(statuses).toEqual(['speaking', 'listening']);
      expect(engine.streamEnded).toBe(false);

      // The next reply's audio plays through the same, never-ended stream.
      ws.triggerMessage(pcm(PCM_100MS));
      expect(engine.enqueued).toHaveLength(3);
      expect(statuses).toEqual(['speaking', 'listening', 'speaking']);
    });

    it('shows processing during a delegation and returns to listening after it', async () => {
      const { statuses, ws } = await startFullDuplexCall();
      ws.triggerMessage(JSON.stringify({ type: 'delegation_started', turnId: 'd1' }));
      expect(statuses).toEqual(['processing']);
      ws.triggerMessage(JSON.stringify({ type: 'delegation_completed', turnId: 'd1' }));
      expect(statuses).toEqual(['processing', 'listening']);
    });

    it('keeps speaking through a delegation that starts mid-reply, then shows processing', async () => {
      const { statuses, ws } = await startFullDuplexCall();
      ws.triggerMessage(pcm(PCM_100MS));
      ws.triggerMessage(JSON.stringify({ type: 'delegation_started', turnId: 'd1' }));
      expect(statuses).toEqual(['speaking']);
      vi.advanceTimersByTime(1000);
      expect(statuses).toEqual(['speaking', 'processing']);
      ws.triggerMessage(JSON.stringify({ type: 'delegation_completed', turnId: 'd1' }));
      expect(statuses).toEqual(['speaking', 'processing', 'listening']);
    });

    it('flushes playback immediately on audio_clear and returns to listening', async () => {
      const { engine, statuses, ws } = await startFullDuplexCall();
      ws.triggerMessage(pcm(PCM_100MS * 10));
      ws.triggerMessage(JSON.stringify({ type: 'audio_clear' }));
      expect(engine.flushed).toBe(true);
      expect(statuses).toEqual(['speaking', 'listening']);
      vi.advanceTimersByTime(5000); // the cleared reply's drain timer is gone
      expect(statuses).toEqual(['speaking', 'listening']);
      ws.triggerMessage(pcm(PCM_100MS));
      expect(statuses).toEqual(['speaking', 'listening', 'speaking']);
    });

    it('stopPlayback cancels server-side and drops the reply until audio_clear', async () => {
      const { engine, statuses, transcripts, provider, ws } = await startFullDuplexCall();
      ws.triggerMessage(pcm(PCM_100MS));
      provider.stopPlayback();
      expect(sentJson(ws)).toEqual([{ type: 'cancel' }]);
      expect(engine.flushed).toBe(true);
      expect(statuses).toEqual(['speaking', 'listening']);

      const enqueued = engine.enqueued.length;
      ws.triggerMessage(pcm(PCM_100MS));
      ws.triggerMessage(JSON.stringify({ type: 'transcript_update', role: 'assistant', text: 'late', turnId: 'a1', final: true }));
      ws.triggerMessage(JSON.stringify({ type: 'transcript_update', role: 'user', text: 'next', turnId: 'u2', final: false }));
      expect(engine.enqueued).toHaveLength(enqueued);
      expect(transcripts).toEqual([['user', 'next', false, { turnId: 'u2' }]]);

      ws.triggerMessage(JSON.stringify({ type: 'audio_clear' }));
      ws.triggerMessage(pcm(PCM_100MS));
      expect(engine.enqueued).toHaveLength(enqueued + 1);
    });

    it('accepts audio again if the cancel acknowledgement never arrives', async () => {
      const { engine, provider, ws } = await startFullDuplexCall();
      provider.stopPlayback();
      vi.advanceTimersByTime(2000);
      ws.triggerMessage(pcm(PCM_100MS));
      expect(engine.enqueued).toHaveLength(1);
    });

    it('leaves the legacy path without a drain timer or a server cancel', async () => {
      const engine = makeFakeEngine();
      const provider = new RuntypeVoiceProvider({ ...baseConfig(), createPlaybackEngine: () => engine });
      await provider.startListening();
      const ws = lastWs();
      ws.triggerOpen();
      ws.triggerMessage(pcm(PCM_100MS));
      expect(vi.getTimerCount()).toBe(0);
      provider.stopPlayback();
      expect(sentJson(ws)).toEqual([]);
      expect(engine.continuous).toBeUndefined();
    });

    it('forgets full-duplex state on hang-up', async () => {
      const { provider, ws } = await startFullDuplexCall();
      ws.triggerMessage(pcm(PCM_100MS));
      await provider.stopListening();
      expect(vi.getTimerCount()).toBe(0);

      await provider.startListening(); // next call starts in the classic mode
      const next = lastWs();
      next.triggerOpen();
      provider.stopPlayback();
      expect(sentJson(next)).toEqual([]);
    });

    it('passes transcript startMs/endMs through as metadata', async () => {
      const { transcripts, ws } = await startFullDuplexCall();
      ws.triggerMessage(
        JSON.stringify({ type: 'transcript_update', role: 'user', text: 'hi', turnId: 'u1', final: true, startMs: 1200, endMs: 1800 }),
      );
      expect(transcripts).toEqual([['user', 'hi', true, { turnId: 'u1', startMs: 1200, endMs: 1800 }]]);
    });

    describe('client delegation', () => {
      const flush = async () => {
        for (let i = 0; i < 10; i++) await Promise.resolve();
      };

      function makeBridge(history: Array<{ role: 'user' | 'assistant'; content: string }> = []) {
        const calls: Array<{ turnId: string; userText: string }> = [];
        const pending: Array<(r: VoiceDelegationResult) => void> = [];
        const bridge: VoiceSessionBridge = {
          getHistory: () => history,
          runDelegatedTurn: (request) => {
            calls.push(request);
            return new Promise((resolve) => pending.push(resolve));
          },
        };
        return { bridge, calls, pending };
      }

      async function startDelegatedCall(
        extra: Partial<NonNullable<VoiceConfig['runtype']>> = {},
        sessionConfig: Record<string, unknown> = { clientDelegation: true, contextFrames: true },
        history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
      ) {
        const engine = makeFakeEngine();
        const transcripts: unknown[][] = [];
        const { bridge, calls, pending } = makeBridge(history);
        const provider = new RuntypeVoiceProvider({ ...baseConfig(), ...extra, createPlaybackEngine: () => engine });
        provider.setSessionBridge(bridge);
        provider.onTranscript((...args) => transcripts.push(args));
        await provider.startListening();
        const ws = lastWs();
        ws.triggerOpen();
        ws.triggerMessage(
          JSON.stringify({ type: 'session_config', interruptionMode: 'barge-in', speechMode: 'speech_to_speech', ...sessionConfig }),
        );
        await flush();
        return { provider, ws, transcripts, calls, pending };
      }

      const update = (role: string, text: string, turnId: string) =>
        JSON.stringify({ type: 'transcript_update', role, text, turnId, final: true });

      it('declares client-delegation only with a bridge and the switch on', async () => {
        const { ws } = await startDelegatedCall();
        expect(ws.url).toBe(
          'wss://api.example.com/ws/agents/a1/voice?voiceCapabilities=full-duplex-v1&clientCapabilities=client-delegation',
        );
        await startDelegatedCall({ clientDelegation: false });
        expect(lastWs().url).toBe('wss://api.example.com/ws/agents/a1/voice?voiceCapabilities=full-duplex-v1');
        const plain = new RuntypeVoiceProvider(baseConfig()); // no session bridge
        await plain.startListening();
        expect(lastWs().url).toBe('wss://api.example.com/ws/agents/a1/voice?voiceCapabilities=full-duplex-v1');
      });

      it('sends one context frame with the history and host context once confirmed', async () => {
        const { ws } = await startDelegatedCall(
          { callContext: async () => 'Visitor is on /pricing.' },
          { clientDelegation: true, contextFrames: true },
          [
            { role: 'user', content: 'Hi there' },
            { role: 'assistant', content: 'Hello!\n\nHow can I help?' },
          ],
        );
        expect(sentJson(ws)).toEqual([
          {
            type: 'context',
            text: 'Conversation so far:\nUser: Hi there\nAssistant: Hello! How can I help?\n\nVisitor is on /pricing.',
          },
        ]);
        ws.triggerMessage(JSON.stringify({ type: 'session_config', interruptionMode: 'barge-in' }));
        await flush();
        expect(sentJson(ws)).toHaveLength(1);
      });

      it('sends context on contextFrames alone, with delegation off', async () => {
        const { ws, calls } = await startDelegatedCall(
          { clientDelegation: false, callContext: 'On /docs.' },
          { contextFrames: true },
          [{ role: 'user', content: 'Hi' }],
        );
        expect(lastWs().url).not.toContain('clientCapabilities');
        expect(sentJson(ws)).toEqual([{ type: 'context', text: 'Conversation so far:\nUser: Hi\n\nOn /docs.' }]);
        ws.triggerMessage(JSON.stringify({ type: 'delegation_requested', turnId: 'd1', userText: 'x', messages: [] }));
        await flush();
        expect(calls).toEqual([]);
      });

      it('sends no context when the server does not announce contextFrames', async () => {
        const { ws } = await startDelegatedCall({ callContext: 'On /docs.' }, { clientDelegation: true }, [
          { role: 'user', content: 'Hi' },
        ]);
        expect(sentJson(ws)).toEqual([]);
      });

      it('skips the context frame when there is nothing to say', async () => {
        const { ws } = await startDelegatedCall();
        expect(sentJson(ws)).toEqual([]);
      });

      it('keeps today\'s behavior when the server does not confirm delegation', async () => {
        const { ws, calls, transcripts } = await startDelegatedCall(
          { callContext: 'page context' },
          {},
          [{ role: 'user', content: 'Hi' }],
        );
        ws.triggerMessage(JSON.stringify({ type: 'delegation_requested', turnId: 'd1', userText: 'x', messages: [] }));
        ws.triggerMessage(JSON.stringify({ type: 'delegation_completed', turnId: 'd1', speak: true, text: 'Result' }));
        ws.triggerMessage(update('assistant', 'Result', 'a9'));
        await flush();
        expect(calls).toEqual([]);
        expect(sentJson(ws)).toEqual([]); // no context, no delegation_result
        expect(transcripts).toEqual([['assistant', 'Result', true, { turnId: 'a9' }]]); // no caption flag
      });

      it('runs a delegation through the bridge and answers delegation_result', async () => {
        const { ws, calls, pending } = await startDelegatedCall();
        ws.triggerMessage(
          JSON.stringify({ type: 'delegation_requested', turnId: 'd1', userText: 'Weather?', messages: [{ role: 'user', content: 'Weather?' }] }),
        );
        await flush();
        expect(calls).toEqual([{ turnId: 'd1', userText: 'Weather?' }]);
        pending[0]({ ok: true, text: 'It is **sunny**.' });
        await flush();
        expect(sentJson(ws)).toEqual([{ type: 'delegation_result', turnId: 'd1', text: 'It is **sunny**.', ok: true }]);
      });

      it('answers ok:false when the bridge fails', async () => {
        const { ws, provider } = await startDelegatedCall();
        provider.setSessionBridge({
          getHistory: () => [],
          runDelegatedTurn: () => Promise.reject(new Error('nope')),
        });
        ws.triggerMessage(JSON.stringify({ type: 'delegation_requested', turnId: 'd1', userText: 'x', messages: [] }));
        await flush();
        expect(sentJson(ws)).toEqual([{ type: 'delegation_result', turnId: 'd1', text: '', ok: false }]);
      });

      it('runs delegations one at a time', async () => {
        const { ws, calls, pending } = await startDelegatedCall();
        ws.triggerMessage(JSON.stringify({ type: 'delegation_requested', turnId: 'd1', userText: 'one', messages: [] }));
        ws.triggerMessage(JSON.stringify({ type: 'delegation_requested', turnId: 'd2', userText: 'two', messages: [] }));
        await flush();
        expect(calls.map((c) => c.turnId)).toEqual(['d1']);
        pending[0]({ ok: true, text: 'first' });
        await flush();
        expect(calls.map((c) => c.turnId)).toEqual(['d1', 'd2']);
      });

      it('marks transcripts as captions only when delegation is negotiated', async () => {
        const { ws, transcripts } = await startDelegatedCall();
        ws.triggerMessage(update('assistant', 'One moment.', 'f1'));
        expect(transcripts).toEqual([['assistant', 'One moment.', true, { turnId: 'f1', caption: true }]]);
        const legacy = await startDelegatedCall({}, {});
        legacy.ws.triggerMessage(update('assistant', 'One moment.', 'f1'));
        expect(legacy.transcripts).toEqual([['assistant', 'One moment.', true, { turnId: 'f1' }]]);
      });

      it('folds the spoken read-back of a rendered result until the next user utterance', async () => {
        const { ws, transcripts, pending } = await startDelegatedCall();
        ws.triggerMessage(update('assistant', 'Let me check.', 'f1'));
        ws.triggerMessage(JSON.stringify({ type: 'delegation_requested', turnId: 'd1', userText: 'q', messages: [] }));
        await flush();
        pending[0]({ ok: true, text: 'It is sunny.' });
        await flush();
        ws.triggerMessage(JSON.stringify({ type: 'delegation_completed', turnId: 'd1', speak: true, text: 'It is sunny.' }));
        ws.triggerMessage(update('assistant', 'Let me check. Okay.', 'f1')); // filler already showing: keeps updating
        ws.triggerMessage(update('assistant', 'It is sunny.', 'r1')); // read-back: folded
        ws.triggerMessage(update('user', 'thanks', 'u2'));
        ws.triggerMessage(update('assistant', 'You are welcome.', 'a2'));
        expect(transcripts.map((t) => t[1])).toEqual(['Let me check.', 'Let me check. Okay.', 'thanks', 'You are welcome.']);
      });

      it('keeps a late final for the pre-completion filler id and folds the rotated read-back', async () => {
        const { ws, transcripts, pending } = await startDelegatedCall();
        const partial = (role: string, text: string, turnId: string, final: boolean) =>
          JSON.stringify({ type: 'transcript_update', role, text, turnId, final });
        ws.triggerMessage(partial('assistant', " Yeah, I'll", 'f1', false));
        ws.triggerMessage(JSON.stringify({ type: 'delegation_started', turnId: 'd1' }));
        ws.triggerMessage(JSON.stringify({ type: 'delegation_requested', turnId: 'd1', userText: 'q', messages: [] }));
        await flush();
        pending[0]({ ok: true, text: 'We open at nine.' });
        await flush();
        ws.triggerMessage(JSON.stringify({ type: 'delegation_completed', turnId: 'd1', speak: true, text: 'We open at nine.' }));
        ws.triggerMessage(partial('assistant', " Yeah, I'll check.", 'f1', true)); // late final, old id
        ws.triggerMessage(partial('assistant', ' We open', 'r1', false)); // rotated id: read-back
        ws.triggerMessage(partial('assistant', ' We open at nine.', 'r1', true));
        expect(transcripts.map((t) => [t[1], t[2]])).toEqual([
          [" Yeah, I'll", false],
          [" Yeah, I'll check.", true],
        ]);
      });

      it('does not fold after a failed delegation', async () => {
        const { ws, transcripts, pending } = await startDelegatedCall();
        ws.triggerMessage(JSON.stringify({ type: 'delegation_requested', turnId: 'd1', userText: 'q', messages: [] }));
        await flush();
        pending[0]({ ok: false, text: '' });
        await flush();
        ws.triggerMessage(JSON.stringify({ type: 'delegation_completed', turnId: 'd1', speak: true, text: 'Sorry' }));
        ws.triggerMessage(update('assistant', "Sorry, I couldn't complete that.", 'r1'));
        expect(transcripts).toHaveLength(1);
      });

      it('drops a result that finishes after hang-up', async () => {
        const { ws, provider, pending } = await startDelegatedCall();
        ws.triggerMessage(JSON.stringify({ type: 'delegation_requested', turnId: 'd1', userText: 'q', messages: [] }));
        await flush();
        await provider.stopListening();
        pending[0]({ ok: true, text: 'late' });
        await flush();
        expect(sentJson(ws)).toEqual([]);
      });
    });
  });
});

describe('RuntypeVoiceProvider prewarm', () => {
  let getUserMedia: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    getUserMedia = vi.fn(async () => makeStream().stream);
    fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    vi.stubGlobal('fetch', fetchMock);
    (globalThis as any).window.AudioContext = MockAudioContext;
    (globalThis as any).window.webkitAudioContext = MockAudioContext;
    (globalThis as any).window.location = { protocol: 'https:' };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (globalThis as any).window.AudioContext;
    delete (globalThis as any).window.webkitAudioContext;
    delete (globalThis as any).window.location;
  });

  const config = (extra: Partial<NonNullable<VoiceConfig['runtype']>> = {}) => ({
    agentId: 'agent/1',
    clientToken: 'ct_secret',
    host: 'https://api.example.com',
    ...extra,
  });
  const attachConfig = (extra: Partial<NonNullable<VoiceConfig['runtype']>> = {}) =>
    config({ prewarmMode: 'attach', ...extra });
  const lastWs = () => MockWebSocket.instances[MockWebSocket.instances.length - 1];
  const openAs = (ws: MockWebSocket, protocol: string) => {
    ws.protocol = protocol;
    ws.triggerOpen();
  };

  describe("'request' mode (default)", () => {
    it('POSTs the prewarm endpoint with the bearer token and no body', () => {
      new RuntypeVoiceProvider(config()).prewarm();

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.example.com/v1/client/agents/agent%2F1/voice/prewarm');
      expect(init).toEqual({
        method: 'POST',
        headers: { Authorization: 'Bearer ct_secret' },
        keepalive: true,
      });
      expect(MockWebSocket.instances).toHaveLength(0);
    });

    it.each([
      ['http://localhost:8787', 'http://localhost:8787'],
      ['wss://api.example.com', 'https://api.example.com'],
      ['api.example.com', 'https://api.example.com'],
    ])('derives the http base from %s', (host, base) => {
      new RuntypeVoiceProvider(config({ host })).prewarm();
      expect(fetchMock.mock.calls[0][0]).toBe(`${base}/v1/client/agents/agent%2F1/voice/prewarm`);
    });

    it('fires at most once per 30s per provider', () => {
      const provider = new RuntypeVoiceProvider(config());
      provider.prewarm();
      provider.prewarm();
      vi.advanceTimersByTime(29_999);
      provider.prewarm();
      expect(fetchMock).toHaveBeenCalledOnce();
      vi.advanceTimersByTime(1);
      provider.prewarm();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('swallows rejected and throwing fetches without emitting errors or status', async () => {
      const errors: Error[] = [];
      const statuses: string[] = [];
      fetchMock.mockRejectedValueOnce(new Error('offline'));
      const provider = new RuntypeVoiceProvider(config());
      provider.onError((e) => errors.push(e));
      provider.onStatusChange((s) => statuses.push(s));
      provider.prewarm();
      await vi.advanceTimersByTimeAsync(30_000);
      fetchMock.mockImplementationOnce(() => {
        throw new Error('sync');
      });
      expect(() => provider.prewarm()).not.toThrow();
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(errors).toEqual([]);
      expect(statuses).toEqual([]);
    });

    it('does nothing without credentials or during a live call', async () => {
      new RuntypeVoiceProvider(config({ clientToken: undefined })).prewarm();
      expect(fetchMock).not.toHaveBeenCalled();

      const provider = new RuntypeVoiceProvider(config());
      await provider.startListening();
      provider.prewarm();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("'attach' mode", () => {
    it('opens the voice socket with the attach capability and subprotocol, then pings', () => {
      new RuntypeVoiceProvider(attachConfig()).prewarm();

      const ws = lastWs();
      expect(ws.url).toBe('wss://api.example.com/ws/agents/agent%2F1/voice?voiceCapabilities=full-duplex-v1&clientCapabilities=attach');
      expect(ws.protocols).toEqual(['runtype.bearer', 'runtype.attach', 'ct_secret']);
      expect(fetchMock).not.toHaveBeenCalled();
      openAs(ws, 'runtype.attach');
      expect(ws.sent).toEqual(['{"type":"ping"}']);
    });

    it('combines attach with client-delegation when a session bridge is set', () => {
      const provider = new RuntypeVoiceProvider(attachConfig());
      provider.setSessionBridge({ getHistory: () => [], runDelegatedTurn: async () => ({ ok: true, text: '' }) });
      provider.prewarm();
      expect(lastWs().url).toBe(
        'wss://api.example.com/ws/agents/agent%2F1/voice?voiceCapabilities=full-duplex-v1&clientCapabilities=attach%2Cclient-delegation',
      );
    });

    it('sends a clamped attachIdleMs when configured', () => {
      new RuntypeVoiceProvider(attachConfig({ attachIdleMs: 5_000 })).prewarm();
      expect(lastWs().url).toContain('clientCapabilities=attach&attachIdleMs=30000');
    });

    it('never attaches twice concurrently', () => {
      const provider = new RuntypeVoiceProvider(attachConfig());
      provider.prewarm();
      vi.advanceTimersByTime(60_000);
      provider.prewarm();
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('reuses an attached socket on click: sends start and captures on it', async () => {
      const statuses: string[] = [];
      const provider = new RuntypeVoiceProvider(attachConfig());
      provider.onStatusChange((s) => statuses.push(s));
      provider.prewarm();
      const ws = lastWs();
      openAs(ws, 'runtype.attach');
      ws.triggerMessage('{"type":"attached","idleMs":30000}');

      await provider.startListening();

      expect(MockWebSocket.instances).toHaveLength(1);
      expect(ws.sent).toEqual(['{"type":"ping"}', '{"type":"start"}']);
      expect(statuses).toEqual(['listening']);
      pumpCapture(constantBuffer(0.1));
      expect(ws.sent).toHaveLength(3);
      // The call owns the socket now: the attach idle timer no longer closes it.
      vi.advanceTimersByTime(600_000);
      expect(ws.closeCalls).toEqual([]);
    });

    it('adopts a socket whose server ignored attach without sending start', async () => {
      const transcripts: string[] = [];
      const provider = new RuntypeVoiceProvider(attachConfig());
      provider.onTranscript((_role, text) => transcripts.push(text));
      provider.prewarm();
      const ws = lastWs();
      openAs(ws, 'runtype.bearer');
      expect(ws.sent).toEqual([]);

      await provider.startListening();

      expect(MockWebSocket.instances).toHaveLength(1);
      expect(ws.sent).toEqual([]);
      ws.triggerMessage(JSON.stringify({ type: 'transcript_final', role: 'user', text: 'hi' }));
      expect(transcripts).toEqual(['hi']);
    });

    it('opens a fresh socket when the attached one dropped before the click', async () => {
      const provider = new RuntypeVoiceProvider(attachConfig());
      provider.prewarm();
      const attached = lastWs();
      openAs(attached, 'runtype.attach');
      attached.triggerClose(4408);

      await provider.startListening();

      expect(MockWebSocket.instances).toHaveLength(2);
      expect(lastWs().url).toBe('wss://api.example.com/ws/agents/agent%2F1/voice?voiceCapabilities=full-duplex-v1');
      expect(lastWs().protocols).toEqual(['runtype.bearer', 'ct_secret']);
    });

    it('abandons a handshake stalled for 5s and opens a fresh socket', async () => {
      const provider = new RuntypeVoiceProvider(attachConfig());
      provider.prewarm();
      const stalled = lastWs();

      const started = provider.startListening();
      await vi.advanceTimersByTimeAsync(4_999);
      expect(MockWebSocket.instances).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      await started;

      expect(stalled.closeCalls).toEqual([{ code: 1000, reason: 'prewarm released' }]);
      expect(MockWebSocket.instances).toHaveLength(2);
      expect(lastWs().protocols).toEqual(['runtype.bearer', 'ct_secret']);
    });

    it('uses an attach that completes while the click waits on it', async () => {
      const provider = new RuntypeVoiceProvider(attachConfig());
      provider.prewarm();
      const ws = lastWs();

      const started = provider.startListening();
      await vi.advanceTimersByTimeAsync(1_000);
      openAs(ws, 'runtype.attach');
      await started;

      expect(MockWebSocket.instances).toHaveLength(1);
      expect(ws.sent).toContain('{"type":"start"}');
    });

    it('closes an unused attached socket at the idle window', () => {
      const errors: Error[] = [];
      const provider = new RuntypeVoiceProvider(attachConfig());
      provider.onError((e) => errors.push(e));
      provider.prewarm();
      const ws = lastWs();
      openAs(ws, 'runtype.attach');

      vi.advanceTimersByTime(29_999);
      expect(ws.closeCalls).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(ws.closeCalls).toEqual([{ code: 1000, reason: 'prewarm released' }]);
      expect(errors).toEqual([]);
    });

    it("follows the server's idle window from the attached reply", () => {
      const provider = new RuntypeVoiceProvider(attachConfig({ attachIdleMs: 120_000 }));
      provider.prewarm();
      const ws = lastWs();
      openAs(ws, 'runtype.attach');
      vi.advanceTimersByTime(1_000);
      ws.triggerMessage('{"type":"attached","idleMs":60000}');

      vi.advanceTimersByTime(58_999);
      expect(ws.closeCalls).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(ws.closeCalls).toHaveLength(1);
    });

    it('closes the attaching socket when the call is hung up mid-handshake', async () => {
      const provider = new RuntypeVoiceProvider(attachConfig());
      provider.prewarm();
      const ws = lastWs();

      const started = provider.startListening();
      await vi.advanceTimersByTimeAsync(100);
      await provider.stopListening();
      await started;

      expect(ws.closeCalls).toEqual([{ code: 1000, reason: 'prewarm released' }]);
      expect(MockWebSocket.instances).toHaveLength(1);
      expect(provider.isBargeInActive()).toBe(false);
    });

    it('disconnect closes an attached socket', async () => {
      const provider = new RuntypeVoiceProvider(attachConfig());
      provider.prewarm();
      const ws = lastWs();
      openAs(ws, 'runtype.attach');
      await provider.disconnect();
      expect(ws.closeCalls).toEqual([{ code: 1000, reason: 'prewarm released' }]);
    });
  });
});
describe('buildCallContext', () => {
  it('keeps the last 12 messages, newest first when over budget, and caps at 8000 chars', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `message ${i} ${'x'.repeat(1000)}`,
    }));
    const text = buildCallContext(history, '');
    expect(text.length).toBeLessThanOrEqual(8000);
    expect(text.startsWith('Conversation so far:\n')).toBe(true);
    expect(text).toContain('message 19');
    expect(text).not.toContain('message 7 '); // outside the 12-message window
    expect(text).not.toContain('message 8 '); // dropped: oldest over budget
  });

  it('truncates a single huge message and always fits the host context', () => {
    const text = buildCallContext([{ role: 'assistant', content: 'y'.repeat(50_000) }], 'host '.repeat(3000));
    expect(text.length).toBeLessThanOrEqual(8000);
    expect(text).toContain('Assistant: yyy');
    expect(text).toContain('…');
    expect(text.endsWith('host')).toBe(true); // host share capped, still present
  });

  it('returns only the host context without history, and "" when both are empty', () => {
    expect(buildCallContext([], ' On /docs ')).toBe('On /docs');
    expect(buildCallContext([{ role: 'user', content: '   ' }], '')).toBe('');
  });
});
