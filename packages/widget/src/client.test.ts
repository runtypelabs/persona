import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentWidgetClient } from './client';
import { AgentWidgetEvent, AgentWidgetMessage } from './types';
import { createJsonStreamParser } from './utils/formatting';

describe('AgentWidgetClient - Empty Message Filtering', () => {
  let client: AgentWidgetClient;
  let events: AgentWidgetEvent[] = [];
  let capturedPayload: any = null;

  beforeEach(() => {
    events = [];
    capturedPayload = null;
    client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
    });
  });

  it('should filter out messages with empty content before sending', async () => {
    // Create a mock fetch that captures the request payload
    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      capturedPayload = JSON.parse(options.body);
      // Return a minimal successful response
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"flow_complete","success":true}\n\n'));
          controller.close();
        }
      });
      return { ok: true, body: stream };
    });

    // Messages array with an empty assistant message (simulating failed API response)
    const messages: AgentWidgetMessage[] = [
      {
        id: 'usr_1',
        role: 'user',
        content: 'What can you help me with?',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'ast_1',
        role: 'assistant',
        content: '', // Empty content from failed request - THIS SHOULD BE FILTERED OUT
        createdAt: '2025-01-01T00:00:01.000Z',
      },
      {
        id: 'usr_2',
        role: 'user',
        content: 'test',
        createdAt: '2025-01-01T00:00:02.000Z',
      },
    ];

    await client.dispatch(
      { messages },
      (event) => events.push(event)
    );

    // Verify the empty message was filtered out
    expect(capturedPayload).toBeDefined();
    expect(capturedPayload.messages).toHaveLength(2);
    expect(capturedPayload.messages[0].content).toBe('What can you help me with?');
    expect(capturedPayload.messages[1].content).toBe('test');

    // Verify no message has empty content
    const hasEmptyContent = capturedPayload.messages.some(
      (m: any) => !m.content || (typeof m.content === 'string' && m.content.trim() === '')
    );
    expect(hasEmptyContent).toBe(false);
  });

  it('should filter out messages with whitespace-only content', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      capturedPayload = JSON.parse(options.body);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"flow_complete","success":true}\n\n'));
          controller.close();
        }
      });
      return { ok: true, body: stream };
    });

    const messages: AgentWidgetMessage[] = [
      {
        id: 'usr_1',
        role: 'user',
        content: 'Hello',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'ast_1',
        role: 'assistant',
        content: '   ', // Whitespace-only content - SHOULD BE FILTERED OUT
        createdAt: '2025-01-01T00:00:01.000Z',
      },
      {
        id: 'ast_2',
        role: 'assistant',
        content: '\n\t', // Whitespace-only content - SHOULD BE FILTERED OUT
        createdAt: '2025-01-01T00:00:02.000Z',
      },
      {
        id: 'usr_2',
        role: 'user',
        content: 'World',
        createdAt: '2025-01-01T00:00:03.000Z',
      },
    ];

    await client.dispatch(
      { messages },
      (event) => events.push(event)
    );

    expect(capturedPayload.messages).toHaveLength(2);
    expect(capturedPayload.messages[0].content).toBe('Hello');
    expect(capturedPayload.messages[1].content).toBe('World');
  });

  it('should preserve messages with valid contentParts even if content is empty', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      capturedPayload = JSON.parse(options.body);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"flow_complete","success":true}\n\n'));
          controller.close();
        }
      });
      return { ok: true, body: stream };
    });

    const messages: AgentWidgetMessage[] = [
      {
        id: 'usr_1',
        role: 'user',
        content: '', // Empty content but has contentParts - SHOULD BE PRESERVED
        contentParts: [{ type: 'image', data: 'base64data' }] as any,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'ast_1',
        role: 'assistant',
        content: '', // Empty content, no contentParts - SHOULD BE FILTERED OUT
        createdAt: '2025-01-01T00:00:01.000Z',
      },
    ];

    await client.dispatch(
      { messages },
      (event) => events.push(event)
    );

    expect(capturedPayload.messages).toHaveLength(1);
    // The message with contentParts should be preserved
    expect(capturedPayload.messages[0].content).toEqual([{ type: 'image', data: 'base64data' }]);
  });

  it('should preserve messages with valid rawContent even if content is empty', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      capturedPayload = JSON.parse(options.body);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"flow_complete","success":true}\n\n'));
          controller.close();
        }
      });
      return { ok: true, body: stream };
    });

    const messages: AgentWidgetMessage[] = [
      {
        id: 'ast_1',
        role: 'assistant',
        content: '', // Empty content but has rawContent - SHOULD BE PRESERVED
        rawContent: '{"action": "message", "text": "Hello"}',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ];

    await client.dispatch(
      { messages },
      (event) => events.push(event)
    );

    expect(capturedPayload.messages).toHaveLength(1);
    expect(capturedPayload.messages[0].content).toBe('{"action": "message", "text": "Hello"}');
  });
});

