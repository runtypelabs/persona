// Voice SDK Tests
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type {
  VoiceConfig,
  VoiceDelegationFollowUp,
  VoiceDelegationRequest,
  VoiceDelegationResult,
  VoiceSessionBridge,
} from '../types';

import { RuntypeVoiceProvider, buildCallContext } from './runtype-voice-provider';
import { VERSION } from '../version';
import { BrowserVoiceProvider } from './browser-voice-provider';
import { createVoiceProvider, createBestAvailableVoiceProvider, isVoiceSupported } from './voice-factory';
import { readdirSync, readFileSync } from 'node:fs';

const ALL_CAPS = ['client_delegation', 'context', 'delegation_update'];

/** The voice socket URL v1 builds (Amendment 5): the protocol, client version and capability params. */
const voiceUrl = (base: string, agent: string, capabilities: string[], extra: Record<string, string> = {}) =>
  `${base}/ws/agents/${agent}/voice?${new URLSearchParams({
    voiceProtocol: 'runtype-browser-v1',
    clientVersion: `persona/${VERSION}`,
    voiceCapabilities: 'full-duplex-v1',
    clientCapabilities: capabilities.join(','),
    ...extra,
  })}`;
const BASE_CAPS = ['partial_transcript', 'context'];

/** Wire v1 fixtures (core #9522): one frame per file, by direction. */
const wireFixtures = (dir: 'client' | 'server') => {
  const base = new URL(`./__fixtures__/voice-wire/${dir}/`, import.meta.url);
  return readdirSync(base).flatMap((file) =>
    file.endsWith('.json') ? [JSON.parse(readFileSync(new URL(file, base), 'utf8')) as Record<string, unknown>] : [],
  );
};

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
    expect(ws.url).toBe(voiceUrl('wss://api.example.com', 'a1', BASE_CAPS));
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
    expect(lastWs().url).toBe(voiceUrl(expected, 'a1', BASE_CAPS));
  });

  it('always sends the v1 protocol, its version, full duplex, and snake_case capabilities', async () => {
    // core #9165 removed the 503 that once made Persona omit voiceProtocol.
    const provider = new RuntypeVoiceProvider(baseConfig());
    await provider.startListening();
    const url = new URL(lastWs().url);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      voiceProtocol: 'runtype-browser-v1',
      clientVersion: `persona/${VERSION}`,
      voiceCapabilities: 'full-duplex-v1',
      clientCapabilities: 'partial_transcript,context',
    });
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

  describe('audio captured before the socket opens', () => {
    /** The first PCM16 sample of a sent binary frame. */
    const firstSample = (frame: ArrayBuffer | string) => new Int16Array(frame as ArrayBuffer)[0];
    const binary = (ws: MockWebSocket) => ws.sent.filter((f) => typeof f !== 'string');

    it('captures as soon as the mic resolves and flushes in order on open, before live frames', async () => {
      const levels: number[] = [];
      const provider = new RuntypeVoiceProvider(baseConfig());
      provider.onLevel((level) => levels.push(level));
      await provider.startListening();
      const ws = lastWs();

      pumpCapture([0.1]);
      pumpCapture([0.2]);
      expect(ws.sent).toEqual([]);
      expect(levels).toHaveLength(2); // the mic is live: the level animates already

      ws.triggerOpen();
      pumpCapture([0.3]);
      expect(binary(ws).map(firstSample)).toEqual([0.1, 0.2, 0.3].map((v) => Math.trunc(v * 0x7fff)));
    });

    it('keeps at most 8 s (256 KB), dropping the oldest frames', async () => {
      const provider = new RuntypeVoiceProvider(baseConfig());
      await provider.startListening();
      const ws = lastWs();

      // 40 frames of 4096 samples (8 KB each); 31 fit under 256,000 bytes.
      for (let i = 0; i < 40; i++) pumpCapture(Array.from({ length: 4096 }, () => (i + 1) / 100));
      ws.triggerOpen();

      const sent = binary(ws);
      expect(sent).toHaveLength(31);
      expect(sent.reduce((n, f) => n + (f as ArrayBuffer).byteLength, 0)).toBeLessThanOrEqual(256_000);
      expect(firstSample(sent[0])).toBe(Math.trunc(0.1 * 0x7fff)); // frame 10 of 40
      expect(firstSample(sent[30])).toBe(Math.trunc(0.4 * 0x7fff)); // frame 40
    });

    it.each([
      ['hang-up', async (provider: RuntypeVoiceProvider) => provider.stopListening()],
      ['socket error', async (_provider: RuntypeVoiceProvider, ws: MockWebSocket) => ws.triggerError()],
      ['close before open', async (_provider: RuntypeVoiceProvider, ws: MockWebSocket) => ws.triggerClose(1006)],
    ])('drops the buffer on %s, so the next call starts clean', async (_name, end) => {
      const provider = new RuntypeVoiceProvider(baseConfig());
      provider.onError(() => {});
      await provider.startListening();
      const first = lastWs();
      pumpCapture([0.5]);
      await end(provider, first);

      await provider.startListening();
      const second = lastWs();
      expect(second).not.toBe(first);
      second.triggerOpen();
      pumpCapture([0.25]);
      expect(binary(second).map(firstSample)).toEqual([Math.trunc(0.25 * 0x7fff)]);
      expect(binary(first)).toEqual([]);
    });
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
        const calls: VoiceDelegationRequest[] = [];
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
        sessionConfig: Record<string, unknown> = { capabilities: ALL_CAPS },
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
        JSON.stringify({ type: 'transcript_update', role, text, utteranceId: turnId, final: true });
      /** `delegation_started` asking this client to run the turn (client delegation). */
      const delegate = (ws: MockWebSocket, delegationId: string, text: string, input: Record<string, unknown> = {}) =>
        ws.triggerMessage(
          JSON.stringify({
            type: 'delegation_started',
            delegationId,
            turnId: delegationId,
            input: { text, userUtteranceIds: [], messages: [], ...input },
          }),
        );
      const completed = (ws: MockWebSocket, delegationId: string, final = true) =>
        ws.triggerMessage(JSON.stringify({ type: 'delegation_completed', delegationId, speak: true, text: 'x', final }));

      it('declares client_delegation (never the kebab form) only with a bridge and the switch on', async () => {
        const { ws } = await startDelegatedCall();
        expect(ws.url).toBe(voiceUrl('wss://api.example.com', 'a1', [...BASE_CAPS, 'client_delegation', 'delegation_update', 'delegation_read_back']));
        expect(ws.url).not.toContain('client-delegation');
        await startDelegatedCall({ clientDelegation: false });
        expect(lastWs().url).toBe(voiceUrl('wss://api.example.com', 'a1', BASE_CAPS));
        const plain = new RuntypeVoiceProvider(baseConfig()); // no session bridge
        await plain.startListening();
        expect(lastWs().url).toBe(voiceUrl('wss://api.example.com', 'a1', BASE_CAPS));
      });

      it('holds the context frame until the visitor\'s first final transcript, then sends it once', async () => {
        const history: Array<{ role: 'user' | 'assistant'; content: string }> = [
          { role: 'user', content: 'Hi there' },
          { role: 'assistant', content: 'Hello!\n\nHow can I help?' },
        ];
        const { ws } = await startDelegatedCall(
          { callContext: async () => 'Visitor is on /pricing.' },
          { capabilities: ALL_CAPS },
          history,
        );
        expect(sentJson(ws)).toEqual([]); // nothing at call start
        ws.triggerMessage(update('assistant', 'Hi! What can I do?', 'g1')); // a greeting doesn't release it
        await flush();
        expect(sentJson(ws)).toEqual([]);

        // A partial doesn't release it: a mid-utterance append makes the model answer early.
        history.push({ role: 'user', content: 'what are' });
        ws.triggerMessage(JSON.stringify({ type: 'transcript_update', role: 'user', text: 'what are', turnId: 'u1', final: false }));
        await flush();
        expect(sentJson(ws)).toEqual([]);

        // The final does; the frame still holds only the history from before the call.
        ws.triggerMessage(update('user', 'what are your hours', 'u1'));
        await flush();
        expect(sentJson(ws)).toEqual([
          {
            type: 'context',
            text: 'Conversation so far:\nUser: Hi there\nAssistant: Hello! How can I help?\n\nVisitor is on /pricing.',
          },
        ]);
        ws.triggerMessage(JSON.stringify({ type: 'session_config', interruptionMode: 'barge-in', contextFrames: true }));
        ws.triggerMessage(update('user', 'and sundays', 'u2'));
        await flush();
        expect(sentJson(ws)).toHaveLength(1);
      });

      it('sends the held context on a delegation that comes first, ahead of its result', async () => {
        const { ws, pending } = await startDelegatedCall({ callContext: 'On /docs.' });
        delegate(ws, 'd1', 'q');
        await flush();
        pending[0]({ status: 'completed', text: 'Answer.' });
        await flush();
        expect(sentJson(ws).map((f) => f.type)).toEqual(['context', 'delegation_result']);
      });

      it('holds a delegation_result until a slow callContext has gone out', async () => {
        let resolveContext!: (text: string) => void;
        const { ws, pending } = await startDelegatedCall({
          callContext: () => new Promise<string>((resolve) => (resolveContext = resolve)),
        });
        delegate(ws, 'd1', 'q');
        await flush();
        pending[0]({ status: 'completed', text: 'Answer.' });
        await flush();
        expect(sentJson(ws)).toEqual([]); // the result waits for the context
        resolveContext('On /docs.');
        await flush();
        expect(sentJson(ws).map((f) => f.type)).toEqual(['context', 'delegation_result']);
      });

      it('sends the result after 2 s and drops a context whose callContext hangs', async () => {
        let resolveContext!: (text: string) => void;
        const { ws, pending } = await startDelegatedCall({
          callContext: () => new Promise<string>((resolve) => (resolveContext = resolve)),
        });
        delegate(ws, 'd1', 'q');
        await flush();
        pending[0]({ status: 'completed', text: 'Answer.' });
        await flush();
        await vi.advanceTimersByTimeAsync(1999);
        expect(sentJson(ws)).toEqual([]);
        await vi.advanceTimersByTimeAsync(1);
        expect(sentJson(ws).map((f) => f.type)).toEqual(['delegation_result']);
        resolveContext('too late');
        await flush();
        expect(sentJson(ws).map((f) => f.type)).toEqual(['delegation_result']);
      });

      it('sends context on contextFrames alone, with delegation off', async () => {
        const { ws, calls } = await startDelegatedCall(
          { clientDelegation: false, callContext: 'On /docs.' },
          { capabilities: ['context'] },
          [{ role: 'user', content: 'Hi' }],
        );
        expect(new URL(lastWs().url).searchParams.get('clientCapabilities')).toBe('partial_transcript,context');
        ws.triggerMessage(update('user', 'hello', 'u1'));
        await flush();
        expect(sentJson(ws)).toEqual([{ type: 'context', text: 'Conversation so far:\nUser: Hi\n\nOn /docs.' }]);
        delegate(ws, 'd1', 'x');
        await flush();
        expect(calls).toEqual([]);
        expect(sentJson(ws)).toHaveLength(1);
      });

      it('sends no context when the server does not announce contextFrames', async () => {
        const { ws } = await startDelegatedCall({ callContext: 'On /docs.' }, { capabilities: ['client_delegation', 'delegation_update'] }, [
          { role: 'user', content: 'Hi' },
        ]);
        ws.triggerMessage(update('user', 'hello', 'u1'));
        await flush();
        expect(sentJson(ws)).toEqual([]);
      });

      it('drops a held context when the call ends before the visitor speaks', async () => {
        const { ws, provider } = await startDelegatedCall({ callContext: 'On /docs.' });
        await provider.stopListening();
        ws.triggerMessage(update('user', 'hello', 'u1'));
        await flush();
        expect(sentJson(ws)).toEqual([]);
      });

      it('skips the context frame when there is nothing to say', async () => {
        const { ws } = await startDelegatedCall();
        ws.triggerMessage(update('user', 'hello', 'u1'));
        await flush();
        expect(sentJson(ws)).toEqual([]);
      });

      it('keeps today\'s behavior when the server does not confirm delegation', async () => {
        const { ws, calls, transcripts } = await startDelegatedCall(
          { callContext: 'page context' },
          {},
          [{ role: 'user', content: 'Hi' }],
        );
        delegate(ws, 'd1', 'x');
        ws.triggerMessage(JSON.stringify({ type: 'delegation_completed', turnId: 'd1', speak: true, text: 'Result' }));
        ws.triggerMessage(update('assistant', 'Result', 'a9'));
        await flush();
        expect(calls).toEqual([]);
        expect(sentJson(ws)).toEqual([]); // no context, no delegation_result
        expect(transcripts).toEqual([['assistant', 'Result', true, { turnId: 'a9' }]]); // no caption flag
      });

      it('runs a delegation through the bridge and answers delegation_result', async () => {
        const { ws, calls, pending } = await startDelegatedCall();
        delegate(ws, 'd1', 'Weather?', { userUtteranceIds: ['u1'], messages: [{ role: 'user', content: 'Weather?' }] });
        await flush();
        expect(calls).toEqual([
          { delegationId: 'd1', userText: 'Weather?', userUtteranceIds: ['u1'], messages: [{ role: 'user', content: 'Weather?' }] },
        ]);
        pending[0]({ status: 'completed', text: 'It is **sunny**.' });
        await flush();
        expect(sentJson(ws)).toEqual([{ type: 'delegation_result', delegationId: 'd1', status: 'completed', text: 'It is **sunny**.' }]);
      });

      it('answers ok:false when the bridge fails', async () => {
        const { ws, provider } = await startDelegatedCall();
        provider.setSessionBridge({
          getHistory: () => [],
          runDelegatedTurn: () => Promise.reject(new Error('nope')),
        });
        delegate(ws, 'd1', 'x');
        await flush();
        expect(sentJson(ws)).toEqual([{ type: 'delegation_result', delegationId: 'd1', status: 'failed', text: '' }]);
      });

      it('runs delegations one at a time', async () => {
        const { ws, calls, pending } = await startDelegatedCall();
        delegate(ws, 'd1', 'one');
        delegate(ws, 'd2', 'two');
        await flush();
        expect(calls.map((c) => c.delegationId)).toEqual(['d1']);
        pending[0]({ status: 'completed', text: 'first' });
        await flush();
        expect(calls.map((c) => c.delegationId)).toEqual(['d1', 'd2']);
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
        delegate(ws, 'd1', 'q');
        await flush();
        pending[0]({ status: 'completed', text: 'It is sunny.' });
        await flush();
        completed(ws, 'd1');
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
        delegate(ws, 'd1', 'q');
        await flush();
        pending[0]({ status: 'completed', text: 'We open at nine.' });
        await flush();
        completed(ws, 'd1');
        ws.triggerMessage(partial('assistant', " Yeah, I'll check.", 'f1', true)); // late final, old id
        ws.triggerMessage(partial('assistant', ' We open', 'r1', false)); // rotated id: read-back
        ws.triggerMessage(partial('assistant', ' We open at nine.', 'r1', true));
        expect(transcripts.map((t) => [t[1], t[2]])).toEqual([
          [" Yeah, I'll", false],
          [" Yeah, I'll check.", true],
        ]);
      });

      it('folds only the first new utterance after completion, so later speech still renders', async () => {
        const { ws, transcripts, pending } = await startDelegatedCall();
        delegate(ws, 'd1', 'q');
        await flush();
        pending[0]({ status: 'completed', text: 'It is sunny.' });
        await flush();
        completed(ws, 'd1');
        ws.triggerMessage(update('assistant', 'It is sunny.', 'r1')); // read-back
        ws.triggerMessage(update('assistant', 'Anything else?', 'a2')); // a separate utterance
        ws.triggerMessage(update('assistant', 'Anything else I can do?', 'a2'));
        expect(transcripts.map((t) => t[1])).toEqual(['Anything else?', 'Anything else I can do?']);
      });

      it('forwards userUtteranceIds (strings only) to the bridge, reading the deprecated turnId as a fallback id', async () => {
        const { ws, calls } = await startDelegatedCall();
        ws.triggerMessage(
          JSON.stringify({ type: 'delegation_started', turnId: 'd1', input: { text: 'a b', userUtteranceIds: ['u1', 7, 'u2'] } }),
        );
        await flush();
        expect(calls).toEqual([{ delegationId: 'd1', userText: 'a b', userUtteranceIds: ['u1', 'u2'], messages: [] }]);
      });

      it('runs nothing for a delegation_started without input (server-side delegation)', async () => {
        const { ws, calls } = await startDelegatedCall();
        ws.triggerMessage(JSON.stringify({ type: 'delegation_started', delegationId: 'd1' }));
        await flush();
        expect(calls).toEqual([]);
      });

      describe('with delegation_read_back negotiated', () => {
        const TAG_CAPS = [...ALL_CAPS, 'delegation_read_back'];
        const tagged = (role: string, text: string, turnId: string, delegationId?: string) =>
          JSON.stringify({ type: 'transcript_update', role, text, utteranceId: turnId, final: true, delegationId });
        async function answered(text = 'Three are overdue.') {
          const call = await startDelegatedCall({}, { capabilities: TAG_CAPS });
          delegate(call.ws, 'd1', 'q');
          await flush();
          call.pending[0]({ status: 'completed', text });
          await flush();
          completed(call.ws, 'd1');
          return call;
        }

        it('folds the tagged read-back, not a cut filler resuming first (production trace)', async () => {
          const { ws, transcripts } = await answered();
          ws.triggerMessage(tagged('assistant', "I'm pulling up the support queue.", 'f2'));
          ws.triggerMessage(tagged('assistant', 'Three are overdue.', 'r1', 'd1'));
          expect(transcripts.map((t) => t[1])).toEqual(["I'm pulling up the support queue."]);
        });

        it('keeps folding the tagged read-back after a late user transcript', async () => {
          const { ws, transcripts } = await answered();
          ws.triggerMessage(tagged('user', 'Who is overdue?', 'u1'));
          ws.triggerMessage(tagged('assistant', 'Three are overdue.', 'r1', 'd1'));
          expect(transcripts.map((t) => t[1])).toEqual(['Who is overdue?']);
        });

        it('renders untagged speech and a read-back tagged for a delegation the chat does not show', async () => {
          const { ws, transcripts } = await answered();
          ws.triggerMessage(tagged('assistant', 'Anything else?', 'a2'));
          ws.triggerMessage(tagged('assistant', 'I could not do that.', 'r9', 'd9'));
          expect(transcripts.map((t) => t[1])).toEqual(['Anything else?', 'I could not do that.']);
        });

        it('keeps the tagged read-back of an answer that is not in the chat (a spoken decline)', async () => {
          const { ws, transcripts, pending } = await startDelegatedCall({}, { capabilities: TAG_CAPS });
          delegate(ws, 'd1', 'cancel that');
          await flush();
          pending[0]({ status: 'denied', text: 'Okay, I cancelled the request.', inChat: false });
          await flush();
          completed(ws, 'd1');
          ws.triggerMessage(tagged('assistant', 'Okay, I cancelled the request.', 'r1', 'd1'));
          expect(transcripts.map((t) => t[1])).toEqual(['Okay, I cancelled the request.']);
        });

        it('folds every frame of a read-back tagged from its first partial', async () => {
          const { ws, transcripts } = await answered();
          const frame = (text: string, final: boolean, delegationId?: string) =>
            JSON.stringify({ type: 'transcript_update', role: 'assistant', text, utteranceId: 'r1', final, delegationId });
          ws.triggerMessage(frame('Three are', false, 'd1'));
          ws.triggerMessage(frame('Three are overdue.', true, 'd1'));
          expect(transcripts).toEqual([]);
        });

        it('keeps showing an utterance whose tag arrives after an untagged partial, so no caption is left half-done', async () => {
          const { ws, transcripts } = await answered();
          const frame = (text: string, final: boolean, delegationId?: string) =>
            JSON.stringify({ type: 'transcript_update', role: 'assistant', text, utteranceId: 'r1', final, delegationId });
          ws.triggerMessage(frame('Three are', false));
          ws.triggerMessage(frame('Three are overdue.', true, 'd1'));
          expect(transcripts.map((t) => [t[1], t[2]])).toEqual([
            ['Three are', false],
            ['Three are overdue.', true],
          ]);
        });

        it('does not fold the tagged read-back of a failed delegation', async () => {
          const { ws, transcripts, pending } = await startDelegatedCall({}, { capabilities: TAG_CAPS });
          delegate(ws, 'd1', 'q');
          await flush();
          pending[0]({ status: 'failed', text: '' });
          await flush();
          completed(ws, 'd1');
          ws.triggerMessage(tagged('assistant', "Sorry, I couldn't complete that.", 'r1', 'd1'));
          expect(transcripts).toHaveLength(1);
        });
      });

      it('does not fold after a failed delegation', async () => {
        const { ws, transcripts, pending } = await startDelegatedCall();
        delegate(ws, 'd1', 'q');
        await flush();
        pending[0]({ status: 'failed', text: '' });
        await flush();
        completed(ws, 'd1');
        ws.triggerMessage(update('assistant', "Sorry, I couldn't complete that.", 'r1'));
        expect(transcripts).toHaveLength(1);
      });

      it('offers the AI disclosure once a speech-to-speech call is live, unless disabled', async () => {
        const statuses: string[] = [];
        const { provider, ws } = await startDelegatedCall();
        expect(provider.getDisclosure()).toBe("You're talking to an AI assistant. Voice is processed by OpenAI.");
        await provider.stopListening();
        expect(provider.getDisclosure()).toBeNull();
        void ws;

        const custom = await startDelegatedCall({ disclosureText: 'AI voice by OpenAI.' });
        expect(custom.provider.getDisclosure()).toBe('AI voice by OpenAI.');
        const hidden = await startDelegatedCall({ disclosureText: false });
        expect(hidden.provider.getDisclosure()).toBeNull();

        // session_config re-announces "listening" so the UI can read the disclosure.
        const late = new RuntypeVoiceProvider({ ...baseConfig(), createPlaybackEngine: () => makeFakeEngine() });
        late.onStatusChange((s) => statuses.push(s));
        await late.startListening();
        lastWs().triggerOpen();
        expect(late.getDisclosure()).toBeNull(); // not known to be speech-to-speech yet
        lastWs().triggerMessage(JSON.stringify({ type: 'session_config', speechMode: 'speech_to_speech' }));
        expect(statuses.filter((s) => s === 'listening')).toHaveLength(2);
        expect(late.getDisclosure()).not.toBeNull();
      });

      it('drops a result that finishes after hang-up', async () => {
        const { ws, provider, pending } = await startDelegatedCall();
        delegate(ws, 'd1', 'q');
        await flush();
        await provider.stopListening();
        pending[0]({ status: 'completed', text: 'late' });
        await flush();
        expect(sentJson(ws)).toEqual([]);
      });

      describe('approval lifecycle (delegation_update, then one terminal delegation_result)', () => {
        /** A parked result whose follow-up the test settles, recording the options it got. */
        const parked = () => {
          let settle!: (followUp: VoiceDelegationFollowUp | null) => void;
          let options:
            | { signal: AbortSignal; approvalTimeoutMs?: number; readBack?: boolean; onUpdate?: (text: string) => void }
            | undefined;
          const result: VoiceDelegationResult = {
            status: 'pending_approval',
            text: 'Approve it in the chat.',
            followUp: (o) => {
              options = o;
              return new Promise((resolve) => (settle = resolve));
            },
          };
          return {
            result,
            settle: (followUp: VoiceDelegationFollowUp | null) => settle(followUp),
            options: () => options,
          };
        };
        const parkOn = async (ws: MockWebSocket, pending: Array<(r: VoiceDelegationResult) => void>) => {
          const park = parked();
          delegate(ws, 'd1', 'order croissants');
          await flush();
          pending[0](park.result);
          await flush();
          return park;
        };

        it('sends the full wire sequence: update, then the terminal result, folding both read-backs', async () => {
          const { ws, transcripts, pending } = await startDelegatedCall({ approvalTimeoutMs: 1_500 });
          const park = await parkOn(ws, pending);
          expect(sentJson(ws)).toEqual([
            { type: 'delegation_update', delegationId: 'd1', status: 'pending_approval', text: 'Approve it in the chat.' },
          ]);
          expect(park.options()).toMatchObject({ approvalTimeoutMs: 1_500, readBack: true });
          // Clamped under core's 600 s deadline; unset leaves the default to the bridge.
          const long = await startDelegatedCall({ approvalTimeoutMs: 900_000 });
          const longPark = await parkOn(long.ws, long.pending);
          expect(longPark.options()!.approvalTimeoutMs).toBe(540_000);
          const unset = await startDelegatedCall();
          expect((await parkOn(unset.ws, unset.pending)).options()!.approvalTimeoutMs).toBeUndefined();
          completed(ws, 'd1', false);
          ws.triggerMessage(update('assistant', 'Please approve it in the chat.', 'r1')); // folded

          park.settle({ status: 'completed', text: 'Your order is in: JB-1234.' });
          await flush();
          expect(sentJson(ws)).toEqual([
            { type: 'delegation_update', delegationId: 'd1', status: 'pending_approval', text: 'Approve it in the chat.' },
            { type: 'delegation_result', delegationId: 'd1', status: 'completed', text: 'Your order is in: JB-1234.' },
          ]);
          ws.triggerMessage(update('user', 'thanks', 'u2'));
          completed(ws, 'd1', true);
          ws.triggerMessage(update('assistant', 'Your order is in.', 'r2')); // folded too
          expect(transcripts.map((t) => t[1])).toEqual(['thanks']);
        });

        it('sends another update when the resumed turn stops on a second gated tool', async () => {
          const { ws, pending } = await startDelegatedCall();
          const park = await parkOn(ws, pending);
          park.options()!.onUpdate!('Approve the cake order too.');
          await flush();
          park.settle({ status: 'completed', text: 'Both done.' });
          await flush();
          expect(sentJson(ws).map((f) => `${f.type}:${f.status}:${f.text}`)).toEqual([
            'delegation_update:pending_approval:Approve it in the chat.',
            'delegation_update:pending_approval:Approve the cake order too.',
            'delegation_result:completed:Both done.',
          ]);
        });

        it.each(['denied', 'timeout', 'cancelled', 'failed'])('sends a %s terminal result as it comes', async (status) => {
          const { ws, pending } = await startDelegatedCall();
          const park = await parkOn(ws, pending);
          park.settle({ status, text: `It was ${status}.` });
          await flush();
          expect(sentJson(ws).at(-1)).toEqual({ type: 'delegation_result', delegationId: 'd1', status, text: `It was ${status}.` });
        });

        it('answers with the ask as the result to a server without delegation_update, keeping the expiry bookkeeping', async () => {
          const { ws, pending } = await startDelegatedCall({}, { capabilities: ['client_delegation', 'context'] });
          const park = await parkOn(ws, pending);
          expect(sentJson(ws)).toEqual([
            { type: 'delegation_result', delegationId: 'd1', status: 'completed', text: 'Approve it in the chat.' },
          ]);
          expect(park.options()).toMatchObject({ readBack: false });
          park.settle({ status: 'timeout', text: 'That request expired, so nothing was done.' });
          await flush();
          expect(sentJson(ws)).toHaveLength(1);
        });

        it('aborts the follow-up and sends nothing once the call ends', async () => {
          const { ws, provider, pending } = await startDelegatedCall();
          const park = await parkOn(ws, pending);
          await provider.stopListening();
          expect(park.options()!.signal.aborted).toBe(true);
          park.settle({ status: 'completed', text: 'too late' });
          await flush();
          expect(sentJson(ws).map((f) => f.type)).toEqual(['delegation_update']);
        });

        it('stops all frames for a delegation the server cancelled, and its approval timers', async () => {
          const { ws, pending } = await startDelegatedCall();
          const park = await parkOn(ws, pending);
          ws.triggerMessage(JSON.stringify({ type: 'delegation_cancelled', delegationId: 'd1', reason: 'timeout' }));
          expect(park.options()!.signal.aborted).toBe(true);
          park.settle({ status: 'completed', text: 'Done.' });
          await flush();
          expect(sentJson(ws).map((f) => f.type)).toEqual(['delegation_update']);
        });

        it('never starts a delegation cancelled while it waited behind another', async () => {
          const { ws, calls, pending } = await startDelegatedCall();
          delegate(ws, 'd1', 'first');
          delegate(ws, 'd2', 'second');
          await flush();
          ws.triggerMessage(JSON.stringify({ type: 'delegation_cancelled', delegationId: 'd2', reason: 'timeout' }));
          pending[0]({ status: 'completed', text: 'one' });
          await flush();
          expect(calls.map((c) => c.delegationId)).toEqual(['d1']);
          expect(sentJson(ws).map((f) => f.delegationId)).toEqual(['d1']);
        });

        it('sends no result for a delegation cancelled while its turn still runs', async () => {
          const { ws, pending } = await startDelegatedCall();
          delegate(ws, 'd1', 'q');
          await flush();
          ws.triggerMessage(JSON.stringify({ type: 'delegation_cancelled', delegationId: 'd1', reason: 'timeout' }));
          pending[0]({ status: 'completed', text: 'late' });
          await flush();
          expect(sentJson(ws)).toEqual([]);
        });
      });

      describe('capabilities and tolerance', () => {
        it('uses no client delegation, context or updates when session_config has no capabilities (old server)', async () => {
          const { ws, calls, transcripts } = await startDelegatedCall(
            { callContext: 'On /docs.' },
            { clientDelegation: true, contextFrames: true, followUpFrames: true },
            [{ role: 'user', content: 'Hi' }],
          );
          ws.triggerMessage(update('user', 'hello', 'u1'));
          delegate(ws, 'd1', 'x');
          await flush();
          expect(calls).toEqual([]);
          expect(sentJson(ws)).toEqual([]);
          expect(transcripts).toEqual([['user', 'hello', true, { turnId: 'u1' }]]); // not a caption
        });

        it('gates each frame type on its own capability', async () => {
          const contextOnly = await startDelegatedCall({ callContext: 'On /docs.' }, { capabilities: ['context'] });
          contextOnly.ws.triggerMessage(update('user', 'hello', 'u1'));
          delegate(contextOnly.ws, 'd1', 'x');
          await flush();
          expect(sentJson(contextOnly.ws).map((f) => f.type)).toEqual(['context']);
          expect(contextOnly.calls).toEqual([]);
        });

        it('logs a warning and keeps the call; an error always ends it', async () => {
          const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
          const errors: Error[] = [];
          const statuses: string[] = [];
          const { ws, provider } = await startDelegatedCall({}, { capabilities: ALL_CAPS, callId: 'vc_1' });
          provider.onError((e) => errors.push(e));
          provider.onStatusChange((s) => statuses.push(s));
          ws.triggerMessage(JSON.stringify({ type: 'warning', code: 'UNKNOWN_FRAME', message: 'Unknown frame: x' }));
          expect(warn).toHaveBeenCalledWith('[Persona voice] UNKNOWN_FRAME: Unknown frame: x', 'vc_1');
          expect(errors).toEqual([]);
          expect(statuses).not.toContain('error');
          expect(provider.isBargeInActive()).toBe(true);
          // `fatal: false` on an error no longer means anything: errors end the call.
          ws.triggerMessage(JSON.stringify({ type: 'error', error: 'Boom', fatal: false }));
          expect(errors.map((e) => e.message)).toEqual(['Boom']);
          expect(statuses).toContain('error');
          warn.mockRestore();
        });

        it.each(['UNKNOWN_DELEGATION', 'LATE_RESULT_LIMIT'])(
          'stops all frames for a delegation a %s warning names, and hands its answer back to TTS',
          async (code) => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const dropped: string[] = [];
            const { ws, provider, pending } = await startDelegatedCall();
            const bridge = (provider as unknown as { bridge: VoiceSessionBridge }).bridge;
            bridge.dropDelegation = (id) => dropped.push(id);
            delegate(ws, 'd1', 'q');
            await flush();
            ws.triggerMessage(JSON.stringify({ type: 'warning', code, message: 'refused', delegationId: 'd1' }));
            pending[0]({ status: 'completed', text: 'late' });
            await flush();
            expect(sentJson(ws)).toEqual([]);
            expect(dropped).toEqual(['d1']);
            warn.mockRestore();
          },
        );

        it('hands a cancelled delegation\'s answer back to TTS, expiring its card only past the deadline (or for an unknown reason)', async () => {
          const dropped: Array<[string, boolean | undefined]> = [];
          const { ws, provider } = await startDelegatedCall();
          (provider as unknown as { bridge: VoiceSessionBridge }).bridge.dropDelegation = (id, expired) =>
            dropped.push([id, expired]);
          delegate(ws, 'd1', 'q');
          for (const [id, reason] of [['d1', 'deadline'], ['d2', 'provider_cancelled'], ['d3', 'some_future_reason'], ['d4', 'session_ending']]) {
            ws.triggerMessage(JSON.stringify({ type: 'delegation_cancelled', delegationId: id, reason }));
          }
          expect(dropped).toEqual([['d1', true], ['d2', false], ['d3', true], ['d4', false]]);
        });

        it('renders the spoken refusal of a delegation it never saw start, resolving nothing', async () => {
          const { ws, transcripts, calls } = await startDelegatedCall();
          completed(ws, 'd_backlog', true);
          ws.triggerMessage(update('assistant', "Sorry, I can't take that right now.", 'r1'));
          // No chat answer to dedupe against: the refusal is the only text, so it shows.
          expect(transcripts.map((t) => t[1])).toEqual(["Sorry, I can't take that right now."]);
          expect(calls).toEqual([]);
          expect(sentJson(ws)).toEqual([]);
        });

        it('takes every v1 server fixture without failing; only `error` ends the call', async () => {
          const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
          const fixtures = wireFixtures('server');
          expect(fixtures.length).toBeGreaterThan(10);
          for (const frame of fixtures) {
            const errors: Error[] = [];
            const { ws, provider } = await startDelegatedCall();
            provider.onError((e) => errors.push(e));
            expect(() => ws.triggerMessage(JSON.stringify(frame))).not.toThrow();
            await flush();
            expect(errors.length, `${frame.type}`).toBe(frame.type === 'error' ? 1 : 0);
          }
          warn.mockRestore();
        });

        it('sends client frames shaped like the v1 client fixtures', async () => {
          const shape = (frame: Record<string, unknown>) => [String(frame.type), Object.keys(frame).sort().join(',')];
          const fixtures = Object.fromEntries(wireFixtures('client').map(shape));
          const { ws, pending } = await startDelegatedCall({ callContext: 'On /docs.' });
          ws.triggerMessage(update('user', 'hello', 'u1')); // releases context
          delegate(ws, 'd1', 'q');
          await flush();
          pending[0]({ status: 'pending_approval', text: 'Approve it.', followUp: async () => ({ status: 'completed', text: 'Done.' }) });
          await flush();
          const sent = sentJson(ws).map(shape);
          expect(sent.map(([type]) => type)).toEqual(['context', 'delegation_update', 'delegation_result']);
          for (const [type, keys] of sent) expect(keys, type).toBe(fixtures[type]);
        });

        it('ignores unknown frames and fields', async () => {
          const { ws, transcripts, calls } = await startDelegatedCall();
          ws.triggerMessage(JSON.stringify({ type: 'agent_state', state: 'thinking' }));
          ws.triggerMessage(JSON.stringify({ type: 'audio_clear', reason: 'barge_in', extra: 1 }));
          ws.triggerMessage(
            JSON.stringify({ type: 'transcript_update', role: 'assistant', text: 'Hi', utteranceId: 'a1', final: true, interrupted: true, future: 'x' }),
          );
          delegate(ws, 'd1', 'q', { future: true });
          await flush();
          expect(transcripts.map((t) => t[1])).toEqual(['Hi']);
          expect(calls).toHaveLength(1);
        });

        it('reads utteranceId, falling back to the deprecated turnId', async () => {
          const { ws, transcripts } = await startDelegatedCall();
          ws.triggerMessage(JSON.stringify({ type: 'transcript_update', role: 'user', text: 'a', utteranceId: 'u1', turnId: 'ignored', final: true }));
          ws.triggerMessage(JSON.stringify({ type: 'transcript_update', role: 'user', text: 'b', turnId: 'u2', final: true }));
          expect(transcripts.map((t) => (t[3] as { turnId: string }).turnId)).toEqual(['u1', 'u2']);
        });
      });
    });

    describe('session_end (Amendment 6)', () => {
      const fixture = (name: string) =>
        JSON.stringify(wireFixtures('server').find((f) => JSON.stringify(f).includes(name)) ?? {});
      /** A live full-duplex call that collects errors and statuses from here on. */
      const endableCall = async () => {
        const call = await startFullDuplexCall();
        const errors: string[] = [];
        call.provider.onError((e) => errors.push(e.message));
        return { ...call, errors };
      };
      const end = (ws: MockWebSocket, frame: Record<string, unknown> | string, code: number) => {
        ws.triggerMessage(typeof frame === 'string' ? frame : JSON.stringify({ type: 'session_end', ...frame }));
        ws.triggerClose(code);
      };

      it.each([
        ['idle_timeout', 1000, 'Voice call ended after a quiet period.'],
        ['max_duration', 1000, 'This voice call reached its time limit.'],
        ['provider_ended', 1000, 'The voice session ended.'],
        ['quota', 1008, 'Voice is unavailable right now.'],
        ['auth_expired', 1008, 'Voice session expired. Tap the mic to reconnect.'], // reserved: no auto-reconnect
        ['ended_by_server', 1000, null],
        ['maintenance_window', 1000, null], // unknown: an ordinary server end
      ])('ends on %s with its status text, without an error', async (reason, code, text) => {
        const { ws, provider, statuses, errors } = await endableCall();
        end(ws, { reason }, code);
        expect(provider.takeNotice()).toBe(text);
        expect(provider.takeNotice()).toBeNull(); // read once
        expect(errors).toEqual([]);
        expect(statuses.at(-1)).toBe('idle');
        expect(provider.isBargeInActive()).toBe(false);
        await vi.advanceTimersByTimeAsync(5_000);
        expect(MockWebSocket.instances.at(-1)).toBe(ws); // no reconnect
      });

      it('shows the quota message the server sent', async () => {
        const { ws, provider } = await endableCall();
        end(ws, { reason: 'quota', message: 'Your voice minutes are used up.' }, 1008);
        expect(provider.takeNotice()).toBe('Your voice minutes are used up.');
      });

      it('takes the doc fixtures: max_duration, and an unknown reason as ended_by_server', async () => {
        const first = await endableCall();
        end(first.ws, fixture('max_duration'), 1000);
        expect(first.provider.takeNotice()).toBe('This voice call reached its time limit.');
        const second = await endableCall();
        end(second.ws, fixture('maintenance_window'), 1000);
        expect(second.provider.takeNotice()).toBeNull();
        expect(second.errors).toEqual([]);
      });

      it('reports a fatal error once: the error frame, not the session_end after it', async () => {
        const { ws, provider, statuses, errors } = await endableCall();
        ws.triggerMessage(JSON.stringify({ type: 'error', error: 'Voice engine failed', fatal: true }));
        end(ws, { reason: 'error' }, 1011);
        expect(errors).toEqual(['Voice engine failed']);
        expect(statuses.at(-1)).toBe('error');
        expect(provider.takeNotice()).toBeNull();
      });

      it('reconnects once after a provider error, 1-2 s later, and says so', async () => {
        const { ws, provider, statuses, errors } = await endableCall();
        end(ws, fixture('provider_error'), 1011);
        expect(provider.takeNotice()).toBe('Voice connection lost. Reconnecting…');
        expect(errors).toEqual([]);
        expect(statuses.at(-1)).toBe('idle');
        expect(provider.isBargeInActive()).toBe(true); // the mic button hangs up meanwhile
        await vi.advanceTimersByTimeAsync(999);
        expect(MockWebSocket.instances.at(-1)).toBe(ws);
        await vi.advanceTimersByTimeAsync(1_001);
        const second = lastWs();
        expect(second).not.toBe(ws);
        expect(second.protocols).toEqual(['runtype.bearer', 'ct_secret']);

        // A second failure doesn't reconnect again.
        second.triggerOpen();
        end(second, { reason: 'provider_error' }, 1011);
        expect(provider.takeNotice()).toBe('Voice connection lost.');
        expect(errors).toEqual(['Voice connection lost.']);
        expect(statuses.at(-1)).toBe('error');
        await vi.advanceTimersByTimeAsync(5_000);
        expect(lastWs()).toBe(second);
      });

      it('reconnects once on server_restart, saying "Reconnecting…"', async () => {
        const { ws, provider } = await endableCall();
        end(ws, { reason: 'server_restart' }, 1012);
        expect(provider.takeNotice()).toBe('Reconnecting…');
        await vi.advanceTimersByTimeAsync(2_000);
        expect(lastWs()).not.toBe(ws);
      });

      it('never reconnects once the visitor hangs up, during the wait or before the close', async () => {
        const waiting = await endableCall();
        end(waiting.ws, { reason: 'provider_error' }, 1011);
        await waiting.provider.stopListening();
        await vi.advanceTimersByTimeAsync(5_000);
        expect(lastWs()).toBe(waiting.ws);

        const hungUp = await endableCall();
        hungUp.ws.triggerMessage(JSON.stringify({ type: 'session_end', reason: 'provider_error' }));
        await hungUp.provider.stopListening(); // closes the socket itself
        await vi.advanceTimersByTimeAsync(5_000);
        expect(lastWs()).toBe(hungUp.ws);
        expect(hungUp.errors).toEqual([]);
      });

      it('reconnects on the real failure order: error, audio_end, session_end, close 1011', async () => {
        const { ws, provider, statuses, errors } = await endableCall();
        ws.triggerMessage(JSON.stringify({ type: 'error', error: 'Voice engine failed', fatal: true }));
        ws.triggerMessage(JSON.stringify({ type: 'audio_end' }));
        end(ws, { reason: 'provider_error', retryable: true }, 1011);
        expect(errors).toEqual(['Voice engine failed']); // reported once, by the error frame
        expect(statuses.at(-1)).toBe('idle');
        expect(provider.takeNotice()).toBe('Voice connection lost. Reconnecting…');
        expect(provider.isBargeInActive()).toBe(true);
        await vi.advanceTimersByTimeAsync(2_000);
        expect(lastWs()).not.toBe(ws);
      });

      it('still reconnects when a socket error comes between session_end and the close', async () => {
        const { ws, provider, errors } = await endableCall();
        ws.triggerMessage(JSON.stringify({ type: 'session_end', reason: 'provider_error' }));
        ws.triggerError();
        ws.triggerClose(1011);
        expect(errors).toEqual([]);
        expect(provider.takeNotice()).toBe('Voice connection lost. Reconnecting…');
        await vi.advanceTimersByTimeAsync(2_000);
        expect(lastWs()).not.toBe(ws);
      });

      it('ends the automatic reconnect when audio stays suspended outside a click (iOS)', async () => {
        const { ws, provider, statuses, errors } = await endableCall();
        end(ws, { reason: 'server_restart' }, 1012);
        provider.takeNotice();
        class SuspendedAudioContext extends MockAudioContext {
          state = 'suspended';
          resume() {
            return new Promise<void>(() => {}); // iOS: pending until a gesture
          }
        }
        (globalThis as any).window.AudioContext = SuspendedAudioContext;
        try {
          await vi.advanceTimersByTimeAsync(2_500);
        } finally {
          (globalThis as any).window.AudioContext = MockAudioContext;
        }
        expect(lastWs()).toBe(ws); // no dead call opened
        expect(errors).toEqual(['Voice connection lost. Tap the mic to reconnect.']);
        expect(statuses.at(-1)).toBe('error');
        expect(provider.takeNotice()).toBe('Voice connection lost. Tap the mic to reconnect.');
        expect(provider.isBargeInActive()).toBe(false);
      });

      it('treats the attach idle close (4408) as a quiet end, not an error', async () => {
        for (const withFrame of [false, true]) {
          const { ws, provider, statuses, errors } = await endableCall();
          if (withFrame) ws.triggerMessage(JSON.stringify({ type: 'session_end', reason: 'idle_timeout' }));
          ws.triggerClose(4408);
          expect(errors).toEqual([]);
          expect(statuses.at(-1)).toBe('idle');
          expect(provider.takeNotice()).toBe('Voice call ended after a quiet period.');
        }
      });

      it('keeps an abnormal close without session_end exactly as before', async () => {
        const { ws, provider, statuses, errors } = await endableCall();
        ws.triggerClose(1006);
        expect(errors).toEqual(['Voice connection closed (code 1006)']);
        expect(statuses.at(-1)).toBe('error');
        expect(provider.takeNotice()).toBeNull();
        await vi.advanceTimersByTimeAsync(5_000);
        expect(lastWs()).toBe(ws);
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
      expect(ws.url).toBe(voiceUrl('wss://api.example.com', 'agent%2F1', ['attach', ...BASE_CAPS]));
      expect(ws.protocols).toEqual(['runtype.bearer', 'runtype.attach', 'ct_secret']);
      expect(fetchMock).not.toHaveBeenCalled();
      openAs(ws, 'runtype.attach');
      expect(ws.sent).toEqual(['{"type":"ping"}']);
    });

    it('combines attach with client_delegation when a session bridge is set', () => {
      const provider = new RuntypeVoiceProvider(attachConfig());
      provider.setSessionBridge({ getHistory: () => [], runDelegatedTurn: async () => ({ status: 'completed', text: '' }) });
      provider.prewarm();
      expect(lastWs().url).toBe(
        voiceUrl('wss://api.example.com', 'agent%2F1', ['attach', ...BASE_CAPS, 'client_delegation', 'delegation_update', 'delegation_read_back']),
      );
    });

    it('sends a clamped attachIdleMs when configured', () => {
      new RuntypeVoiceProvider(attachConfig({ attachIdleMs: 5_000 })).prewarm();
      expect(lastWs().url).toBe(voiceUrl('wss://api.example.com', 'agent%2F1', ['attach', ...BASE_CAPS], { attachIdleMs: '30000' }));
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
      expect(lastWs().url).toBe(voiceUrl('wss://api.example.com', 'agent%2F1', BASE_CAPS));
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

    it('keeps the audio captured while waiting on the attach, sent after start', async () => {
      const provider = new RuntypeVoiceProvider(attachConfig());
      provider.prewarm();
      const ws = lastWs();

      const started = provider.startListening();
      await vi.advanceTimersByTimeAsync(500);
      pumpCapture(constantBuffer(0.1));
      openAs(ws, 'runtype.attach');
      await started;

      expect(ws.sent.slice(0, 2)).toEqual(['{"type":"ping"}', '{"type":"start"}']);
      expect(ws.sent).toHaveLength(3);
      expect(ws.sent[2]).toBeInstanceOf(ArrayBuffer);
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
