// Session-level wiring for the realtime (runtype) voice path (Option B).
//
// The provider's protocol behavior is covered in voice/voice.test.ts; here we
// mock the voice factory to a fake provider and drive its onTranscript/onMetrics
// callbacks to verify how session.setupVoice() feeds the chat thread.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AgentWidgetMessage, VoiceMetrics } from './types';

// vi.mock is hoisted above module init, so the shared fake must be hoisted too.
const h = vi.hoisted(() => {
  const state: {
    transcriptCb:
      | ((role: 'user' | 'assistant', text: string, isFinal: boolean) => void)
      | null;
    metricsCb: ((m: VoiceMetrics) => void) | null;
  } = { transcriptCb: null, metricsCb: null };

  const fakeProvider = {
    type: 'runtype' as const,
    connect: async () => {},
    disconnect: async () => {},
    startListening: async () => {},
    stopListening: async () => {},
    onResult: () => {},
    onError: () => {},
    onStatusChange: () => {},
    onTranscript: (cb: typeof state.transcriptCb) => {
      state.transcriptCb = cb;
    },
    onMetrics: (cb: typeof state.metricsCb) => {
      state.metricsCb = cb;
    },
  };

  return { state, fakeProvider };
});

vi.mock('./voice', async (importOriginal) => {
  // Keep the real exports (ReadAloudController, BrowserSpeechEngine, …) and
  // override only the provider factories so the realtime voice flow uses the
  // fake provider.
  const actual = await importOriginal<typeof import('./voice')>();
  return {
    ...actual,
    createVoiceProvider: () => h.fakeProvider,
    createBestAvailableVoiceProvider: () => h.fakeProvider,
    isVoiceSupported: () => true,
  };
});

import { AgentWidgetSession } from './session';
import { setRuntypeTtsLoader } from './voice/runtype-tts-loader';

describe('AgentWidgetSession - realtime voice onTranscript (Option B)', () => {
  let session: AgentWidgetSession;
  let messages: AgentWidgetMessage[] = [];
  let streaming = false;
  let metricsSeen: VoiceMetrics[] = [];

  const drive = (
    role: 'user' | 'assistant',
    text: string,
    isFinal: boolean,
  ) => h.state.transcriptCb!(role, text, isFinal);

  beforeEach(() => {
    h.state.transcriptCb = null;
    h.state.metricsCb = null;
    messages = [];
    streaming = false;
    metricsSeen = [];

    session = new AgentWidgetSession(
      {
        apiUrl: 'http://localhost:8000',
        voiceRecognition: {
          enabled: true,
          provider: { type: 'runtype', runtype: { agentId: 'a1' } },
          onMetrics: (m) => {
            metricsSeen.push(m);
          },
        },
      },
      {
        onMessagesChanged: (m) => {
          messages = m;
        },
        onStatusChanged: () => {},
        onStreamingChanged: (s) => {
          streaming = s;
        },
        onError: () => {},
      },
    );
    session.setupVoice();
  });

  it('registers an onTranscript handler', () => {
    expect(h.state.transcriptCb).toBeTypeOf('function');
  });

  it('grows the user bubble live, then finalizes and shows a typing indicator', () => {
    drive('user', 'what are', false);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('what are');
    expect(messages[0].voiceProcessing).toBe(true);

    drive('user', 'what are your hours', false);
    expect(messages).toHaveLength(1); // upsert in place, not a new bubble
    expect(messages[0].content).toBe('what are your hours');

    drive('user', 'what are your hours?', true);
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('what are your hours?');
    expect(messages[0].voiceProcessing).toBe(false); // cleared on final
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toBe('');
    expect(messages[1].streaming).toBe(true); // typing indicator
    expect(streaming).toBe(true);
  });

  it('fills the assistant reply on its final frame and clears streaming', () => {
    drive('user', 'hi', true);
    drive('assistant', 'Hello! How can I help?', true);

    const assistant = messages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toBe('Hello! How can I help?');
    expect(assistant?.streaming).toBe(false);
    expect(assistant?.voiceProcessing).toBe(false);
    expect(streaming).toBe(false);
  });

  it('starts a fresh user bubble on the next turn', () => {
    drive('user', 'first', true);
    drive('assistant', 'reply one', true);
    drive('user', 'second', false);

    const userMessages = messages.filter((m) => m.role === 'user');
    expect(userMessages.map((m) => m.content)).toEqual(['first', 'second']);
  });

  it('forwards metrics to the config hook', () => {
    h.state.metricsCb!({ llmMs: 100, totalMs: 250 });
    expect(metricsSeen).toEqual([{ llmMs: 100, totalMs: 250 }]);
  });
});

describe('AgentWidgetSession - Runtype TTS config', () => {
  it('uses top-level agentId as the default Runtype TTS agent', async () => {
    let capturedOptions: { agentId?: string; clientToken?: string; host?: string } | null = null;

    class FakeRuntypeSpeechEngine {
      readonly id = 'runtype';
      readonly supportsPause = false;

      constructor(options: { agentId?: string; clientToken?: string; host?: string }) {
        capturedOptions = options;
      }

      speak() {}
      pause() {}
      resume() {}
      stop() {}
    }

    class FakeFallbackSpeechEngine {}

    setRuntypeTtsLoader(async () => ({
      RuntypeSpeechEngine: FakeRuntypeSpeechEngine as any,
      FallbackSpeechEngine: FakeFallbackSpeechEngine as any,
    }));

    try {
      const session = new AgentWidgetSession(
        {
          apiUrl: 'https://api.runtype.com',
          clientToken: 'ct_live_demo',
          agentId: 'agent_top_level',
          textToSpeech: { enabled: true, provider: 'runtype', browserFallback: false },
          initialMessages: [
            {
              id: 'assistant-1',
              role: 'assistant',
              content: 'Read this',
              createdAt: new Date().toISOString(),
            },
          ],
        },
        {
          onMessagesChanged: () => {},
          onStatusChanged: () => {},
          onStreamingChanged: () => {},
          onError: () => {},
        },
      );

      session.toggleReadAloud('assistant-1');
      await Promise.resolve();
      await Promise.resolve();

      expect(capturedOptions).toMatchObject({
        agentId: 'agent_top_level',
        clientToken: 'ct_live_demo',
        host: 'https://api.runtype.com',
      });
    } finally {
      setRuntypeTtsLoader(null);
    }
  });
});