describe('AgentWidgetClient - llmContent Priority', () => {
  let client: AgentWidgetClient;
  let capturedPayload: any = null;

  beforeEach(() => {
    capturedPayload = null;
    client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
    });
  });

  it('should use llmContent instead of content when provided', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      capturedPayload = JSON.parse(options.body);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"flow_complete","success":true}\n\n'));
          controller.close();
        }
      });
      return { ok: true, body: stream };
    });

    const messages: AgentWidgetMessage[] = [
      {
        id: 'usr_1',
        role: 'user',
        content: 'Display content for user',
        llmContent: 'LLM-specific content with more context',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ];

    await client.dispatch({ messages }, () => {});

    expect(capturedPayload).toBeDefined();
    expect(capturedPayload.messages).toHaveLength(1);
    // Should use llmContent, not content
    expect(capturedPayload.messages[0].content).toBe('LLM-specific content with more context');
  });

  it('should fall back to content when llmContent is not provided', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      capturedPayload = JSON.parse(options.body);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"flow_complete","success":true}\n\n'));
          controller.close();
        }
      });
      return { ok: true, body: stream };
    });

    const messages: AgentWidgetMessage[] = [
      {
        id: 'usr_1',
        role: 'user',
        content: 'Regular content without llmContent',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ];

    await client.dispatch({ messages }, () => {});

    expect(capturedPayload).toBeDefined();
    expect(capturedPayload.messages).toHaveLength(1);
    expect(capturedPayload.messages[0].content).toBe('Regular content without llmContent');
  });

  it('should prioritize contentParts over llmContent', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      capturedPayload = JSON.parse(options.body);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"flow_complete","success":true}\n\n'));
          controller.close();
        }
      });
      return { ok: true, body: stream };
    });

    const messages: AgentWidgetMessage[] = [
      {
        id: 'usr_1',
        role: 'user',
        content: 'Display content',
        llmContent: 'LLM content (should be ignored)',
        contentParts: [{ type: 'text', text: 'Multi-modal text' }] as any,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ];

    await client.dispatch({ messages }, () => {});

    expect(capturedPayload).toBeDefined();
    expect(capturedPayload.messages).toHaveLength(1);
    // Should use contentParts, not llmContent
    expect(capturedPayload.messages[0].content).toEqual([{ type: 'text', text: 'Multi-modal text' }]);
  });

  it('should preserve messages with valid llmContent even if content is empty', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      capturedPayload = JSON.parse(options.body);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"flow_complete","success":true}\n\n'));
          controller.close();
        }
      });
      return { ok: true, body: stream };
    });

    const messages: AgentWidgetMessage[] = [
      {
        id: 'ast_1',
        role: 'assistant',
        content: '', // Empty display content
        llmContent: '[Context: User viewing product details]', // But has llmContent
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ];

    await client.dispatch({ messages }, () => {});

    expect(capturedPayload.messages).toHaveLength(1);
    expect(capturedPayload.messages[0].content).toBe('[Context: User viewing product details]');
  });

  it('should support dual-content pattern for redaction', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      capturedPayload = JSON.parse(options.body);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"flow_complete","success":true}\n\n'));
          controller.close();
        }
      });
      return { ok: true, body: stream };
    });

    // Simulate a conversation with dual-content messages
    const messages: AgentWidgetMessage[] = [
      {
        id: 'usr_1',
        role: 'user',
        content: 'Search for iPhones',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'ast_1',
        role: 'assistant',
        // User sees full product details
        content: '**Found 3 products:**\n- iPhone 15 Pro - $1,199\n- iPhone 15 - $999\n- iPhone 14 - $799',
        // LLM receives concise summary
        llmContent: '[Search results: 3 iPhones found, $799-$1199]',
        createdAt: '2025-01-01T00:00:01.000Z',
      },
      {
        id: 'usr_2',
        role: 'user',
        content: 'Tell me more about the first one',
        createdAt: '2025-01-01T00:00:02.000Z',
      },
    ];

    await client.dispatch({ messages }, () => {});

    expect(capturedPayload).toBeDefined();
    expect(capturedPayload.messages).toHaveLength(3);

    // First message: regular user message
    expect(capturedPayload.messages[0].content).toBe('Search for iPhones');

    // Second message: assistant with llmContent (should use redacted version)
    expect(capturedPayload.messages[1].content).toBe('[Search results: 3 iPhones found, $799-$1199]');

    // Third message: regular user message
    expect(capturedPayload.messages[2].content).toBe('Tell me more about the first one');
  });
});

