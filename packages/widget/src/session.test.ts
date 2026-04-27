import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AgentWidgetSession, AgentWidgetSessionStatus } from './session';
import { AgentWidgetMessage } from './types';

describe('AgentWidgetSession - Message Injection', () => {
  let session: AgentWidgetSession;
  let messages: AgentWidgetMessage[] = [];
  let _status: AgentWidgetSessionStatus = 'idle';
  let _streaming = false;
  let _lastError: Error | undefined;

  beforeEach(() => {
    messages = [];
    _status = 'idle';
    _streaming = false;
    _lastError = undefined;

    session = new AgentWidgetSession(
      { apiUrl: 'http://localhost:8000' },
      {
        onMessagesChanged: (msgs) => { messages = msgs; },
        onStatusChanged: (s) => { _status = s; },
        onStreamingChanged: (s) => { _streaming = s; },
        onError: (e) => { _lastError = e; }
      }
    );
  });

  describe('injectMessage', () => {
    it('should inject a message with the specified role', () => {
      const result = session.injectMessage({
        role: 'assistant',
        content: 'Hello, how can I help you?'
      });

      expect(result.role).toBe('assistant');
      expect(result.content).toBe('Hello, how can I help you?');
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.sequence).toBeDefined();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(result);
    });

    it('should support llmContent for dual-content messages', () => {
      const result = session.injectMessage({
        role: 'assistant',
        content: '**Full product details**\n- iPhone 15 Pro - $1,199',
        llmContent: '[Product: iPhone 15 Pro, $1,199]'
      });

      expect(result.content).toBe('**Full product details**\n- iPhone 15 Pro - $1,199');
      expect(result.llmContent).toBe('[Product: iPhone 15 Pro, $1,199]');
    });

    it('should support contentParts for multi-modal messages', () => {
      const contentParts = [
        { type: 'text' as const, text: 'Here is the image:' },
        { type: 'image' as const, image: 'data:image/png;base64,abc123', mimeType: 'image/png' }
      ];

      const result = session.injectMessage({
        role: 'user',
        content: 'Here is the image:',
        contentParts
      });

      expect(result.contentParts).toEqual(contentParts);
    });

    it('should allow custom id and createdAt', () => {
      const customId = 'custom-message-id';
      const customCreatedAt = '2025-01-01T00:00:00.000Z';

      const result = session.injectMessage({
        role: 'assistant',
        content: 'Test message',
        id: customId,
        createdAt: customCreatedAt
      });

      expect(result.id).toBe(customId);
      expect(result.createdAt).toBe(customCreatedAt);
    });

    it('should allow custom sequence number', () => {
      const customSequence = 12345;

      const result = session.injectMessage({
        role: 'assistant',
        content: 'Test message',
        sequence: customSequence
      });

      expect(result.sequence).toBe(customSequence);
    });

    it('should support streaming flag', () => {
      const result = session.injectMessage({
        role: 'assistant',
        content: 'Partial...',
        streaming: true
      });

      expect(result.streaming).toBe(true);
    });

    it('should update existing message with same id (upsert)', () => {
      const messageId = 'msg-to-update';

      // First injection
      session.injectMessage({
        role: 'assistant',
        content: 'Partial content...',
        id: messageId,
        streaming: true
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Partial content...');

      // Second injection (update)
      session.injectMessage({
        role: 'assistant',
        content: 'Complete content!',
        id: messageId,
        streaming: false
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Complete content!');
      expect(messages[0].streaming).toBe(false);
    });
  });

  describe('injectAssistantMessage', () => {
    it('should inject a message with role "assistant"', () => {
      const result = session.injectAssistantMessage({
        content: 'I am an assistant message'
      });

      expect(result.role).toBe('assistant');
      expect(result.content).toBe('I am an assistant message');
      expect(result.id).toMatch(/^ast_/); // Assistant IDs start with ast_
    });

    it('should support dual-content', () => {
      const result = session.injectAssistantMessage({
        content: 'User sees this',
        llmContent: 'LLM sees this'
      });

      expect(result.role).toBe('assistant');
      expect(result.content).toBe('User sees this');
      expect(result.llmContent).toBe('LLM sees this');
    });
  });

  describe('injectUserMessage', () => {
    it('should inject a message with role "user"', () => {
      const result = session.injectUserMessage({
        content: 'I am a user message'
      });

      expect(result.role).toBe('user');
      expect(result.content).toBe('I am a user message');
      expect(result.id).toMatch(/^usr_/); // User IDs start with usr_
    });
  });

  describe('injectSystemMessage', () => {
    it('should inject a message with role "system"', () => {
      const result = session.injectSystemMessage({
        content: '[Context updated]',
        llmContent: 'User is viewing product page for iPhone 15 Pro'
      });

      expect(result.role).toBe('system');
      expect(result.content).toBe('[Context updated]');
      expect(result.llmContent).toBe('User is viewing product page for iPhone 15 Pro');
      expect(result.id).toMatch(/^system-/); // System IDs start with system-
    });
  });

  describe('message ordering', () => {
    it('should maintain chronological order', () => {
      session.injectMessage({
        role: 'user',
        content: 'First message',
        createdAt: '2025-01-01T00:00:01.000Z'
      });

      session.injectMessage({
        role: 'assistant',
        content: 'Second message',
        createdAt: '2025-01-01T00:00:02.000Z'
      });

      session.injectMessage({
        role: 'user',
        content: 'Third message',
        createdAt: '2025-01-01T00:00:03.000Z'
      });

      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('First message');
      expect(messages[1].content).toBe('Second message');
      expect(messages[2].content).toBe('Third message');
    });

    it('should insert messages in correct position based on timestamp', () => {
      // Insert out of order
      session.injectMessage({
        role: 'assistant',
        content: 'Second message',
        createdAt: '2025-01-01T00:00:02.000Z'
      });

      session.injectMessage({
        role: 'user',
        content: 'First message',
        createdAt: '2025-01-01T00:00:01.000Z'
      });

      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('First message');
      expect(messages[1].content).toBe('Second message');
    });
  });

  describe('backward compatibility', () => {
    it('should still support injectTestEvent (deprecated)', () => {
      session.injectTestEvent({
        type: 'message',
        message: {
          id: 'test-msg',
          role: 'assistant',
          content: 'Legacy message',
          createdAt: new Date().toISOString()
        }
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Legacy message');
    });
  });
});

describe('AgentWidgetSession - cancel()', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('aborts the in-flight dispatch and flips streaming/status back to idle', async () => {
    let capturedSignal: AbortSignal | null = null;
    // Fetch returns a promise that only settles when the AbortSignal fires —
    // modeling a dispatch that's still receiving SSE tokens.
    global.fetch = vi.fn().mockImplementation((_url: string, options: any) => {
      capturedSignal = options.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    let streaming = false;
    let status: AgentWidgetSessionStatus = 'idle';
    const session = new AgentWidgetSession(
      { apiUrl: 'http://example.invalid/chat' },
      {
        onMessagesChanged: () => {},
        onStatusChanged: (s) => { status = s; },
        onStreamingChanged: (s) => { streaming = s; }
      }
    );

    // Kick off the dispatch but don't await — we want it in-flight when we cancel.
    const dispatchPromise = session.sendMessage('Hello');
    // Let the session set up the AbortController and call fetch.
    await Promise.resolve();
    await Promise.resolve();

    expect(streaming).toBe(true);
    expect(session.isStreaming()).toBe(true);
    expect(capturedSignal).not.toBeNull();
    expect(capturedSignal!.aborted).toBe(false);

    session.cancel();

    expect(session.isStreaming()).toBe(false);
    expect(streaming).toBe(false);
    expect(status).toBe('idle');
    expect(capturedSignal!.aborted).toBe(true);

    // Drain the dispatch promise so the test doesn't leak a rejection.
    await dispatchPromise;
  });

  it('is a no-op when not streaming', () => {
    const session = new AgentWidgetSession(
      { apiUrl: 'http://example.invalid/chat' },
      {
        onMessagesChanged: () => {},
        onStatusChanged: () => {},
        onStreamingChanged: () => {}
      }
    );

    expect(session.isStreaming()).toBe(false);
    expect(() => session.cancel()).not.toThrow();
    expect(session.isStreaming()).toBe(false);
    expect(session.getStatus()).toBe('idle');
  });

  it('stops in-progress audio playback (TTS + voice provider) on cancel', () => {
    const session = new AgentWidgetSession(
      { apiUrl: 'http://example.invalid/chat' },
      {
        onMessagesChanged: () => {},
        onStatusChanged: () => {},
        onStreamingChanged: () => {}
      }
    );

    const stopSpeakingSpy = vi.spyOn(session, 'stopSpeaking');
    const stopVoicePlaybackSpy = vi.spyOn(session, 'stopVoicePlayback');

    session.cancel();

    expect(stopSpeakingSpy).toHaveBeenCalledTimes(1);
    expect(stopVoicePlaybackSpy).toHaveBeenCalledTimes(1);
  });
});

describe('AgentWidgetSession.resolveAskUserQuestion', () => {
  const makeAwaitingMessage = (): AgentWidgetMessage => ({
    id: 'tool-msg-1',
    role: 'assistant',
    content: '',
    createdAt: new Date().toISOString(),
    variant: 'tool',
    streaming: false,
    toolCall: {
      id: 'runtime_ask_user_question_1',
      name: 'ask_user_question',
      status: 'complete',
      args: { questions: [{ question: 'Who?', options: [{ label: 'A' }] }] },
      chunks: [],
    },
    agentMetadata: {
      executionId: 'exec_abc',
      awaitingLocalTool: true,
    },
  });

  it('POSTs to /resume, appends a user bubble, and pipes the SSE stream through connectStream', async () => {
    let capturedUrl: string | undefined;
    let capturedBody: Record<string, unknown> | undefined;
    global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body as string);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"flow_complete","success":true}\n\n'));
          controller.close();
        },
      });
      return { ok: true, body: stream };
    });

    const seen: AgentWidgetMessage[] = [];
    const session = new AgentWidgetSession(
      { apiUrl: 'http://localhost:43111/api/chat/dispatch' },
      {
        onMessagesChanged: (msgs) => { seen.splice(0, seen.length, ...msgs); },
        onStatusChanged: () => {},
        onStreamingChanged: () => {},
      }
    );

    const connectSpy = vi.spyOn(session, 'connectStream').mockResolvedValue(undefined);
    await session.resolveAskUserQuestion(makeAwaitingMessage(), 'Hobbyists');

    expect(capturedUrl).toBe('http://localhost:43111/api/chat/dispatch/resume');
    expect(capturedBody).toEqual({
      executionId: 'exec_abc',
      toolOutputs: { ["ask_user_question"]: 'Hobbyists' },
      streamResponse: true,
    });

    const userBubble = seen.find((m) => m.role === 'user' && m.content === 'Hobbyists');
    expect(userBubble).toBeDefined();

    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it('flips askUserQuestionAnswered on the tool message before the POST fires', async () => {
    const awaiting = makeAwaitingMessage();

    const fetchMock = vi.fn().mockImplementation(async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"flow_complete","success":true}\n\n'));
          controller.close();
        },
      });
      return { ok: true, body: stream };
    });
    global.fetch = fetchMock;

    let latest: AgentWidgetMessage[] = [];
    const session = new AgentWidgetSession(
      {
        apiUrl: 'http://localhost:43111/api/chat/dispatch',
        initialMessages: [awaiting],
      },
      {
        onMessagesChanged: (msgs) => { latest = msgs; },
        onStatusChanged: () => {},
        onStreamingChanged: () => {},
      }
    );

    vi.spyOn(session, 'connectStream').mockResolvedValue(undefined);

    // Capture the flag state at the exact moment fetch is called — this is
    // the "before the POST fires" assertion. The flag must be flipped BEFORE
    // any network I/O so the subsequent stream-driven renders skip the sheet.
    let flagAtFetch: { awaiting?: boolean; answered?: boolean } | undefined;
    fetchMock.mockImplementationOnce(async () => {
      const toolMsg = session.getMessages().find((m) => m.id === awaiting.id);
      flagAtFetch = {
        awaiting: toolMsg?.agentMetadata?.awaitingLocalTool,
        answered: toolMsg?.agentMetadata?.askUserQuestionAnswered,
      };
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"flow_complete","success":true}\n\n'));
          controller.close();
        },
      });
      return { ok: true, body: stream };
    });

    await session.resolveAskUserQuestion(awaiting, 'Hobbyists');

    expect(flagAtFetch).toEqual({ awaiting: false, answered: true });

    const finalToolMsg = latest.find((m) => m.id === awaiting.id);
    expect(finalToolMsg?.agentMetadata?.askUserQuestionAnswered).toBe(true);
    expect(finalToolMsg?.agentMetadata?.awaitingLocalTool).toBe(false);
    expect(finalToolMsg?.agentMetadata?.executionId).toBe('exec_abc');
  });

  it('leaves the answered flag flipped even when resume fails', async () => {
    const awaiting = makeAwaitingMessage();
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });

    const errors: Error[] = [];
    let latest: AgentWidgetMessage[] = [];
    const session = new AgentWidgetSession(
      {
        apiUrl: 'http://localhost:43111/api/chat/dispatch',
        initialMessages: [awaiting],
      },
      {
        onMessagesChanged: (msgs) => { latest = msgs; },
        onStatusChanged: () => {},
        onStreamingChanged: () => {},
        onError: (e) => errors.push(e),
      }
    );

    await session.resolveAskUserQuestion(awaiting, 'Hobbyists');

    expect(errors.length).toBe(1);
    const finalToolMsg = latest.find((m) => m.id === awaiting.id);
    expect(finalToolMsg?.agentMetadata?.askUserQuestionAnswered).toBe(true);
  });

  it('markAskUserQuestionResolved is idempotent and a no-op when the message is not in state', () => {
    const session = new AgentWidgetSession(
      { apiUrl: 'http://localhost:8000' },
      {
        onMessagesChanged: () => {},
        onStatusChanged: () => {},
        onStreamingChanged: () => {},
      }
    );
    // No throw when the tool message isn't tracked in session state
    expect(() => session.markAskUserQuestionResolved(makeAwaitingMessage())).not.toThrow();
  });

  it('surfaces errors through onError when the message is missing executionId', async () => {
    const errors: Error[] = [];
    const session = new AgentWidgetSession(
      { apiUrl: 'http://localhost:8000' },
      {
        onMessagesChanged: () => {},
        onStatusChanged: () => {},
        onStreamingChanged: () => {},
        onError: (e) => errors.push(e),
      }
    );

    const bad = makeAwaitingMessage();
    bad.agentMetadata = { ...bad.agentMetadata, executionId: undefined };

    await session.resolveAskUserQuestion(bad, 'x');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toMatch(/executionId/);
  });
});
