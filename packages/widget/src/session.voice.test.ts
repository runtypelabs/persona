// Session-level wiring for the realtime (runtype) voice path (Option B).
//
// The provider's protocol behavior is covered in voice/voice.test.ts; here we
// mock the voice factory to a fake provider and drive its onTranscript/onMetrics
// callbacks to verify how session.setupVoice() feeds the chat thread.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  AgentWidgetEvent,
  AgentWidgetMessage,
  VoiceMetrics,
  VoiceDelegationRequest,
  VoiceSessionBridge,
  VoiceTranscriptMetadata,
} from './types';

/** A delegation request; utterance ids and messages default to empty. */
const req = (request: Partial<VoiceDelegationRequest> & { delegationId: string; userText: string }) => ({
  userUtteranceIds: [],
  messages: [],
  ...request,
});

// vi.mock is hoisted above module init, so the shared fake must be hoisted too.
const h = vi.hoisted(() => {
  const state: {
    transcriptCb:
      | ((
          role: 'user' | 'assistant',
          text: string,
          isFinal: boolean,
          metadata?: VoiceTranscriptMetadata,
        ) => void)
      | null;
    metricsCb: ((m: VoiceMetrics) => void) | null;
    statusCb: ((s: string) => void) | null;
    errorCb: ((e: Error) => void) | null;
    bridge: VoiceSessionBridge | null;
    prewarms: number;
  } = { transcriptCb: null, metricsCb: null, statusCb: null, errorCb: null, bridge: null, prewarms: 0 };

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
    prewarm: () => {
      state.prewarms += 1;
    },
    setSessionBridge: (bridge: VoiceSessionBridge) => {
      state.bridge = bridge;
    },
  };

  return { state, fakeProvider };
});

// The session reaches the provider factory through the lazy voice-runtime
// chunk loader; mock the loader so setupVoice adopts the fake provider.
vi.mock('./voice-runtime-loader', () => ({
  setVoiceRuntimeLoader: () => {},
  // The body runs after module init, so the statically imported class is bound.
  loadVoiceRuntime: () =>
    Promise.resolve({
      createVoiceProvider: () => h.fakeProvider,
      createBestAvailableVoiceProvider: () => h.fakeProvider,
      isVoiceSupported: () => true,
      KeyedVoiceTranscript,
      createVoiceSessionBridge,
    }),
}));