describe('AgentWidgetClient - JSON Streaming', () => {
  let client: AgentWidgetClient;
  let events: AgentWidgetEvent[] = [];

  beforeEach(() => {
    events = [];
    client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      streamParser: createJsonStreamParser
    });
  });

  it('should stream text incrementally and not show raw JSON at the end', async () => {
    // Simulate the SSE stream from the user's example
    const sseEvents = [
      'data: {"type":"flow_start","flowId":"flow_01k9pfnztzfag9tfz4t65c9c5q","flowName":"Shopping Assistant","totalSteps":1,"startedAt":"2025-11-12T23:47:39.565Z","executionId":"exec_standalone_1762991259266_7wz736k7n","executionContext":{"source":"standalone","record":{"id":"-1","name":"Streaming Chat Widget","created":false},"flow":{"id":"flow_01k9pfnztzfag9tfz4t65c9c5q","name":"Shopping Assistant","created":false}}}',
      '',
      'data: {"type":"step_start","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","stepType":"prompt","index":1,"totalSteps":1,"startedAt":"2025-11-12T23:47:39.565Z"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":"{\\n"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":" "}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":" \\""}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":"action"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":"\\":"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":" \\""}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":"message"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":"\\",\\n"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":" "}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":" \\""}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":"text"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":"\\":"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":" \\""}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":"Great"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":"!"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":" If"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":" you"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":" have"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":" any"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":" questions"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":" or"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":" need"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":" help"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":" finding"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":" something"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":","}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":" just"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":" let"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":" me"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":" know"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":"!\\"\\n"}',
      '',
      'data: {"type":"step_chunk","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":2,"text":"}"}',
      '',
      'data: {"type":"step_complete","id":"step_01k9x5db72fzwvmdenryn0qm48","name":"Prompt 1","executionType":"prompt","index":1,"success":true,"result":{"promptId":"step_01k9x5db72fzwvmdenryn0qm48","promptName":"Prompt 1","processedPrompt":"ok","response":"{\\"\\n  \\"action\\": \\"message\\",\\n  \\"text\\": \\"Great! If you have any questions or need help finding something, just let me know!\\"\\n}","tokens":{"input":1833,"output":34,"total":1867},"cost":0.000700125,"executionTime":2222,"order":2},"executionTime":2222}',
      '',
      'data: {"type":"flow_complete","flowId":"flow_01k9pfnztzfag9tfz4t65c9c5q","success":true,"duration":2968,"completedAt":"2025-11-12T23:47:42.234Z","totalTokensUsed":0}'
    ];

    // Create a ReadableStream from the SSE events
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const event of sseEvents) {
          controller.enqueue(encoder.encode(event + '\n'));
        }
        controller.close();
      }
    });

    // Mock fetch to return our stream
    global.fetch = async () => ({
      ok: true,
      body: stream
    }) as any;

    // Dispatch and collect events
    await client.dispatch(
      {
        messages: [{ role: 'user', content: 'ok', id: 'test-1', createdAt: new Date().toISOString() }]
      },
      (event) => {
        events.push(event);
        if (event.type === 'message') {
          console.log('Message event:', {
            content: event.message.content,
            streaming: event.message.streaming,
            contentLength: event.message.content.length
          });
        }
      }
    );

    // Filter for assistant message events
    const messageEvents = events.filter(
      (e) => e.type === 'message' && e.message.role === 'assistant'
    ) as Extract<AgentWidgetEvent, { type: 'message' }>[];

    // Validate behavior
    expect(messageEvents.length).toBeGreaterThan(0);

    // 1. Check that text starts streaming incrementally (not all at once)
    const streamingMessages = messageEvents.filter((e) => e.message.streaming);
    expect(streamingMessages.length).toBeGreaterThan(1);
    console.log(`Found ${streamingMessages.length} streaming message events`);

    // 2. Check that text content appears progressively
    let hasPartialText = false;
    const expectedFinalText = "Great! If you have any questions or need help finding something, just let me know!";
    
    for (const msgEvent of streamingMessages) {
      const content = msgEvent.message.content;
      
      // Should not contain raw JSON during streaming
      if (content.includes('"action"') || content.includes('"text"')) {
        console.error('Found raw JSON in streaming content:', content);
      }
      expect(content).not.toMatch(/"action"|"text":/);
      
      // Check for partial text (text that's incomplete)
      if (content.length > 0 && content.length < expectedFinalText.length) {
        hasPartialText = true;
        // Partial text should be a prefix of the final text
        expect(expectedFinalText.startsWith(content)).toBe(true);
      }
    }

    expect(hasPartialText).toBe(true);
    console.log('✓ Text streamed incrementally with partial values');

    // 3. Check final message (streaming: false)
    const finalMessages = messageEvents.filter((e) => !e.message.streaming);
    expect(finalMessages.length).toBeGreaterThan(0);

    const finalMessage = finalMessages[finalMessages.length - 1].message;
    console.log('Final message content:', finalMessage.content);

    // Final content should be ONLY the extracted text, not raw JSON
    expect(finalMessage.content).toBe(expectedFinalText);
    expect(finalMessage.content).not.toContain('"action"');
    expect(finalMessage.content).not.toContain('"text"');
    expect(finalMessage.content).not.toContain('{\n');

    console.log('✓ Final message contains only extracted text, no raw JSON');

    // 4. Verify no raw JSON was ever displayed
    const allContents = messageEvents.map((e) => e.message.content);
    const hasRawJson = allContents.some(
      (content) => content.includes('{\n  "action": "message"')
    );
    
    if (hasRawJson) {
      const rawJsonMessage = allContents.find((content) =>
        content.includes('{\n  "action": "message"')
      );
      console.error('Found raw JSON in message content:', rawJsonMessage);
    }
    
    expect(hasRawJson).toBe(false);
    console.log('✓ No raw JSON was displayed at any point');
  });
});

// ============================================================================
// Agent Loop Execution Tests
// ============================================================================

/**
 * Helper to create an SSE event string
 */
function sseEvent(eventType: string, data: Record<string, unknown>): string {
  return `event: ${eventType}\ndata: ${JSON.stringify({ type: eventType, ...data })}\n\n`;
}

/**
 * Helper to create a mock fetch that returns an SSE stream
 */
function createAgentStreamFetch(events: string[]) {
  return vi.fn().mockImplementation(async (_url: string, _options: any) => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(event));
        }
        controller.close();
      }
    });
    return { ok: true, body: stream };
  });
}

describe('AgentWidgetClient - Agent Mode Detection', () => {
  it('should detect agent mode when agent config is provided', () => {
    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: {
        name: 'Test Agent',
        model: 'openai:gpt-4o-mini',
        systemPrompt: 'You are a test assistant.',
      },
    });
    expect(client.isAgentMode()).toBe(true);
    expect(client.isClientTokenMode()).toBe(false);
  });

  it('should not detect agent mode when no agent config', () => {
    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
    });
    expect(client.isAgentMode()).toBe(false);
  });
});

