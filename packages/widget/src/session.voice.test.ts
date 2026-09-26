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
      | ((
          role: 'user' | 'assistant',
          text: string,
          isFinal: boolean,
          metadata?: { turnId?: string },
        ) => void)
      | null;
    metricsCb: ((m: VoiceMetrics) => void) | null;
    statusCb: ((s: string) => void) | null;
    errorCb: ((e: Error) => void) | null;
  } = { transcriptCb: null, metricsCb: null, statusCb: null, errorCb: null };

  const fakeProvider = {
    type: 'runtype' as const,
    connect: async () => {},
    disconnect: async () => {},
    startListening: async () => {},
    stopListening: async () => {},
    stopPlayback: () => {},
    onResult: () => {},
    onError: (cb: typeof state.errorCb) => {
      state.errorCb = cb;
    },
    onStatusChange: (cb: typeof state.statusCb) => {
      state.statusCb = cb;
    },
    onTranscript: (cb: typeof state.transcriptCb) => {
      state.transcriptCb = cb;
    },
    onMetrics: (cb: typeof state.metricsCb) => {
      state.metricsCb = cb;
    },
  };

  return { state, fakeProvider };
});

// The session reaches the provider factory through the lazy voice-runtime
// chunk loader; mock the loader so setupVoice adopts the fake provider.
vi.mock('./voice-runtime-loader', () => ({
  setVoiceRuntimeLoader: () => {},
  loadVoiceRuntime: () =>
    Promise.resolve({
      createVoiceProvider: () => h.fakeProvider,
      createBestAvailableVoiceProvider: () => h.fakeProvider,
      isVoiceSupported: () => true,
    }),
}));

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

  beforeEach(async () => {
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
    // Provider construction now happens when the lazy voice-runtime chunk
    // resolves (the vitest alias makes that a few microtask hops); wait for
    // the wiring before the synchronous assertions below.
    await new Promise((resolve) => setTimeout(resolve, 0));
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

describe('AgentWidgetSession - turn-keyed (full-duplex) voice transcripts', () => {
  let session: AgentWidgetSession;
  let messages: AgentWidgetMessage[] = [];
  let streaming = false;

  const drive = (
    role: 'user' | 'assistant',
    text: string,
    isFinal: boolean,
    turnId: string,
  ) => h.state.transcriptCb!(role, text, isFinal, { turnId });
  const view = () => messages.map((m) => [m.role, m.content]);
  const byContent = (content: string) => messages.find((m) => m.content === content)!;
  const spoken = (id: string) =>
    (session as unknown as { ttsSpokenMessageIds: Set<string> }).ttsSpokenMessageIds.has(id);

  beforeEach(async () => {
    h.state.transcriptCb = null;
    h.state.statusCb = null;
    h.state.errorCb = null;
    messages = [];
    streaming = false;
    session = new AgentWidgetSession(
      {
        apiUrl: 'http://localhost:8000',
        voiceRecognition: {
          enabled: true,
          provider: { type: 'runtype', runtype: { agentId: 'a1' } },
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
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('upserts one bubble per (turnId, role) and waits without an empty placeholder', () => {
    drive('user', 'what are', false, 'u1');
    drive('user', 'what are your hours?', true, 'u1');
    expect(view()).toEqual([['user', 'what are your hours?']]);
    expect(messages[0].voiceProcessing).toBe(false);
    expect(streaming).toBe(true); // standalone typing indicator, no placeholder bubble

    drive('assistant', 'We open', false, 'a1');
    drive('assistant', 'We open at nine.', true, 'a1');
    expect(view()).toEqual([
      ['user', 'what are your hours?'],
      ['assistant', 'We open at nine.'],
    ]);
    expect(messages[1]).toMatchObject({ streaming: false, voiceProcessing: false });
    expect(spoken(messages[1].id)).toBe(true);
    expect(streaming).toBe(false);
  });

  it('keeps an overlapping next user turn separate from the reply still streaming', () => {
    drive('user', 'first question', true, 'u1');
    drive('assistant', 'Here is', false, 'a1');
    drive('user', 'and also', false, 'u2'); // user N+1 interim while assistant N streams
    drive('assistant', 'Here is the full answer.', false, 'a1');
    expect(view()).toEqual([
      ['user', 'first question'],
      ['assistant', 'Here is the full answer.'],
      ['user', 'and also'],
    ]);
    expect(byContent('Here is the full answer.').streaming).toBe(true);
    expect(byContent('and also').voiceProcessing).toBe(true);

    drive('assistant', 'Here is the full answer.', true, 'a1');
    drive('user', 'and also the price?', true, 'u2');
    expect(view()).toEqual([
      ['user', 'first question'],
      ['assistant', 'Here is the full answer.'],
      ['user', 'and also the price?'],
    ]);
    expect(streaming).toBe(true); // u2 awaits its reply

    drive('assistant', 'It costs $5.', true, 'a2');
    expect(view().at(-1)).toEqual(['assistant', 'It costs $5.']);
    expect(streaming).toBe(false);
  });

  it('separates overlapping turns that share one turnId per user/assistant pair', () => {
    drive('user', 'one', true, 't1');
    drive('assistant', 'Reply', false, 't1');
    drive('user', 'two', false, 't2');
    drive('assistant', 'Reply one.', true, 't1');
    drive('user', 'two?', true, 't2');
    drive('assistant', 'Reply two.', true, 't2');
    expect(view()).toEqual([
      ['user', 'one'],
      ['assistant', 'Reply one.'],
      ['user', 'two?'],
      ['assistant', 'Reply two.'],
    ]);
  });

  it('renders a late user transcript above its own turn reply', () => {
    drive('assistant', 'Sure, I can', false, 't1');
    drive('user', 'next thing', false, 't2');
    drive('user', 'Can you help?', true, 't1');
    expect(view()).toEqual([
      ['user', 'Can you help?'],
      ['assistant', 'Sure, I can'],
      ['user', 'next thing'],
    ]);
    // Later frames keep the reordered bubble in place.
    drive('user', 'Can you help me?', true, 't1');
    drive('assistant', 'Sure, I can help.', true, 't1');
    expect(view()).toEqual([
      ['user', 'Can you help me?'],
      ['assistant', 'Sure, I can help.'],
      ['user', 'next thing'],
    ]);
  });

  it('stopping playback discards the rest of the in-flight reply only', () => {
    drive('user', 'tell me a story', true, 't1');
    drive('assistant', 'Once upon', false, 't1');
    session.stopVoicePlayback();
    expect(byContent('Once upon')).toMatchObject({ streaming: false, voiceProcessing: false });
    expect(streaming).toBe(false);

    drive('assistant', 'Once upon a time there was', true, 't1');
    drive('user', 'something else', true, 't2');
    drive('assistant', 'Sure.', true, 't2');
    expect(view()).toEqual([
      ['user', 'tell me a story'],
      ['assistant', 'Once upon'],
      ['user', 'something else'],
      ['assistant', 'Sure.'],
    ]);
  });

  it('stopping while a turn awaits its reply drops that reply until the next user turn', () => {
    drive('user', 'old question', true, 'u1');
    session.stopVoicePlayback();
    expect(streaming).toBe(false);
    drive('assistant', 'cancelled answer', true, 'a1');
    drive('user', 'new question', true, 'u2');
    drive('assistant', 'new answer', true, 'a2');
    expect(view()).toEqual([
      ['user', 'old question'],
      ['user', 'new question'],
      ['assistant', 'new answer'],
    ]);
  });

  it('survives listening status mid-call and settles everything when the call ends', () => {
    drive('user', 'hello', true, 'u1');
    drive('assistant', 'Hi the', false, 'a1');
    h.state.statusCb!('listening');
    expect(byContent('Hi the').streaming).toBe(true);
    drive('assistant', 'Hi there', false, 'a1');
    drive('user', 'bye', false, 'u2');
    h.state.statusCb!('idle');
    expect(messages.some((m) => m.streaming || m.voiceProcessing)).toBe(false);
    expect(view()).toEqual([
      ['user', 'hello'],
      ['assistant', 'Hi there'],
      ['user', 'bye'],
    ]);
    expect(streaming).toBe(false);
    expect(spoken(byContent('Hi there').id)).toBe(true);
  });

  it('shows the processing error when the awaited reply fails', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    drive('user', 'hello', true, 'u1');
    h.state.errorCb!(new Error('boom'));
    consoleError.mockRestore();
    expect(view()).toEqual([
      ['user', 'hello'],
      ['assistant', 'Voice processing failed. Please try again.'],
    ]);
    expect(streaming).toBe(false);
  });

  it('keeps the untagged alternating path for transcripts without a turnId', () => {
    h.state.transcriptCb!('user', 'hi', true);
    expect(messages.map((m) => [m.role, m.content, m.streaming])).toEqual([
      ['user', 'hi', false],
      ['assistant', '', true], // legacy placeholder is still injected
    ]);
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