import { KeyedVoiceTranscript } from './voice/keyed-voice-transcript';
import { createVoiceSessionBridge } from './voice/voice-delegation';

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

  it('stopping while a turn awaits its reply still renders a later reply under a new turnId', () => {
    // The provider drops the cancelled reply until the server acknowledges the
    // stop; anything after that (e.g. a delegation result the stop didn't
    // cancel) is audible, so it must get a bubble.
    drive('user', 'old question', true, 'u1');
    session.stopVoicePlayback();
    expect(streaming).toBe(false);
    drive('assistant', 'The answer you asked for.', true, 'a1');
    expect(view()).toEqual([
      ['user', 'old question'],
      ['assistant', 'The answer you asked for.'],
    ]);
    expect(spoken(byContent('The answer you asked for.').id)).toBe(true);
  });

  it('keeps late bubbles placed ahead of the same reply in startMs order', () => {
    h.state.transcriptCb!('assistant', 'reply', true, { turnId: 'a1', startMs: 2000 });
    h.state.transcriptCb!('user', 'at one second', true, { turnId: 'u1', startMs: 1000 });
    h.state.transcriptCb!('user', 'at 1.5 seconds', true, { turnId: 'u2', startMs: 1500 });
    expect(view().map((v) => v[1])).toEqual(['at one second', 'at 1.5 seconds', 'reply']);
    const seq = (content: string) => byContent(content).sequence!;
    expect(seq('at one second')).toBeLessThan(seq('at 1.5 seconds'));
    expect(seq('at 1.5 seconds')).toBeLessThan(seq('reply'));
    expect(byContent('at one second').createdAt).toBe(byContent('reply').createdAt);
  });

  it('re-positions a bubble when its startMs arrives on a later update', () => {
    drive('user', 'first', true, 'u1');
    h.state.transcriptCb!('assistant', 'reply', true, { turnId: 'a1', startMs: 2000 });
    h.state.transcriptCb!('user', 'spoke ear', false, { turnId: 'u2' }); // no timestamp yet
    expect(view().map((v) => v[1])).toEqual(['first', 'reply', 'spoke ear']);
    h.state.transcriptCb!('user', 'spoke early', true, { turnId: 'u2', startMs: 1000 });
    expect(view().map((v) => v[1])).toEqual(['first', 'spoke early', 'reply']);
  });

  it('orders a late-arriving utterance by its startMs among the call\'s bubbles', () => {
    const at = (role: 'user' | 'assistant', text: string, turnId: string, startMs?: number) =>
      h.state.transcriptCb!(role, text, true, { turnId, ...(startMs !== undefined && { startMs }) });
    at('user', 'first', 'u1', 0);
    at('assistant', 'reply one', 'a1', 2000);
    at('assistant', 'reply two', 'a2', 5000);
    at('user', 'spoke at one second', 'u2', 1000); // transcribed late
    at('user', 'spoke at four seconds', 'u3', 4000);
    at('user', 'no timestamp', 'u4');
    expect(view()).toEqual([
      ['user', 'first'],
      ['user', 'spoke at one second'],
      ['assistant', 'reply one'],
      ['user', 'spoke at four seconds'],
      ['assistant', 'reply two'],
      ['user', 'no timestamp'],
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

  it('closes a partially streamed reply on a voice error so the composer unlocks', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    drive('user', 'hello', true, 'u1');
    drive('assistant', 'Hi, I was saying', false, 'a1');
    expect(streaming).toBe(true);
    h.state.errorCb!(new Error('boom'));
    consoleError.mockRestore();
    expect(view()).toEqual([
      ['user', 'hello'],
      ['assistant', 'Hi, I was saying'],
      ['assistant', 'Voice processing failed. Please try again.'],
    ]);
    expect(messages.some((m) => m.streaming || m.voiceProcessing)).toBe(false);
    expect(streaming).toBe(false);
    expect(session.isStreaming()).toBe(false);
    expect(spoken(byContent('Hi, I was saying').id)).toBe(true);
  });

  it('keeps the untagged alternating path for transcripts without a turnId', () => {
    h.state.transcriptCb!('user', 'hi', true);
    expect(messages.map((m) => [m.role, m.content, m.streaming])).toEqual([
      ['user', 'hi', false],
      ['assistant', '', true], // legacy placeholder is still injected
    ]);
  });
});

describe('AgentWidgetSession - voice client delegation bridge', () => {
  type Dispatch = (
    options: { messages: AgentWidgetMessage[]; signal?: AbortSignal },
    onEvent: (event: AgentWidgetEvent) => void,
  ) => Promise<void>;

  let session: AgentWidgetSession;
  let messages: AgentWidgetMessage[] = [];
  let dispatch: ReturnType<typeof vi.fn<Dispatch>>;

  const drive = (role: 'user' | 'assistant', text: string, isFinal: boolean, turnId: string) =>
    h.state.transcriptCb!(role, text, isFinal, { turnId });
  const view = () => messages.map((m) => [m.role, m.content]);
  const spoken = (id: string) =>
    (session as unknown as { ttsSpokenMessageIds: Set<string> }).ttsSpokenMessageIds.has(id);
  const reply = (onEvent: (event: AgentWidgetEvent) => void, text: string, id = 'assistant-r1') => {
    const base = { id, role: 'assistant' as const, createdAt: new Date().toISOString() };
    onEvent({ type: 'status', status: 'connecting' });
    onEvent({ type: 'message', message: { ...base, content: text.slice(0, 4), streaming: true } });
    onEvent({ type: 'message', message: { ...base, content: text, streaming: false } });
    onEvent({ type: 'status', status: 'idle' });
  };

  beforeEach(async () => {
    h.state.transcriptCb = null;
    h.state.bridge = null;
    messages = [];
    session = new AgentWidgetSession(
      {
        apiUrl: 'http://localhost:8000',
        initialMessages: [
          { id: 'm0', role: 'assistant', content: 'Welcome! How can I help?', createdAt: '2026-01-01T00:00:00.000Z' },
        ],
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
        onStreamingChanged: () => {},
        onError: () => {},
      },
    );
    dispatch = vi.fn<Dispatch>();
    (session as unknown as { client: { dispatch: Dispatch } }).client.dispatch = dispatch;
    session.setupVoice();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('passes clientDelegation and callContext through to the runtype provider config', () => {
    const config = (
      session as unknown as { getVoiceConfigFromConfig(): { runtype?: Record<string, unknown> } }
    );
    const callContext = () => 'ctx';
    session.updateConfig({
      apiUrl: 'http://localhost:8000',
      voiceRecognition: {
        enabled: true,
        provider: { type: 'runtype', runtype: { agentId: 'a1', clientDelegation: false, callContext } },
      },
    });
    expect(config.getVoiceConfigFromConfig().runtype).toMatchObject({ clientDelegation: false, callContext });
  });

  it('hands the provider a bridge whose history is the visible settled messages', () => {
    drive('user', 'still talk', false, 'u1'); // interim: not part of the context
    // An earlier call's captions (filler, small talk) aren't conversation either.
    h.state.transcriptCb!('assistant', 'Let me check.', true, { turnId: 'f0', caption: true });
    h.state.transcriptCb!('user', 'hi there', true, { turnId: 'u0', caption: true });
    expect(h.state.bridge!.getHistory()).toEqual([
      { role: 'assistant', content: 'Welcome! How can I help?' },
    ]);
  });

  it('submits the transcript bubble as the user message once and answers with the reply', async () => {
    drive('user', 'whats the weather in paris', true, 'u1');
    drive('assistant', 'Let me check that.', true, 'f1'); // filler stays visible
    dispatch.mockImplementation(async (_options, onEvent) => reply(onEvent, 'It is **sunny** in Paris.'));

    const result = await h.state.bridge!.runDelegatedTurn(req({
      delegationId: 'd1',
      userText: "What's the weather in Paris?" }));

    expect(result).toEqual({ status: 'completed', text: 'It is **sunny** in Paris.' });
    const sent = dispatch.mock.calls[0][0].messages;
    const userTurns = sent.filter((m) => m.role === 'user');
    expect(userTurns).toHaveLength(1);
    expect(userTurns[0]).toMatchObject({
      content: 'whats the weather in paris',
      llmContent: "What's the weather in Paris?",
      viaVoice: true,
    });
    expect(view()).toEqual([
      ['assistant', 'Welcome! How can I help?'],
      ['user', 'whats the weather in paris'],
      ['assistant', 'Let me check that.'],
      ['assistant', 'It is **sunny** in Paris.'],
    ]);
    expect(spoken('assistant-r1')).toBe(true);
    expect(session.isStreaming()).toBe(false);
  });

  it('captions speech in a delegated call and ends the request on the submitted bubble', async () => {
    const caption = (role: 'user' | 'assistant', text: string, isFinal: boolean, turnId: string) =>
      h.state.transcriptCb!(role, text, isFinal, { turnId, caption: true });
    caption('user', 'hi there', true, 'u0'); // never delegated
    caption('user', 'What are your opening hours', true, 'u1');
    caption('assistant', "Yeah, I'll", false, 'f1'); // filler, still streaming
    dispatch.mockImplementation(async (_options, onEvent) => reply(onEvent, 'We open at nine.'));

    await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'What are your opening hours' }));

    const sent = dispatch.mock.calls[0][0].messages;
    const conversation = sent.filter((m) => !m.voiceCaption);
    expect(conversation.map((m) => [m.role, m.content])).toEqual([
      ['assistant', 'Welcome! How can I help?'],
      ['user', 'What are your opening hours'],
    ]);
    expect(sent[sent.length - 1].content).toBe('What are your opening hours');
    // The display keeps every caption, in spoken order.
    expect(view()).toEqual([
      ['assistant', 'Welcome! How can I help?'],
      ['user', 'hi there'],
      ['user', 'What are your opening hours'],
      ['assistant', "Yeah, I'll"],
      ['assistant', 'We open at nine.'],
    ]);
    expect(messages.find((m) => m.content === 'What are your opening hours')!.voiceCaption).toBeUndefined();
    expect(messages.find((m) => m.content === "Yeah, I'll")!.voiceCaption).toBe(true);

    // A later typed turn doesn't send the captions either.
    dispatch.mockImplementation(async (_options, onEvent) => reply(onEvent, 'Yes.', 'assistant-r2'));
    await session.sendMessage('and on sundays?');
    const typed = dispatch.mock.calls[1][0].messages.filter((m) => !m.voiceCaption);
    expect(typed.map((m) => m.content)).toEqual([
      'Welcome! How can I help?',
      'What are your opening hours',
      'We open at nine.',
      'and on sundays?',
    ]);
  });

  it('trims GPT-Live\'s leading space from bubbles and the submitted request', async () => {
    h.state.transcriptCb!('user', ' What are your opening hours', true, { turnId: 'u1', caption: true });
    dispatch.mockImplementation(async (_options, onEvent) => reply(onEvent, 'Nine to five.'));
    await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: ' What are your opening hours' }));
    const user = dispatch.mock.calls[0][0].messages.find((m) => m.role === 'user')!;
    expect(user.content).toBe('What are your opening hours');
    expect(user.llmContent).toBeUndefined();
  });

  it('keeps a filler finalized after delegation completes, beside the rendered result', async () => {
    // Core rotates the assistant transcript id at delegation_completed: the
    // filler's late final keeps its old id (and its bubble), while the
    // read-back under the new id is folded by the provider before it gets here.
    const caption = (role: 'user' | 'assistant', text: string, isFinal: boolean, turnId: string) =>
      h.state.transcriptCb!(role, text, isFinal, { turnId, caption: true });
    caption('user', 'What are your opening hours', true, 'u1');
    caption('assistant', "Yeah, I'll", false, 'f1');
    dispatch.mockImplementation(async (_options, onEvent) => reply(onEvent, 'We open at nine.'));
    await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'What are your opening hours' }));
    caption('assistant', "Yeah, I'll check.", true, 'f1'); // late final, after delegation_completed

    const filler = messages.find((m) => m.content === "Yeah, I'll check.")!;
    expect(filler).toMatchObject({ streaming: false, voiceProcessing: false, voiceCaption: true });
    expect(view()).toEqual([
      ['assistant', 'Welcome! How can I help?'],
      ['user', 'What are your opening hours'],
      ['assistant', "Yeah, I'll check."],
      ['assistant', 'We open at nine.'],
    ]);
    expect(session.isStreaming()).toBe(false);
  });

  it('ends the request on the submitted bubble even when a typed turn finished after it', async () => {
    drive('user', 'voice question', true, 'u1');
    dispatch.mockImplementationOnce(async (_options, onEvent) => reply(onEvent, 'Typed answer.', 'assistant-typed'));
    await session.sendMessage('typed question');
    dispatch.mockImplementationOnce(async (_options, onEvent) => reply(onEvent, 'Voice answer.'));
    await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'voice question' }));
    const sent = dispatch.mock.calls[1][0].messages;
    expect(sent[sent.length - 1]).toMatchObject({ role: 'user', content: 'voice question' });
    expect(sent.filter((m) => m.content === 'voice question')).toHaveLength(1);
  });

  it('keeps the transcript text as-is when it matches the request', async () => {
    drive('user', 'Book a table.', true, 'u1');
    dispatch.mockImplementation(async (_options, onEvent) => reply(onEvent, 'Booked.'));
    await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'Book a table.' }));
    const user = dispatch.mock.calls[0][0].messages.find((m) => m.role === 'user')!;
    expect(user.content).toBe('Book a table.');
    expect(user.llmContent).toBeUndefined();
  });

  it('appends a user message when no transcript bubble is available', async () => {
    dispatch.mockImplementation(async (_options, onEvent) => reply(onEvent, 'Done.'));
    const result = await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'Turn on dark mode' }));
    expect(result).toEqual({ status: 'completed', text: 'Done.' });
    expect(view()).toEqual([
      ['assistant', 'Welcome! How can I help?'],
      ['user', 'Turn on dark mode'],
      ['assistant', 'Done.'],
    ]);
    expect(messages[1].viaVoice).toBe(true);
  });

  it('answers ok:false when the turn errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    drive('user', 'do the thing', true, 'u1');
    dispatch.mockRejectedValue(new Error('upstream exploded'));
    const result = await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'do the thing' }));
    consoleError.mockRestore();
    expect(result.status).toBe('failed');
    // The visible user message is still exactly the transcript bubble.
    expect(messages.filter((m) => m.role === 'user')).toHaveLength(1);
  });

  it('answers ok:false when the visitor stops the turn', async () => {
    drive('user', 'long task', true, 'u1');
    dispatch.mockImplementation(
      (options) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    const pending = h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'long task' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    session.cancel();
    expect(await pending).toEqual({ status: 'failed', text: '' });
  });

  const parkOnApproval = (approval: Partial<NonNullable<AgentWidgetMessage['approval']>> = {}, key = 'ap1') =>
    dispatch.mockImplementationOnce(async (_options, onEvent) => {
      const createdAt = new Date().toISOString();
      onEvent({ type: 'status', status: 'connecting' });
      onEvent({ type: 'message', message: { id: `r-${key}`, role: 'assistant', content: 'I can do that.', createdAt } });
      onEvent({
        type: 'message',
        message: {
          id: `approval-${key}`,
          role: 'assistant',
          content: '',
          createdAt,
          variant: 'approval',
          approval: {
            id: key,
            status: 'pending',
            agentId: 'a1',
            executionId: 'e1',
            toolName: 'place_pickup_order',
            description: 'Place a pickup order at the bakery',
            parameters: {
              items: [
                { name: 'almond croissants', quantity: 2 },
                { name: 'sourdough loaf', quantity: 1 },
              ],
              pickupTime: 'today 4pm',
              customerName: 'Nathan',
              _approvalReason: 'hidden',
            },
            reason: 'The visitor asked for a pickup order',
            ...approval,
          },
        },
      });
      onEvent({ type: 'status', status: 'idle' });
    });
  const internals = () =>
    session as unknown as {
      client: { resolveApproval: (...args: unknown[]) => Promise<unknown> };
      handleEvent: (event: AgentWidgetEvent) => void;
      abortController: AbortController | null;
    };
  /** The approval round-trip resumes the turn with `text` (or no body). */
  const resumeWith = (text: string | null) => {
    internals().client.resolveApproval = async () => (text === null ? undefined : new ReadableStream());
    vi.spyOn(session, 'connectStream').mockImplementation(async () => {
      reply(internals().handleEvent, text!, 'assistant-after');
      internals().abortController = null;
    });
  };
  const approvalOf = (key = 'ap1') => messages.find((m) => m.id === `approval-${key}`)!.approval!;

  it('asks for a parked approval in words the voice model can say', async () => {
    drive('user', 'order two croissants', true, 'u1');
    parkOnApproval();
    const result = await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'order two croissants' }));
    expect(result.status).not.toBe('failed');
    expect(result.text).toBe(
      'I can do that.\n\n' +
        "This action needs the user's approval in the chat before it happens:\n" +
        '- place pickup order (Place a pickup order at the bakery) with items: 2 almond croissants, 1 sourdough loaf; ' +
        'pickup time: today 4pm; customer name: Nathan because: The visitor asked for a pickup order\n\n' +
        "Briefly tell the user what you're about to do and ask them to approve or decline it in the chat. Don't claim it's done.",
    );
    expect(result.followUp).toBeTypeOf('function');
  });

  it('follows up with the answer once the visitor approves, kept off browser TTS', async () => {
    drive('user', 'order two croissants', true, 'u1');
    parkOnApproval();
    const result = await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'order two croissants' }));
    const followUp = result.followUp!({ signal: new AbortController().signal });
    resumeWith('Your order is in: pickup today at 4pm.');
    await session.resolveApproval(approvalOf(), 'approved');
    expect(await followUp).toEqual({ status: 'completed', text: 'Your order is in: pickup today at 4pm.' });
    expect(spoken('assistant-after')).toBe(true);
  });

  it("follows up once its own approval is decided, not another turn's", async () => {
    drive('user', 'order two croissants', true, 'u1');
    parkOnApproval();
    const first = await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'order two croissants' }));
    const followUp = first.followUp!({ signal: new AbortController().signal });
    drive('user', 'and a cake', true, 'u2');
    parkOnApproval({ toolName: 'order_cake' }, 'ap2');
    await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd2', userText: 'and a cake' }));
    expect(approvalOf('ap2').status).toBe('pending');

    resumeWith('Croissants ordered.');
    await session.resolveApproval(approvalOf(), 'approved');
    expect(await followUp).toEqual({ status: 'completed', text: 'Croissants ordered.' });
    expect(approvalOf('ap2').status).toBe('pending');
  });

  describe('Amendment 4: voice decline, supersede, expiry', () => {
    const park = async (key = 'ap1', toolName = 'place_pickup_order') => {
      parkOnApproval({ toolName }, key);
      const result = await h.state.bridge!.runDelegatedTurn(req({ delegationId: `d-${key}`, userText: 'order two croissants' }));
      return { result, followUp: result.followUp!({ signal: new AbortController().signal }) };
    };

    it('declines the one pending voice approval on an unambiguous "cancel that", silently for its follow-up', async () => {
      const first = await park();
      expect(first.result.status).toBe('pending_approval');
      resumeWith(null);
      const decline = await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd2', userText: ' No, cancel that.' }));
      expect(decline).toEqual({
        status: 'denied',
        text: 'Okay, I cancelled the place pickup order request. Nothing was done.',
      });
      expect(dispatch).toHaveBeenCalledTimes(1); // no chat turn for the decline
      expect(approvalOf().status).toBe('denied');
      // The parked delegation still gets its one terminal result, with nothing to say.
      expect(await first.followUp).toEqual({ status: 'denied', text: '' });
    });

    it.each(['no wait, make it three', 'yes', 'sure, go ahead', 'cancel the cake and add bread'])(
      'never decides by voice on "%s": the turn runs normally',
      async (userText) => {
        await park();
        dispatch.mockImplementationOnce(async (_options, onEvent) => reply(onEvent, 'Okay.', 'assistant-next'));
        const result = await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd2', userText }));
        expect(result.status).toBe('completed');
        expect(dispatch).toHaveBeenCalledTimes(2);
        expect(approvalOf().status).toBe('pending');
      },
    );

    it('runs "cancel" normally when more than one voice approval waits', async () => {
      await park('ap1');
      await park('ap2', 'order_cake');
      dispatch.mockImplementationOnce(async (_options, onEvent) => reply(onEvent, 'Which one?', 'assistant-next'));
      const result = await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd3', userText: 'cancel it' }));
      expect(result.status).toBe('completed');
      expect(approvalOf('ap1').status).toBe('pending');
      expect(approvalOf('ap2').status).toBe('pending');
    });

    it('supersedes an earlier pending approval for the same tool, and leaves other tools alone', async () => {
      const first = await park('ap1');
      const cake = await park('ap2', 'order_cake');
      resumeWith(null);
      const second = await park('ap3');
      expect(second.result.status).toBe('pending_approval');
      expect(approvalOf('ap1').status).toBe('denied');
      expect(approvalOf('ap2').status).toBe('pending');
      expect(await first.followUp).toEqual({
        status: 'cancelled',
        text: 'The earlier place pickup order request was replaced by the new one; it was not done.',
      });
      void cake;
    });

    it('expires an unanswered voice approval after approvalTimeoutMs', async () => {
      parkOnApproval();
      const result = await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'order two croissants' }));
      resumeWith(null);
      const followUp = await result.followUp!({ signal: new AbortController().signal, approvalTimeoutMs: 60 });
      expect(followUp).toEqual({ status: 'timeout', text: 'That place pickup order request expired, so nothing was done.' });
      expect(approvalOf().status).toBe('denied');
    });

    it('leaves the approval pending on hang-up (no auto-decline)', async () => {
      parkOnApproval();
      const result = await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'order two croissants' }));
      const call = new AbortController();
      const followUp = result.followUp!({ signal: call.signal, approvalTimeoutMs: 60 });
      call.abort();
      expect(await followUp).toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(approvalOf().status).toBe('pending');
    });

    /** One turn that parks on two approvals: a pickup order and a cake. */
  const parkTwo = () =>
    dispatch.mockImplementationOnce(async (_options, onEvent) => {
      const createdAt = new Date().toISOString();
      onEvent({ type: 'status', status: 'connecting' });
      for (const [key, toolName] of [['ap1', 'place_pickup_order'], ['ap2', 'order_cake']]) {
        onEvent({
          type: 'message',
          message: {
            id: `approval-${key}`,
            role: 'assistant',
            content: '',
            createdAt,
            variant: 'approval',
            approval: { id: key, status: 'pending', agentId: 'a1', executionId: 'e1', toolName, description: '' },
          },
        });
      }
      onEvent({ type: 'status', status: 'idle' });
    });
  /** Like resumeWith, but the resumed stream arrives after a network-like delay. */
  const resumeLater = (text: string) => {
    internals().client.resolveApproval = async () => new ReadableStream();
    vi.spyOn(session, 'connectStream').mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
      reply(internals().handleEvent, text, `assistant-${text.length}`);
      internals().abortController = null;
    });
  };

  it('replaces only the same-tool approval of an earlier turn, keeping its other approvals', async () => {
    parkTwo();
    const first = await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'croissants and a cake' }));
    const followUp = first.followUp!({ signal: new AbortController().signal });
    resumeWith(null);
    parkOnApproval({}, 'ap3');
    await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd2', userText: 'make it three croissants' }));
    expect(approvalOf('ap1').status).toBe('denied');
    expect(approvalOf('ap2').status).toBe('pending'); // the cake still waits
    resumeLater('Cake ordered.');
    await session.resolveApproval(approvalOf('ap2'), 'approved');
    expect(await followUp).toEqual({
      status: 'completed',
      text: 'Cake ordered.\n\nThe earlier place pickup order request was replaced by the new one; it was not done.',
    });
  });

  it('reads back an allowed action and states the declined one when a turn gets both decisions', async () => {
    parkTwo();
    const result = await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'croissants and a cake' }));
    const followUp = result.followUp!({ signal: new AbortController().signal });
    resumeLater('Croissants ordered: JB-1234.');
    await session.resolveApproval(approvalOf('ap1'), 'approved');
    resumeWith(null);
    await session.resolveApproval(approvalOf('ap2'), 'denied');
    expect(await followUp).toEqual({
      status: 'completed',
      text: 'Croissants ordered: JB-1234.\n\nThe user declined the order cake request in the chat, so that part was not done.',
    });
  });

  it('expires an approval even when nothing will be read back (server without followUpFrames)', async () => {
    parkOnApproval();
    const result = await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'order two croissants' }));
    resumeWith(null);
    const followUp = await result.followUp!({
      signal: new AbortController().signal,
      approvalTimeoutMs: 60,
      readBack: false,
    });
    expect(followUp?.status).toBe('timeout');
    expect(approvalOf().status).toBe('denied');
  });

  it('reads each parked turn back with its own answer when both wait at once', async () => {
    parkOnApproval({}, 'ap1');
    const first = await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'order croissants' }));
    const firstFollowUp = first.followUp!({ signal: new AbortController().signal });
    parkOnApproval({ toolName: 'order_cake' }, 'ap2');
    const second = await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd2', userText: 'and a cake' }));
    const secondFollowUp = second.followUp!({ signal: new AbortController().signal });

    resumeLater('Croissants ordered.');
    await session.resolveApproval(approvalOf('ap1'), 'approved');
    expect(await firstFollowUp).toEqual({ status: 'completed', text: 'Croissants ordered.' });
    resumeLater('Cake ordered!');
    await session.resolveApproval(approvalOf('ap2'), 'approved');
    expect(await secondFollowUp).toEqual({ status: 'completed', text: 'Cake ordered!' });
  });

  it('a new request replaces a parked voice WebMCP approval instead of waiting on it', async () => {
      const internals = session as unknown as { webMcpResolveControllers: Set<AbortController> };
      dispatch.mockImplementationOnce(async (_options, onEvent) => {
        reply(onEvent, 'Adding it now.');
        internals.webMcpResolveControllers.add(new AbortController());
        void session.requestWebMcpApproval({ toolName: 'add_to_cart', args: { sku: 'AB-1' }, reason: 'gate' });
      });
      const first = await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'add it to my cart' }));
      expect(first.status).toBe('pending_approval');
      const followUp = first.followUp!({ signal: new AbortController().signal });

      dispatch.mockImplementationOnce(async (_options, onEvent) => reply(onEvent, 'We open at nine.', 'assistant-hours'));
      const second = await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd2', userText: 'when do you open' }));
      expect(second).toEqual({ status: 'completed', text: 'We open at nine.' });
      expect(messages.find((m) => m.variant === 'approval')!.approval!.status).toBe('denied');
      expect(await followUp).toEqual({
        status: 'cancelled',
        text: 'The earlier add to cart request was replaced by the new one; it was not done.',
      });
    });
  });

  it('states a decline plainly, even when the agent replies by re-asking', async () => {
    drive('user', 'order two croissants', true, 'u1');
    parkOnApproval();
    const result = await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'order two croissants' }));
    const followUp = result.followUp!({ signal: new AbortController().signal });
    resumeWith('Just to confirm: two almond croissants for 4pm, right?');
    await session.resolveApproval(approvalOf(), 'denied');
    expect(await followUp).toEqual({
      status: 'denied',
      text: 'The user declined the place pickup order request in the chat, so nothing was done.',
    });
  });

  it('follows up with the decline when a denied approval brings no reply', async () => {
    drive('user', 'order two croissants', true, 'u1');
    parkOnApproval();
    const result = await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'order two croissants' }));
    const followUp = result.followUp!({ signal: new AbortController().signal });
    resumeWith(null);
    await session.resolveApproval(approvalOf(), 'denied');
    expect(await followUp).toEqual({
      status: 'denied',
      text: 'The user declined the place pickup order request in the chat, so nothing was done.',
    });
  });

  it('drops the follow-up when the call ends before the visitor decides', async () => {
    drive('user', 'order two croissants', true, 'u1');
    parkOnApproval();
    const result = await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'order two croissants' }));
    const call = new AbortController();
    const followUp = result.followUp!({ signal: call.signal });
    call.abort();
    expect(await followUp).toBeNull();
    expect(approvalOf().status).toBe('pending');
  });

  it('answers with the approval script when the turn stops for an approval', async () => {
    drive('user', 'delete my account', true, 'u1');
    dispatch.mockImplementation(async (_options, onEvent) => {
      const createdAt = new Date().toISOString();
      onEvent({ type: 'status', status: 'connecting' });
      onEvent({ type: 'message', message: { id: 'r1', role: 'assistant', content: 'I can do that.', createdAt } });
      onEvent({
        type: 'message',
        message: {
          id: 'ap1',
          role: 'assistant',
          content: '',
          createdAt,
          variant: 'approval',
          approval: {
            id: 'ap1',
            status: 'pending',
            agentId: 'a1',
            executionId: 'e1',
            toolName: 'delete_account',
            description: 'Delete the account',
          },
        },
      });
      onEvent({ type: 'status', status: 'idle' });
    });
    const result = await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'delete my account' }));
    expect(result.text).toBe(
      'I can do that.\n\n' +
        "This action needs the user's approval in the chat before it happens:\n" +
        '- delete account (Delete the account)\n\n' +
        "Briefly tell the user what you're about to do and ask them to approve or decline it in the chat. Don't claim it's done.",
    );
  });

  it('answers right away when a WebMCP tool parks the turn on the visitor\'s approval', async () => {
    drive('user', 'add it to my cart', true, 'u1');
    const internals = session as unknown as { webMcpResolveControllers: Set<AbortController> };
    const resolve = new AbortController();
    dispatch.mockImplementation(async (_options, onEvent) => {
      reply(onEvent, 'Adding it now.');
      // The page tool's resolve is in flight and waiting on the confirm bubble.
      internals.webMcpResolveControllers.add(resolve);
      void session.requestWebMcpApproval({ toolName: 'add_to_cart', args: {}, reason: 'gate' });
    });
    const result = await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'add it to my cart' }));
    expect(result.status).not.toBe('failed');
    expect(result.text).toMatch(/^Adding it now\.\n\nThis action needs the user's approval in the chat before it happens:\n- add to cart \(/);

    // Approved: the page tool runs, and the resumed turn's answer follows up.
    const followUp = result.followUp!({ signal: new AbortController().signal });
    const approval = messages.find((m) => m.variant === 'approval')!;
    session.resolveWebMcpApproval(approval.id, 'approved');
    (session as unknown as { handleEvent: (event: AgentWidgetEvent) => void }).handleEvent({
      type: 'message',
      message: { id: 'after', role: 'assistant', content: 'Added to your cart.', createdAt: new Date().toISOString() },
    });
    internals.webMcpResolveControllers.delete(resolve);
    expect(await followUp).toEqual({ status: 'completed', text: 'Added to your cart.' });
  });

  it('fails a delegated turn that a typed send replaces, and leaves the typed reply alone', async () => {
    drive('user', 'long voice task', true, 'u1');
    dispatch.mockImplementationOnce(
      (options) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    dispatch.mockImplementationOnce(async (_options, onEvent) => reply(onEvent, 'Typed answer.', 'assistant-typed'));
    const delegated = h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'long voice task' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await session.sendMessage('never mind, typed instead');
    expect(await delegated).toEqual({ status: 'failed', text: '' });
    expect(spoken('assistant-typed')).toBe(false);
  });

  it('claims the bubble named by userTurnId over a text match', async () => {
    drive('user', 'book a table', true, 'u1');
    drive('user', 'book a table', true, 'u2');
    dispatch.mockImplementation(async (_options, onEvent) => reply(onEvent, 'Booked.'));
    await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'book a table', userUtteranceIds: ['u1'] }));
    const sent = dispatch.mock.calls[0][0].messages;
    expect(sent[sent.length - 1].id).toBe(messages.find((m) => m.role === 'user')!.id); // the first bubble
  });

  it('creates the bubble for a userTurnId not transcribed yet, which its transcript then fills', async () => {
    dispatch.mockImplementation(async (_options, onEvent) => reply(onEvent, 'Nine.'));
    await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'opening hours', userUtteranceIds: ['u1'] }));
    h.state.transcriptCb!('user', 'Opening hours?', true, { turnId: 'u1', caption: true });
    expect(view()).toEqual([
      ['assistant', 'Welcome! How can I help?'],
      ['user', 'Opening hours?'],
      ['assistant', 'Nine.'],
    ]);
    expect(messages[1].voiceCaption).toBeUndefined();
  });

  it('submits a split request once: the last utterance carries it, the earlier ones stay captions', async () => {
    const caption = (text: string, turnId: string) =>
      h.state.transcriptCb!('user', text, true, { turnId, caption: true });
    caption('What are your', 'u1');
    caption('opening hours', 'u2');
    dispatch.mockImplementation(async (_options, onEvent) => reply(onEvent, 'Nine to five.'));
    await h.state.bridge!.runDelegatedTurn(req({
      delegationId: 'd1',
      userText: 'What are your opening hours', userUtteranceIds: ['u1', 'u2'] }));

    const sent = dispatch.mock.calls[0][0].messages.filter((m) => !m.voiceCaption);
    expect(sent.filter((m) => m.role === 'user')).toEqual([
      expect.objectContaining({ content: 'opening hours', llmContent: 'What are your opening hours' }),
    ]);
    expect(sent[sent.length - 1].content).toBe('opening hours');
    expect(view()).toEqual([
      ['assistant', 'Welcome! How can I help?'],
      ['user', 'What are your'],
      ['user', 'opening hours'],
      ['assistant', 'Nine to five.'],
    ]);
    expect(messages.find((m) => m.content === 'What are your')!.voiceCaption).toBe(true);

    // The joined utterance is never claimed again by a later request.
    dispatch.mockImplementation(async (_options, onEvent) => reply(onEvent, 'Sure.', 'assistant-r2'));
    await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd2', userText: 'What are your' }));
    expect(messages.filter((m) => m.content === 'What are your')).toHaveLength(2);
    expect(messages.find((m) => m.content === 'What are your' && !m.voiceCaption)).toBeDefined();
  });

  it('reserves a listed utterance not transcribed yet, so it later renders as a caption', async () => {
    h.state.transcriptCb!('user', 'and on sundays', true, { turnId: 'u2', caption: true });
    dispatch.mockImplementation(async (_options, onEvent) => reply(onEvent, 'Closed on Sundays.'));
    await h.state.bridge!.runDelegatedTurn(req({
      delegationId: 'd1',
      userText: 'Your hours and on sundays',
      // The last listed utterance is the request's.
      userUtteranceIds: ['u1', 'u2'],
    }));
    h.state.transcriptCb!('user', 'Your hours', true, { turnId: 'u1', caption: true }); // late
    const late = messages.find((m) => m.content === 'Your hours')!;
    expect(late.voiceCaption).toBe(true);
    expect(messages.find((m) => m.content === 'and on sundays')).toMatchObject({
      llmContent: 'Your hours and on sundays',
    });
    expect(messages.filter((m) => m.role === 'user')).toHaveLength(2);
  });

  it('claims a prefix match when the request beats the final transcript', async () => {
    drive('user', 'What are your opening', false, 'u1');
    dispatch.mockImplementation(async (_options, onEvent) => reply(onEvent, 'Nine.'));
    await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'What are your opening hours?' }));
    expect(messages.filter((m) => m.role === 'user')).toHaveLength(1);
    expect(dispatch.mock.calls[0][0].messages.filter((m) => m.role === 'user')[0]).toMatchObject({
      content: 'What are your opening',
      llmContent: 'What are your opening hours?',
    });
  });

  it('claims nothing rather than another utterance\'s bubble', async () => {
    drive('user', 'how is the weather', true, 'u1');
    dispatch.mockImplementation(async (_options, onEvent) => reply(onEvent, 'Done.'));
    await h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'turn on dark mode' }));
    const users = messages.filter((m) => m.role === 'user').map((m) => m.content);
    expect(users).toEqual(['how is the weather', 'turn on dark mode']);
    const sent = dispatch.mock.calls[0][0].messages;
    expect(sent[sent.length - 1].content).toBe('turn on dark mode');
  });

  it('waits for a chat turn already in flight instead of aborting it', async () => {
    let finishTyped!: () => void;
    dispatch.mockImplementationOnce(
      (_options, onEvent) =>
        new Promise<void>((resolve) => {
          finishTyped = () => {
            reply(onEvent, 'Typed answer.', 'assistant-typed');
            resolve();
          };
        }),
    );
    dispatch.mockImplementationOnce(async (_options, onEvent) => reply(onEvent, 'Voice answer.'));
    const typed = session.sendMessage('typed question');
    drive('user', 'voice question', true, 'u1');
    const delegated = h.state.bridge!.runDelegatedTurn(req({ delegationId: 'd1', userText: 'voice question' }));
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(dispatch).toHaveBeenCalledTimes(1);

    finishTyped();
    await typed;
    expect(await delegated).toEqual({ status: 'completed', text: 'Voice answer.' });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[0][0].signal?.aborted).toBe(false);
    expect(messages.find((m) => m.id === 'assistant-typed')?.content).toBe('Typed answer.');
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

describe('AgentWidgetSession - prewarmVoice', () => {
  const callbacks = {
    onMessagesChanged: () => {},
    onStatusChanged: () => {},
    onStreamingChanged: () => {},
    onError: () => {},
  };
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const runtypeSession = () =>
    new AgentWidgetSession(
      {
        apiUrl: 'http://localhost:8000',
        voiceRecognition: {
          enabled: true,
          provider: { type: 'runtype', runtype: { agentId: 'a1' } },
        },
      },
      callbacks,
    );

  beforeEach(() => {
    h.state.prewarms = 0;
  });

  it("calls the provider's prewarm once setup has installed it", async () => {
    const session = runtypeSession();
    session.setupVoice();
    await flush();
    session.prewarmVoice();
    await flush();
    expect(h.state.prewarms).toBe(1);
  });

  it('waits for a setup still loading the voice runtime', async () => {
    const session = runtypeSession();
    session.setupVoice();
    session.prewarmVoice();
    expect(h.state.prewarms).toBe(0);
    await flush();
    expect(h.state.prewarms).toBe(1);
  });

  it('drops a prewarm whose setup was torn down meanwhile', async () => {
    const session = runtypeSession();
    session.setupVoice();
    session.prewarmVoice();
    session.cleanupVoice();
    await flush();
    expect(h.state.prewarms).toBe(0);
  });

  it('warms the client session on the browser (Web Speech) path', () => {
    const session = new AgentWidgetSession(
      {
        apiUrl: 'http://localhost:8000',
        clientToken: 'ct_test',
        voiceRecognition: { enabled: true, provider: { type: 'browser' } },
      },
      callbacks,
    );
    const warm = vi.spyOn(session, 'warmClientSession').mockImplementation(() => {});
    session.prewarmVoice();
    expect(warm).toHaveBeenCalledOnce();
    expect(h.state.prewarms).toBe(0);
  });
});