describe('AgentWidgetClient - Agent Payload Building', () => {
  it('should build agent payload with agent config', async () => {
    let capturedPayload: any = null;
    global.fetch = vi.fn().mockImplementation(async (_url: string, options: any) => {
      capturedPayload = JSON.parse(options.body);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseEvent('agent_complete', {
            executionId: 'exec_1',
            agentId: 'virtual',
            success: true,
            iterations: 1,
            stopReason: 'max_iterations',
            completedAt: new Date().toISOString(),
            seq: 1,
          })));
          controller.close();
        }
      });
      return { ok: true, body: stream };
    });

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: {
        name: 'Test Agent',
        model: 'openai:gpt-4o-mini',
        systemPrompt: 'You are a test assistant.',
        temperature: 0.7,
        loopConfig: {
          maxIterations: 3,
          stopCondition: 'auto',
        },
      },
      agentOptions: {
        recordMode: 'virtual',
        debugMode: false,
      },
    });

    const messages: AgentWidgetMessage[] = [
      {
        id: 'usr_1',
        role: 'user',
        content: 'Hello agent',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ];

    await client.dispatch({ messages }, () => {});

    expect(capturedPayload).toBeDefined();
    expect(capturedPayload.agent).toBeDefined();
    expect(capturedPayload.agent.name).toBe('Test Agent');
    expect(capturedPayload.agent.model).toBe('openai:gpt-4o-mini');
    expect(capturedPayload.agent.systemPrompt).toBe('You are a test assistant.');
    expect(capturedPayload.agent.loopConfig.maxIterations).toBe(3);
    expect(capturedPayload.messages).toHaveLength(1);
    expect(capturedPayload.messages[0].content).toBe('Hello agent');
    expect(capturedPayload.options.streamResponse).toBe(true);
    expect(capturedPayload.options.recordMode).toBe('virtual');
  });

  it('should filter out variant messages from agent payload', async () => {
    let capturedPayload: any = null;
    global.fetch = vi.fn().mockImplementation(async (_url: string, options: any) => {
      capturedPayload = JSON.parse(options.body);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseEvent('agent_complete', {
            executionId: 'exec_1', agentId: 'virtual', success: true,
            iterations: 1, stopReason: 'max_iterations',
            completedAt: new Date().toISOString(), seq: 1,
          })));
          controller.close();
        }
      });
      return { ok: true, body: stream };
    });

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: { name: 'Test', model: 'openai:gpt-4o-mini', systemPrompt: 'test' },
    });

    const messages: AgentWidgetMessage[] = [
      { id: 'usr_1', role: 'user', content: 'Hello', createdAt: '2025-01-01T00:00:00.000Z' },
      { id: 'ast_1', role: 'assistant', content: 'Hi there!', createdAt: '2025-01-01T00:00:01.000Z' },
      { id: 'tool_1', role: 'assistant', content: '', variant: 'tool', createdAt: '2025-01-01T00:00:02.000Z' },
      { id: 'reason_1', role: 'assistant', content: '', variant: 'reasoning', createdAt: '2025-01-01T00:00:03.000Z' },
      { id: 'usr_2', role: 'user', content: 'Thanks', createdAt: '2025-01-01T00:00:04.000Z' },
    ];

    await client.dispatch({ messages }, () => {});

    // Tool and reasoning variant messages should be filtered out
    expect(capturedPayload.messages).toHaveLength(3);
    expect(capturedPayload.messages[0].content).toBe('Hello');
    expect(capturedPayload.messages[1].content).toBe('Hi there!');
    expect(capturedPayload.messages[2].content).toBe('Thanks');
  });
});

