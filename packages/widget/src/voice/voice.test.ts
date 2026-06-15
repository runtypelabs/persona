// Voice SDK Tests
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { VoiceConfig } from '../types';
import { RuntypeVoiceProvider } from './runtype-voice-provider';
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
  static OPEN = WS_OPEN;
  static instances: MockWebSocket[] = [];

  url: string;
  protocols: string | string[] | undefined;
  binaryType = '';
  readyState = 0;
  sent: ArrayBuffer[] = [];
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

  send(data: ArrayBuffer) {
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
    return { connect() {}, disconnect() {}, onaudioprocess: null as unknown };
  }
}

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
    expect(ws.url).toBe('wss://api.example.com/ws/agents/a1/voice');
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
    expect(lastWs().url).toBe(`${expected}/ws/agents/a1/voice`);
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
});