import { describe, it, expect, beforeEach } from 'vitest';
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