describe('AgentWidgetClient - Agent Event Streaming', () => {
  it('should handle basic agent text streaming (single iteration)', async () => {
    const events: AgentWidgetEvent[] = [];
    const execId = 'exec_test_1';

    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', {
        executionId: execId, agentId: 'virtual', agentName: 'Test',
        maxIterations: 1, startedAt: new Date().toISOString(), seq: 1,
      }),
      sseEvent('agent_iteration_start', {
        executionId: execId, iteration: 1, maxIterations: 1,
        startedAt: new Date().toISOString(), seq: 2,
      }),
      sseEvent('agent_turn_start', {
        executionId: execId, iteration: 1, turnIndex: 0,
        role: 'assistant', turnId: 'turn_1', seq: 3,
      }),
      sseEvent('agent_turn_delta', {
        executionId: execId, iteration: 1, delta: 'Hello',
        contentType: 'text', turnId: 'turn_1', seq: 4,
      }),
      sseEvent('agent_turn_delta', {
        executionId: execId, iteration: 1, delta: ' World',
        contentType: 'text', turnId: 'turn_1', seq: 5,
      }),
      sseEvent('agent_turn_complete', {
        executionId: execId, iteration: 1, role: 'assistant',
        turnId: 'turn_1', completedAt: new Date().toISOString(), seq: 6,
      }),
      sseEvent('agent_iteration_complete', {
        executionId: execId, iteration: 1, toolCallsMade: 0,
        stopConditionMet: false, completedAt: new Date().toISOString(), seq: 7,
      }),
      sseEvent('agent_complete', {
        executionId: execId, agentId: 'virtual', success: true,
        iterations: 1, stopReason: 'max_iterations',
        completedAt: new Date().toISOString(), seq: 8,
      }),
    ]);

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: { name: 'Test', model: 'openai:gpt-4o-mini', systemPrompt: 'test' },
    });

    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Hi', createdAt: new Date().toISOString() }] },
      (event) => events.push(event)
    );

    // Find message events
    const messageEvents = events.filter(e => e.type === 'message');
    expect(messageEvents.length).toBeGreaterThan(0);

    // Find the final assistant message
    const lastMessage = messageEvents[messageEvents.length - 1];
    expect(lastMessage.type).toBe('message');
    if (lastMessage.type === 'message') {
      expect(lastMessage.message.content).toBe('Hello World');
      expect(lastMessage.message.streaming).toBe(false);
      expect(lastMessage.message.role).toBe('assistant');
      expect(lastMessage.message.agentMetadata).toBeDefined();
      expect(lastMessage.message.agentMetadata?.executionId).toBe(execId);
    }
  });

  it('should create separate messages per iteration in separate mode', async () => {
    const events: AgentWidgetEvent[] = [];
    const execId = 'exec_test_2';

    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', {
        executionId: execId, agentId: 'virtual', agentName: 'Test',
        maxIterations: 2, startedAt: new Date().toISOString(), seq: 1,
      }),
      // Iteration 1
      sseEvent('agent_iteration_start', {
        executionId: execId, iteration: 1, maxIterations: 2,
        startedAt: new Date().toISOString(), seq: 2,
      }),
      sseEvent('agent_turn_start', {
        executionId: execId, iteration: 1, turnIndex: 0,
        role: 'assistant', turnId: 'turn_1', seq: 3,
      }),
      sseEvent('agent_turn_delta', {
        executionId: execId, iteration: 1, delta: 'First iteration',
        contentType: 'text', turnId: 'turn_1', seq: 4,
      }),
      sseEvent('agent_turn_complete', {
        executionId: execId, iteration: 1, role: 'assistant',
        turnId: 'turn_1', completedAt: new Date().toISOString(), seq: 5,
      }),
      sseEvent('agent_iteration_complete', {
        executionId: execId, iteration: 1, toolCallsMade: 0,
        stopConditionMet: false, completedAt: new Date().toISOString(), seq: 6,
      }),
      // Iteration 2
      sseEvent('agent_iteration_start', {
        executionId: execId, iteration: 2, maxIterations: 2,
        startedAt: new Date().toISOString(), seq: 7,
      }),
      sseEvent('agent_turn_start', {
        executionId: execId, iteration: 2, turnIndex: 0,
        role: 'assistant', turnId: 'turn_2', seq: 8,
      }),
      sseEvent('agent_turn_delta', {
        executionId: execId, iteration: 2, delta: 'Second iteration',
        contentType: 'text', turnId: 'turn_2', seq: 9,
      }),
      sseEvent('agent_turn_complete', {
        executionId: execId, iteration: 2, role: 'assistant',
        turnId: 'turn_2', completedAt: new Date().toISOString(), seq: 10,
      }),
      sseEvent('agent_iteration_complete', {
        executionId: execId, iteration: 2, toolCallsMade: 0,
        stopConditionMet: false, completedAt: new Date().toISOString(), seq: 11,
      }),
      sseEvent('agent_complete', {
        executionId: execId, agentId: 'virtual', success: true,
        iterations: 2, stopReason: 'max_iterations',
        completedAt: new Date().toISOString(), seq: 12,
      }),
    ]);

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: { name: 'Test', model: 'openai:gpt-4o-mini', systemPrompt: 'test' },
      iterationDisplay: 'separate',
    });

    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Hi', createdAt: new Date().toISOString() }] },
      (event) => events.push(event)
    );

    const messageEvents = events.filter(e => e.type === 'message');

    // Collect unique message IDs and their final content
    const messagesById = new Map<string, AgentWidgetMessage>();
    for (const event of messageEvents) {
      if (event.type === 'message') {
        messagesById.set(event.message.id, event.message);
      }
    }

    // Should have created two distinct assistant messages
    const assistantMessages = Array.from(messagesById.values())
      .filter(m => m.role === 'assistant' && !m.variant);

    expect(assistantMessages.length).toBe(2);
    expect(assistantMessages[0].content).toBe('First iteration');
    expect(assistantMessages[0].streaming).toBe(false);
    expect(assistantMessages[1].content).toBe('Second iteration');
    expect(assistantMessages[1].streaming).toBe(false);
  });

  it('should merge iterations in merged mode', async () => {
    const events: AgentWidgetEvent[] = [];
    const execId = 'exec_test_3';

    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', {
        executionId: execId, agentId: 'virtual', agentName: 'Test',
        maxIterations: 2, startedAt: new Date().toISOString(), seq: 1,
      }),
      sseEvent('agent_iteration_start', {
        executionId: execId, iteration: 1, maxIterations: 2,
        startedAt: new Date().toISOString(), seq: 2,
      }),
      sseEvent('agent_turn_delta', {
        executionId: execId, iteration: 1, delta: 'First',
        contentType: 'text', turnId: 'turn_1', seq: 3,
      }),
      sseEvent('agent_iteration_complete', {
        executionId: execId, iteration: 1, toolCallsMade: 0,
        stopConditionMet: false, completedAt: new Date().toISOString(), seq: 4,
      }),
      sseEvent('agent_iteration_start', {
        executionId: execId, iteration: 2, maxIterations: 2,
        startedAt: new Date().toISOString(), seq: 5,
      }),
      sseEvent('agent_turn_delta', {
        executionId: execId, iteration: 2, delta: ' Second',
        contentType: 'text', turnId: 'turn_2', seq: 6,
      }),
      sseEvent('agent_complete', {
        executionId: execId, agentId: 'virtual', success: true,
        iterations: 2, stopReason: 'max_iterations',
        completedAt: new Date().toISOString(), seq: 7,
      }),
    ]);

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: { name: 'Test', model: 'openai:gpt-4o-mini', systemPrompt: 'test' },
      iterationDisplay: 'merged',
    });

    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Hi', createdAt: new Date().toISOString() }] },
      (event) => events.push(event)
    );

    const messageEvents = events.filter(e => e.type === 'message');
    const messagesById = new Map<string, AgentWidgetMessage>();
    for (const event of messageEvents) {
      if (event.type === 'message') {
        messagesById.set(event.message.id, event.message);
      }
    }

    // In merged mode, should have only one assistant message with combined content
    const assistantMessages = Array.from(messagesById.values())
      .filter(m => m.role === 'assistant' && !m.variant);

    expect(assistantMessages.length).toBe(1);
    expect(assistantMessages[0].content).toBe('First Second');
  });

  it('should handle agent tool events', async () => {
    const events: AgentWidgetEvent[] = [];
    const execId = 'exec_test_4';

    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', {
        executionId: execId, agentId: 'virtual', agentName: 'Test',
        maxIterations: 1, startedAt: new Date().toISOString(), seq: 1,
      }),
      sseEvent('agent_iteration_start', {
        executionId: execId, iteration: 1, maxIterations: 1,
        startedAt: new Date().toISOString(), seq: 2,
      }),
      sseEvent('agent_tool_start', {
        executionId: execId, iteration: 1, toolCallId: 'tc_1',
        toolName: 'search', toolType: 'function',
        parameters: { query: 'weather' }, seq: 3,
      }),
      sseEvent('agent_tool_delta', {
        executionId: execId, iteration: 1, toolCallId: 'tc_1',
        delta: 'Searching...', seq: 4,
      }),
      sseEvent('agent_tool_complete', {
        executionId: execId, iteration: 1, toolCallId: 'tc_1',
        toolName: 'search', success: true,
        result: { temperature: 72 }, executionTime: 150, seq: 5,
      }),
      sseEvent('agent_turn_delta', {
        executionId: execId, iteration: 1, delta: 'The weather is 72F.',
        contentType: 'text', turnId: 'turn_1', seq: 6,
      }),
      sseEvent('agent_complete', {
        executionId: execId, agentId: 'virtual', success: true,
        iterations: 1, stopReason: 'max_iterations',
        completedAt: new Date().toISOString(), seq: 7,
      }),
    ]);

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: { name: 'Test', model: 'openai:gpt-4o-mini', systemPrompt: 'test' },
    });

    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Weather?', createdAt: new Date().toISOString() }] },
      (event) => events.push(event)
    );

    const messageEvents = events.filter(e => e.type === 'message');
    const messagesById = new Map<string, AgentWidgetMessage>();
    for (const event of messageEvents) {
      if (event.type === 'message') {
        messagesById.set(event.message.id, event.message);
      }
    }

    // Should have a tool message
    const toolMessages = Array.from(messagesById.values())
      .filter(m => m.variant === 'tool');
    expect(toolMessages.length).toBe(1);
    expect(toolMessages[0].toolCall?.name).toBe('search');
    expect(toolMessages[0].toolCall?.status).toBe('complete');
    expect(toolMessages[0].toolCall?.result).toEqual({ temperature: 72 });
    expect(toolMessages[0].toolCall?.durationMs).toBe(150);

    // Should have an assistant message
    const assistantMessages = Array.from(messagesById.values())
      .filter(m => m.role === 'assistant' && !m.variant);
    expect(assistantMessages.length).toBe(1);
    expect(assistantMessages[0].content).toBe('The weather is 72F.');
  });

  it('should handle agent thinking content', async () => {
    const events: AgentWidgetEvent[] = [];
    const execId = 'exec_test_5';

    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', {
        executionId: execId, agentId: 'virtual', agentName: 'Test',
        maxIterations: 1, startedAt: new Date().toISOString(), seq: 1,
      }),
      sseEvent('agent_iteration_start', {
        executionId: execId, iteration: 1, maxIterations: 1,
        startedAt: new Date().toISOString(), seq: 2,
      }),
      sseEvent('agent_turn_delta', {
        executionId: execId, iteration: 1, delta: 'Let me think...',
        contentType: 'thinking', turnId: 'think_1', seq: 3,
      }),
      sseEvent('agent_turn_complete', {
        executionId: execId, iteration: 1, role: 'assistant',
        turnId: 'think_1', completedAt: new Date().toISOString(), seq: 4,
      }),
      sseEvent('agent_turn_delta', {
        executionId: execId, iteration: 1, delta: 'The answer is 42.',
        contentType: 'text', turnId: 'turn_1', seq: 5,
      }),
      sseEvent('agent_complete', {
        executionId: execId, agentId: 'virtual', success: true,
        iterations: 1, stopReason: 'max_iterations',
        completedAt: new Date().toISOString(), seq: 6,
      }),
    ]);

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: { name: 'Test', model: 'openai:gpt-4o-mini', systemPrompt: 'test' },
    });

    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'What is the answer?', createdAt: new Date().toISOString() }] },
      (event) => events.push(event)
    );

    const messageEvents = events.filter(e => e.type === 'message');
    const messagesById = new Map<string, AgentWidgetMessage>();
    for (const event of messageEvents) {
      if (event.type === 'message') {
        messagesById.set(event.message.id, event.message);
      }
    }

    // Should have a reasoning message
    const reasoningMessages = Array.from(messagesById.values())
      .filter(m => m.variant === 'reasoning');
    expect(reasoningMessages.length).toBe(1);
    expect(reasoningMessages[0].reasoning?.chunks).toContain('Let me think...');
    expect(reasoningMessages[0].reasoning?.status).toBe('complete');

    // Should have an assistant message
    const assistantMessages = Array.from(messagesById.values())
      .filter(m => m.role === 'assistant' && !m.variant);
    expect(assistantMessages.length).toBe(1);
    expect(assistantMessages[0].content).toBe('The answer is 42.');
  });

  it('should handle agent errors (recoverable and fatal)', async () => {
    const events: AgentWidgetEvent[] = [];
    const execId = 'exec_test_6';

    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', {
        executionId: execId, agentId: 'virtual', agentName: 'Test',
        maxIterations: 1, startedAt: new Date().toISOString(), seq: 1,
      }),
      sseEvent('agent_error', {
        executionId: execId, iteration: 1,
        error: 'Rate limit hit, retrying...',
        recoverable: true, seq: 2,
      }),
      sseEvent('agent_error', {
        executionId: execId, iteration: 1,
        error: 'Fatal: model unavailable',
        recoverable: false, seq: 3,
      }),
    ]);

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: { name: 'Test', model: 'openai:gpt-4o-mini', systemPrompt: 'test' },
    });

    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Hi', createdAt: new Date().toISOString() }] },
      (event) => events.push(event)
    );

    // Should have an error event for the non-recoverable error
    const errorEvents = events.filter(e => e.type === 'error');
    expect(errorEvents.length).toBe(1);
    if (errorEvents[0].type === 'error') {
      expect(errorEvents[0].error.message).toBe('Fatal: model unavailable');
    }
  });

  it('should handle agent reflection events', async () => {
    const events: AgentWidgetEvent[] = [];
    const execId = 'exec_test_7';

    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', {
        executionId: execId, agentId: 'virtual', agentName: 'Test',
        maxIterations: 2, startedAt: new Date().toISOString(), seq: 1,
      }),
      sseEvent('agent_reflection', {
        executionId: execId, iteration: 1,
        reflection: 'I should try a different approach.', seq: 2,
      }),
      sseEvent('agent_complete', {
        executionId: execId, agentId: 'virtual', success: true,
        iterations: 2, stopReason: 'max_iterations',
        completedAt: new Date().toISOString(), seq: 3,
      }),
    ]);

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: { name: 'Test', model: 'openai:gpt-4o-mini', systemPrompt: 'test' },
    });

    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Hi', createdAt: new Date().toISOString() }] },
      (event) => events.push(event)
    );

    const messageEvents = events.filter(e => e.type === 'message');
    const messagesById = new Map<string, AgentWidgetMessage>();
    for (const event of messageEvents) {
      if (event.type === 'message') {
        messagesById.set(event.message.id, event.message);
      }
    }

    // Should have a reflection message
    const reflectionMessages = Array.from(messagesById.values())
      .filter(m => m.variant === 'reasoning' && m.id.includes('reflection'));
    expect(reflectionMessages.length).toBe(1);
    expect(reflectionMessages[0].content).toBe('I should try a different approach.');
    expect(reflectionMessages[0].reasoning?.chunks).toContain('I should try a different approach.');
  });

  it('should handle agent_ping events gracefully', async () => {
    const events: AgentWidgetEvent[] = [];
    const execId = 'exec_test_8';

    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', {
        executionId: execId, agentId: 'virtual', agentName: 'Test',
        maxIterations: 1, startedAt: new Date().toISOString(), seq: 1,
      }),
      sseEvent('agent_ping', {
        executionId: execId, timestamp: new Date().toISOString(), seq: 2,
      }),
      sseEvent('agent_turn_delta', {
        executionId: execId, iteration: 1, delta: 'Hi',
        contentType: 'text', turnId: 'turn_1', seq: 3,
      }),
      sseEvent('agent_complete', {
        executionId: execId, agentId: 'virtual', success: true,
        iterations: 1, stopReason: 'max_iterations',
        completedAt: new Date().toISOString(), seq: 4,
      }),
    ]);

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: { name: 'Test', model: 'openai:gpt-4o-mini', systemPrompt: 'test' },
    });

    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Hi', createdAt: new Date().toISOString() }] },
      (event) => events.push(event)
    );

    // Ping should not generate any message events
    const messageEvents = events.filter(e => e.type === 'message');
    const messagesById = new Map<string, AgentWidgetMessage>();
    for (const event of messageEvents) {
      if (event.type === 'message') {
        messagesById.set(event.message.id, event.message);
      }
    }
    const assistantMessages = Array.from(messagesById.values())
      .filter(m => m.role === 'assistant' && !m.variant);
    expect(assistantMessages.length).toBe(1);
    expect(assistantMessages[0].content).toBe('Hi');
  });
});

// ============================================================================
// Unified Event Name Support (chunk → delta, agent_tool_* → tool_* with agentContext)
// ============================================================================

describe('AgentWidgetClient - Unified Event Names', () => {
  it('should handle step_delta as alias for step_chunk', async () => {
    const events: AgentWidgetEvent[] = [];

    const encoder = new TextEncoder();
    global.fetch = vi.fn().mockImplementation(async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"flow_start","flowId":"f1","flowName":"Test","totalSteps":1}\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"step_start","id":"s1","name":"Prompt","stepType":"prompt","index":1,"totalSteps":1}\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"step_delta","id":"s1","name":"Prompt","executionType":"prompt","text":"Hello "}\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"step_delta","id":"s1","name":"Prompt","executionType":"prompt","text":"world"}\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"step_complete","id":"s1","name":"Prompt"}\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"flow_complete","success":true}\n\n'));
          controller.close();
        }
      });
      return { ok: true, body: stream };
    });

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });
    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Hi', createdAt: new Date().toISOString() }] },
      (event) => events.push(event)
    );

    const messageEvents = events.filter(e => e.type === 'message');
    const assistantMessages = messageEvents
      .map(e => e.type === 'message' ? e.message : null)
      .filter((m): m is AgentWidgetMessage => m !== null && m.role === 'assistant' && !m.variant);
    expect(assistantMessages.length).toBeGreaterThan(0);
    const final = assistantMessages[assistantMessages.length - 1];
    expect(final.content).toContain('Hello ');
    expect(final.content).toContain('world');
  });

  it('should handle tool_delta as alias for tool_chunk', async () => {
    const events: AgentWidgetEvent[] = [];

    const encoder = new TextEncoder();
    global.fetch = vi.fn().mockImplementation(async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"flow_start","flowId":"f1","flowName":"Test","totalSteps":1}\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"tool_start","toolCallId":"tc_1","toolName":"search"}\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"tool_delta","toolCallId":"tc_1","delta":"Searching..."}\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"tool_complete","toolCallId":"tc_1","toolName":"search","result":{"found":true},"duration":100}\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"flow_complete","success":true}\n\n'));
          controller.close();
        }
      });
      return { ok: true, body: stream };
    });

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });
    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Search', createdAt: new Date().toISOString() }] },
      (event) => events.push(event)
    );

    const messageEvents = events.filter(e => e.type === 'message');
    const messagesById = new Map<string, AgentWidgetMessage>();
    for (const event of messageEvents) {
      if (event.type === 'message') messagesById.set(event.message.id, event.message);
    }

    const toolMessages = Array.from(messagesById.values()).filter(m => m.variant === 'tool');
    expect(toolMessages.length).toBe(1);
    expect(toolMessages[0].toolCall?.name).toBe('search');
    expect(toolMessages[0].toolCall?.chunks).toContain('Searching...');
    expect(toolMessages[0].toolCall?.status).toBe('complete');
  });

  it('should handle tool_start with agentContext (unified agent tool events)', async () => {
    const events: AgentWidgetEvent[] = [];
    const execId = 'exec_unified_1';

    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', {
        executionId: execId, agentId: 'virtual', agentName: 'Test',
        maxIterations: 1, startedAt: new Date().toISOString(), seq: 1,
      }),
      sseEvent('agent_iteration_start', {
        executionId: execId, iteration: 1, maxIterations: 1,
        startedAt: new Date().toISOString(), seq: 2,
      }),
      sseEvent('tool_start', {
        toolCallId: 'tc_1', toolName: 'search', parameters: { query: 'weather' },
        agentContext: { executionId: execId, iteration: 1, seq: 3 },
      }),
      sseEvent('tool_delta', {
        toolCallId: 'tc_1', delta: 'Searching...',
        agentContext: { executionId: execId, iteration: 1, seq: 4 },
      }),
      sseEvent('tool_complete', {
        toolCallId: 'tc_1', toolName: 'search', result: { temperature: 72 },
        executionTime: 150,
        agentContext: { executionId: execId, iteration: 1, seq: 5 },
      }),
      sseEvent('agent_turn_delta', {
        executionId: execId, iteration: 1, delta: 'The weather is 72F.',
        contentType: 'text', turnId: 'turn_1', seq: 6,
      }),
      sseEvent('agent_complete', {
        executionId: execId, agentId: 'virtual', success: true,
        iterations: 1, stopReason: 'max_iterations',
        completedAt: new Date().toISOString(), seq: 7,
      }),
    ]);

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: { name: 'Test', model: 'openai:gpt-4o-mini', systemPrompt: 'test' },
    });

    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Weather?', createdAt: new Date().toISOString() }] },
      (event) => events.push(event)
    );

    const messageEvents = events.filter(e => e.type === 'message');
    const messagesById = new Map<string, AgentWidgetMessage>();
    for (const event of messageEvents) {
      if (event.type === 'message') messagesById.set(event.message.id, event.message);
    }

    const toolMessages = Array.from(messagesById.values()).filter(m => m.variant === 'tool');
    expect(toolMessages.length).toBe(1);
    expect(toolMessages[0].toolCall?.name).toBe('search');
    expect(toolMessages[0].toolCall?.status).toBe('complete');
    expect(toolMessages[0].toolCall?.result).toEqual({ temperature: 72 });
    expect(toolMessages[0].toolCall?.durationMs).toBe(150);
    expect(toolMessages[0].agentMetadata?.executionId).toBe(execId);
    expect(toolMessages[0].agentMetadata?.iteration).toBe(1);

    const assistantMessages = Array.from(messagesById.values())
      .filter(m => m.role === 'assistant' && !m.variant);
    expect(assistantMessages.length).toBe(1);
    expect(assistantMessages[0].content).toBe('The weather is 72F.');
  });

  it('should handle agent_reflect as alias for agent_reflection', async () => {
    const events: AgentWidgetEvent[] = [];
    const execId = 'exec_reflect_1';

    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', {
        executionId: execId, agentId: 'virtual', agentName: 'Test',
        maxIterations: 2, startedAt: new Date().toISOString(), seq: 1,
      }),
      sseEvent('agent_reflect', {
        executionId: execId, iteration: 1,
        reflection: 'Let me reconsider.', seq: 2,
      }),
      sseEvent('agent_complete', {
        executionId: execId, agentId: 'virtual', success: true,
        iterations: 2, stopReason: 'max_iterations',
        completedAt: new Date().toISOString(), seq: 3,
      }),
    ]);

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: { name: 'Test', model: 'openai:gpt-4o-mini', systemPrompt: 'test' },
    });

    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Hi', createdAt: new Date().toISOString() }] },
      (event) => events.push(event)
    );

    const messageEvents = events.filter(e => e.type === 'message');
    const messagesById = new Map<string, AgentWidgetMessage>();
    for (const event of messageEvents) {
      if (event.type === 'message') messagesById.set(event.message.id, event.message);
    }

    const reflectionMessages = Array.from(messagesById.values())
      .filter(m => m.variant === 'reasoning' && m.id.includes('reflection'));
    expect(reflectionMessages.length).toBe(1);
    expect(reflectionMessages[0].content).toBe('Let me reconsider.');
    expect(reflectionMessages[0].reasoning?.chunks).toContain('Let me reconsider.');
  });

  it('should handle reason_delta as alias for reason_chunk', async () => {
    const events: AgentWidgetEvent[] = [];

    const encoder = new TextEncoder();
    global.fetch = vi.fn().mockImplementation(async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"flow_start","flowId":"f1","flowName":"Test","totalSteps":1}\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"reason_start","reasoningId":"r1"}\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"reason_delta","reasoningId":"r1","reasoningText":"Thinking..."}\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"reason_complete","reasoningId":"r1"}\n\n'));
          controller.enqueue(encoder.encode('data: {"type":"flow_complete","success":true}\n\n'));
          controller.close();
        }
      });
      return { ok: true, body: stream };
    });

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });
    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Think', createdAt: new Date().toISOString() }] },
      (event) => events.push(event)
    );

    const messageEvents = events.filter(e => e.type === 'message');
    const messagesById = new Map<string, AgentWidgetMessage>();
    for (const event of messageEvents) {
      if (event.type === 'message') messagesById.set(event.message.id, event.message);
    }

    const reasoningMessages = Array.from(messagesById.values())
      .filter(m => m.variant === 'reasoning');
    expect(reasoningMessages.length).toBe(1);
    expect(reasoningMessages[0].reasoning?.chunks).toContain('Thinking...');
  });
});

