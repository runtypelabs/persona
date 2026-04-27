import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentWidgetClient, preferFinalStructuredContent } from './client';
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
          maxTurns: 3,
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
    expect(capturedPayload.agent.loopConfig.maxTurns).toBe(3);
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
        maxTurns: 1, startedAt: new Date().toISOString(), seq: 1,
      }),
      sseEvent('agent_iteration_start', {
        executionId: execId, iteration: 1, maxTurns: 1,
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
        maxTurns: 2, startedAt: new Date().toISOString(), seq: 1,
      }),
      // Iteration 1
      sseEvent('agent_iteration_start', {
        executionId: execId, iteration: 1, maxTurns: 2,
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
        executionId: execId, iteration: 2, maxTurns: 2,
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
        maxTurns: 2, startedAt: new Date().toISOString(), seq: 1,
      }),
      sseEvent('agent_iteration_start', {
        executionId: execId, iteration: 1, maxTurns: 2,
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
        executionId: execId, iteration: 2, maxTurns: 2,
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
        maxTurns: 1, startedAt: new Date().toISOString(), seq: 1,
      }),
      sseEvent('agent_iteration_start', {
        executionId: execId, iteration: 1, maxTurns: 1,
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
        maxTurns: 1, startedAt: new Date().toISOString(), seq: 1,
      }),
      sseEvent('agent_iteration_start', {
        executionId: execId, iteration: 1, maxTurns: 1,
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
        maxTurns: 1, startedAt: new Date().toISOString(), seq: 1,
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

  it('should emit error and finalize streaming on step_error', async () => {
    const events: AgentWidgetEvent[] = [];

    global.fetch = createAgentStreamFetch([
      'data: {"type":"flow_start","flowId":"f1","flowName":"Test","totalSteps":1}\n\n',
      'data: {"type":"step_delta","id":"s1","name":"Prompt","executionType":"prompt","text":"partial"}\n\n',
      sseEvent('step_error', { error: 'step blew up', seq: 3 }),
    ]);

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: { name: 'Test', model: 'openai:gpt-4o-mini', systemPrompt: 'test' },
    });

    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Hi', createdAt: new Date().toISOString() }] },
      (event) => events.push(event)
    );

    const errorEvents = events.filter(e => e.type === 'error');
    expect(errorEvents.length).toBe(1);
    if (errorEvents[0].type === 'error') {
      expect(errorEvents[0].error.message).toBe('step blew up');
    }

    const statusIdle = events.filter(e => e.type === 'status' && e.status === 'idle');
    expect(statusIdle.length).toBeGreaterThanOrEqual(1);

    const messageEvents = events.filter(e => e.type === 'message');
    const lastAssistant = [...messageEvents]
      .reverse()
      .find(e => e.type === 'message' && e.message.role === 'assistant' && !e.message.variant);
    expect(lastAssistant?.type === 'message' && lastAssistant.message.streaming).toBe(false);
  });

  it('should emit error and finalize streaming on dispatch_error (message only)', async () => {
    const events: AgentWidgetEvent[] = [];

    global.fetch = createAgentStreamFetch([
      'data: {"type":"flow_start","flowId":"f1","flowName":"Test","totalSteps":1}\n\n',
      'data: {"type":"step_delta","id":"s1","name":"Prompt","executionType":"prompt","text":"x"}\n\n',
      sseEvent('dispatch_error', { message: 'bad config', seq: 2 }),
    ]);

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: { name: 'Test', model: 'openai:gpt-4o-mini', systemPrompt: 'test' },
    });

    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Hi', createdAt: new Date().toISOString() }] },
      (event) => events.push(event)
    );

    const errorEvents = events.filter(e => e.type === 'error');
    expect(errorEvents.length).toBe(1);
    if (errorEvents[0].type === 'error') {
      expect(errorEvents[0].error.message).toBe('bad config');
    }

    const statusIdle = events.filter(e => e.type === 'status' && e.status === 'idle');
    expect(statusIdle.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle agent reflection events', async () => {
    const events: AgentWidgetEvent[] = [];
    const execId = 'exec_test_7';

    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', {
        executionId: execId, agentId: 'virtual', agentName: 'Test',
        maxTurns: 2, startedAt: new Date().toISOString(), seq: 1,
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
        maxTurns: 1, startedAt: new Date().toISOString(), seq: 1,
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
        maxTurns: 1, startedAt: new Date().toISOString(), seq: 1,
      }),
      sseEvent('agent_iteration_start', {
        executionId: execId, iteration: 1, maxTurns: 1,
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
        maxTurns: 2, startedAt: new Date().toISOString(), seq: 1,
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

  it('should handle reason_delta as canonical event (with reason_chunk as legacy alias)', async () => {
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

// ============================================================================
// Text/Tool Interleaving via partId Segmentation
// ============================================================================

describe('AgentWidgetClient - partId Text/Tool Interleaving', () => {
  it('should split assistant messages at tool boundaries using partId on step_delta', async () => {
    const events: AgentWidgetEvent[] = [];

    const encoder = new TextEncoder();
    global.fetch = vi.fn().mockImplementation(async () => {
      const stream = new ReadableStream({
        start(controller) {
          const e = (data: Record<string, unknown>) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

          e({ type: 'flow_start', flowId: 'f1', flowName: 'Test', totalSteps: 1 });
          e({ type: 'step_start', id: 's1', name: 'Prompt', stepType: 'prompt', index: 0, totalSteps: 1 });
          // First text segment
          e({ type: 'step_delta', id: 's1', text: 'Let me search', partId: 'text_0', messageId: 'msg_s1' });
          e({ type: 'step_delta', id: 's1', text: ' for that!', partId: 'text_0', messageId: 'msg_s1' });
          // Tool call
          e({ type: 'tool_start', toolId: 'tc_1', name: 'search', toolType: 'mcp', startedAt: new Date().toISOString() });
          e({ type: 'tool_complete', toolId: 'tc_1', name: 'search', result: { found: true }, success: true, completedAt: new Date().toISOString(), executionTime: 200 });
          // Second text segment (different partId)
          e({ type: 'step_delta', id: 's1', text: 'Found it! Here', partId: 'text_1', messageId: 'msg_s1' });
          e({ type: 'step_delta', id: 's1', text: ' are the results.', partId: 'text_1', messageId: 'msg_s1' });
          e({ type: 'flow_complete', success: true });
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

    const allMessages = Array.from(messagesById.values());
    const assistantTexts = allMessages
      .filter(m => m.role === 'assistant' && !m.variant)
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    const toolMsgs = allMessages.filter(m => m.variant === 'tool');

    // Should have TWO assistant text messages (split at tool boundary)
    expect(assistantTexts.length).toBe(2);
    expect(assistantTexts[0].content).toBe('Let me search for that!');
    expect(assistantTexts[1].content).toBe('Found it! Here are the results.');

    // First should be sealed (not streaming)
    expect(assistantTexts[0].streaming).toBe(false);

    // Tool message should exist
    expect(toolMsgs.length).toBe(1);
    expect(toolMsgs[0].toolCall?.name).toBe('search');

    // Ordering: first text seq < tool seq < second text seq
    const seq0 = assistantTexts[0].sequence ?? 0;
    const seqTool = toolMsgs[0].sequence ?? 0;
    const seq1 = assistantTexts[1].sequence ?? 0;
    expect(seq0).toBeLessThan(seqTool);
    expect(seqTool).toBeLessThan(seq1);
  });

  it('should split assistant messages using text_start/text_end lifecycle events', async () => {
    const events: AgentWidgetEvent[] = [];

    const encoder = new TextEncoder();
    global.fetch = vi.fn().mockImplementation(async () => {
      const stream = new ReadableStream({
        start(controller) {
          const e = (eventType: string, data: Record<string, unknown>) =>
            controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify({ type: eventType, ...data })}\n\n`));

          e('flow_start', { flowId: 'f1', flowName: 'Test', totalSteps: 1 });
          e('text_start', { partId: 'text_0', messageId: 'msg_s1', seq: 1 });
          e('step_delta', { id: 's1', text: 'Preamble text.', partId: 'text_0', messageId: 'msg_s1', seq: 2 });
          e('text_end', { partId: 'text_0', messageId: 'msg_s1', seq: 3 });
          e('tool_start', { toolId: 'tc_1', name: 'get_weather', toolType: 'builtin', startedAt: new Date().toISOString() });
          e('tool_complete', { toolId: 'tc_1', name: 'get_weather', result: { temp: 72 }, success: true, completedAt: new Date().toISOString(), executionTime: 100 });
          e('text_start', { partId: 'text_1', messageId: 'msg_s1', seq: 6 });
          e('step_delta', { id: 's1', text: 'The weather is 72F.', partId: 'text_1', messageId: 'msg_s1', seq: 7 });
          e('text_end', { partId: 'text_1', messageId: 'msg_s1', seq: 8 });
          e('flow_complete', { success: true });
          controller.close();
        }
      });
      return { ok: true, body: stream };
    });

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });
    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Weather?', createdAt: new Date().toISOString() }] },
      (event) => events.push(event)
    );

    const messageEvents = events.filter(e => e.type === 'message');
    const messagesById = new Map<string, AgentWidgetMessage>();
    for (const event of messageEvents) {
      if (event.type === 'message') messagesById.set(event.message.id, event.message);
    }

    const allMessages = Array.from(messagesById.values());
    const assistantTexts = allMessages
      .filter(m => m.role === 'assistant' && !m.variant)
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    const toolMsgs = allMessages.filter(m => m.variant === 'tool');

    expect(assistantTexts.length).toBe(2);
    expect(assistantTexts[0].content).toBe('Preamble text.');
    expect(assistantTexts[0].streaming).toBe(false);
    expect(assistantTexts[1].content).toBe('The weather is 72F.');

    expect(toolMsgs.length).toBe(1);

    const seq0 = assistantTexts[0].sequence ?? 0;
    const seqTool = toolMsgs[0].sequence ?? 0;
    const seq1 = assistantTexts[1].sequence ?? 0;
    expect(seq0).toBeLessThan(seqTool);
    expect(seqTool).toBeLessThan(seq1);
  });

  it('should not split when partId is absent (backward compatible)', async () => {
    const events: AgentWidgetEvent[] = [];

    const encoder = new TextEncoder();
    global.fetch = vi.fn().mockImplementation(async () => {
      const stream = new ReadableStream({
        start(controller) {
          const e = (data: Record<string, unknown>) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

          e({ type: 'flow_start', flowId: 'f1', flowName: 'Test', totalSteps: 1 });
          e({ type: 'step_delta', id: 's1', text: 'Hello ' });
          e({ type: 'step_delta', id: 's1', text: 'world' });
          e({ type: 'flow_complete', success: true });
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
    const messagesById = new Map<string, AgentWidgetMessage>();
    for (const event of messageEvents) {
      if (event.type === 'message') messagesById.set(event.message.id, event.message);
    }

    const assistantTexts = Array.from(messagesById.values())
      .filter(m => m.role === 'assistant' && !m.variant);

    // Should still be a single message (no partId = no splitting)
    expect(assistantTexts.length).toBe(1);
    expect(assistantTexts[0].content).toContain('Hello ');
    expect(assistantTexts[0].content).toContain('world');
  });

  it('should handle multiple tool calls with proper text interleaving', async () => {
    const events: AgentWidgetEvent[] = [];

    const encoder = new TextEncoder();
    global.fetch = vi.fn().mockImplementation(async () => {
      const stream = new ReadableStream({
        start(controller) {
          const e = (data: Record<string, unknown>) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

          e({ type: 'flow_start', flowId: 'f1', flowName: 'Test', totalSteps: 1 });
          // text_0: preamble
          e({ type: 'step_delta', id: 's1', text: 'Searching...', partId: 'text_0' });
          // tool 1
          e({ type: 'tool_start', toolId: 'tc_1', name: 'search', toolType: 'mcp' });
          e({ type: 'tool_complete', toolId: 'tc_1', name: 'search', result: { id: 27 }, success: true, executionTime: 100 });
          // text_1: between tools
          e({ type: 'step_delta', id: 's1', text: 'Adding to cart...', partId: 'text_1' });
          // tool 2
          e({ type: 'tool_start', toolId: 'tc_2', name: 'add_to_cart', toolType: 'mcp' });
          e({ type: 'tool_complete', toolId: 'tc_2', name: 'add_to_cart', result: { success: true }, success: true, executionTime: 50 });
          // text_2: final
          e({ type: 'step_delta', id: 's1', text: 'Done! Item added.', partId: 'text_2' });
          e({ type: 'flow_complete', success: true });
          controller.close();
        }
      });
      return { ok: true, body: stream };
    });

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });
    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Add item', createdAt: new Date().toISOString() }] },
      (event) => events.push(event)
    );

    const messageEvents = events.filter(e => e.type === 'message');
    const messagesById = new Map<string, AgentWidgetMessage>();
    for (const event of messageEvents) {
      if (event.type === 'message') messagesById.set(event.message.id, event.message);
    }

    const allMessages = Array.from(messagesById.values());
    const assistantTexts = allMessages
      .filter(m => m.role === 'assistant' && !m.variant)
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    const toolMsgs = allMessages
      .filter(m => m.variant === 'tool')
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

    // 3 text segments, 2 tool calls
    expect(assistantTexts.length).toBe(3);
    expect(toolMsgs.length).toBe(2);

    expect(assistantTexts[0].content).toBe('Searching...');
    expect(assistantTexts[1].content).toBe('Adding to cart...');
    expect(assistantTexts[2].content).toBe('Done! Item added.');

    // Verify chronological ordering: text0 < tool1 < text1 < tool2 < text2
    const seqs = [
      assistantTexts[0].sequence ?? 0,
      toolMsgs[0].sequence ?? 0,
      assistantTexts[1].sequence ?? 0,
      toolMsgs[1].sequence ?? 0,
      assistantTexts[2].sequence ?? 0,
    ];
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
    }
  });

  it('should give split messages unique IDs even when assistantMessageId is provided', async () => {
    const events: AgentWidgetEvent[] = [];

    const encoder = new TextEncoder();
    global.fetch = vi.fn().mockImplementation(async () => {
      const stream = new ReadableStream({
        start(controller) {
          const e = (data: Record<string, unknown>) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

          e({ type: 'flow_start', flowId: 'f1', flowName: 'Test', totalSteps: 1 });
          e({ type: 'step_delta', id: 's1', text: 'Before tool.', partId: 'text_0' });
          e({ type: 'tool_start', toolId: 'tc_1', name: 'lookup', toolType: 'mcp' });
          e({ type: 'tool_complete', toolId: 'tc_1', name: 'lookup', result: {}, success: true, executionTime: 50 });
          e({ type: 'step_delta', id: 's1', text: 'After tool.', partId: 'text_1' });
          e({ type: 'flow_complete', success: true });
          controller.close();
        }
      });
      return { ok: true, body: stream };
    });

    // Use agent mode so assistantMessageId is forwarded to streamResponse
    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: { name: 'Test', model: 'openai:gpt-4o-mini', systemPrompt: 'test' },
    });
    await client.dispatch(
      {
        messages: [{ id: 'usr_1', role: 'user', content: 'Go', createdAt: new Date().toISOString() }],
        assistantMessageId: 'ast_pre_generated_id',
      },
      (event) => events.push(event)
    );

    const messageEvents = events.filter(e => e.type === 'message');
    const messagesById = new Map<string, AgentWidgetMessage>();
    for (const event of messageEvents) {
      if (event.type === 'message') messagesById.set(event.message.id, event.message);
    }

    const assistantTexts = Array.from(messagesById.values())
      .filter(m => m.role === 'assistant' && !m.variant)
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

    // Should have two distinct messages
    expect(assistantTexts.length).toBe(2);
    // First message uses the provided ID
    expect(assistantTexts[0].id).toBe('ast_pre_generated_id');
    // Second message composes baseId + partId for traceability
    expect(assistantTexts[1].id).toBe('ast_pre_generated_id_text_1');
    // Content is correct per segment
    expect(assistantTexts[0].content).toBe('Before tool.');
    expect(assistantTexts[1].content).toBe('After tool.');
  });

  it('should not overwrite last segment content with full response in flow_complete', async () => {
    const events: AgentWidgetEvent[] = [];

    const encoder = new TextEncoder();
    global.fetch = vi.fn().mockImplementation(async () => {
      const stream = new ReadableStream({
        start(controller) {
          const e = (data: Record<string, unknown>) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

          e({ type: 'flow_start', flowId: 'f1', flowName: 'Test', totalSteps: 1 });
          e({ type: 'step_delta', id: 's1', text: 'First part.', partId: 'text_0' });
          e({ type: 'tool_start', toolId: 'tc_1', name: 'action', toolType: 'mcp' });
          e({ type: 'tool_complete', toolId: 'tc_1', name: 'action', result: {}, success: true, executionTime: 10 });
          e({ type: 'step_delta', id: 's1', text: 'Second part.', partId: 'text_1' });
          // flow_complete with full concatenated response
          e({ type: 'flow_complete', success: true, result: { response: 'First part.Second part.' } });
          controller.close();
        }
      });
      return { ok: true, body: stream };
    });

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });
    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Go', createdAt: new Date().toISOString() }] },
      (event) => events.push(event)
    );

    const messageEvents = events.filter(e => e.type === 'message');
    const messagesById = new Map<string, AgentWidgetMessage>();
    for (const event of messageEvents) {
      if (event.type === 'message') messagesById.set(event.message.id, event.message);
    }

    const assistantTexts = Array.from(messagesById.values())
      .filter(m => m.role === 'assistant' && !m.variant)
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

    expect(assistantTexts.length).toBe(2);
    // Last segment should keep its own content, NOT the full response
    expect(assistantTexts[0].content).toBe('First part.');
    expect(assistantTexts[1].content).toBe('Second part.');
    // Both should be finalized
    expect(assistantTexts[0].streaming).toBe(false);
    expect(assistantTexts[1].streaming).toBe(false);
  });

  it('should not duplicate text when step_complete follows text_end', async () => {
    const events: AgentWidgetEvent[] = [];

    const encoder = new TextEncoder();
    global.fetch = vi.fn().mockImplementation(async () => {
      const stream = new ReadableStream({
        start(controller) {
          const e = (eventType: string, data: Record<string, unknown>) =>
            controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify({ type: eventType, ...data })}\n\n`));

          e('flow_start', { flowId: 'f1', flowName: 'Test', totalSteps: 1 });
          // Tools fire first (no text before them)
          e('tool_start', { toolId: 'tc_1', name: 'test_tool', toolType: 'custom', startedAt: new Date().toISOString() });
          e('tool_complete', { toolId: 'tc_1', name: 'test_tool', success: true, completedAt: new Date().toISOString(), executionTime: 0 });
          // Then text segment
          e('text_start', { partId: 'text_1', messageId: 'msg_s1', seq: 1 });
          e('step_delta', { id: 's1', text: 'Tool returned a result.', partId: 'text_1', messageId: 'msg_s1', seq: 2 });
          e('text_end', { partId: 'text_1', messageId: 'msg_s1', seq: 3 });
          // step_complete with full response (should NOT create a duplicate)
          e('step_complete', { id: 's1', name: 'Response', stepType: 'prompt', success: true, result: { response: 'Tool returned a result.' }, executionTime: 500 });
          e('flow_complete', { success: true });
          controller.close();
        }
      });
      return { ok: true, body: stream };
    });

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });
    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Call tool', createdAt: new Date().toISOString() }] },
      (event) => events.push(event)
    );

    const messageEvents = events.filter(e => e.type === 'message');
    const messagesById = new Map<string, AgentWidgetMessage>();
    for (const event of messageEvents) {
      if (event.type === 'message') messagesById.set(event.message.id, event.message);
    }

    const allMessages = Array.from(messagesById.values());
    const assistantTexts = allMessages
      .filter(m => m.role === 'assistant' && !m.variant)
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    const toolMsgs = allMessages.filter(m => m.variant === 'tool');

    // Exactly ONE text message (not duplicated by step_complete)
    expect(assistantTexts.length).toBe(1);
    expect(assistantTexts[0].content).toBe('Tool returned a result.');
    expect(assistantTexts[0].streaming).toBe(false);

    // Tool message exists
    expect(toolMsgs.length).toBe(1);
  });

  async function runSealedSegmentReconciliationTest(opts: {
    parserMatchContent: string;
    stepCompleteResponse: string;
    expectedRawContent: string;
  }) {
    vi.useFakeTimers();
    const events: AgentWidgetEvent[] = [];

    const delayedJsonParser = () => {
      let extractedText: string | null = null;
      return {
        processChunk: (accumulatedContent: string) =>
          new Promise<{ text: string; raw: string } | null>((resolve) => {
            setTimeout(() => {
              if (accumulatedContent === opts.parserMatchContent) {
                extractedText = 'Tool returned a result.';
                resolve({ text: extractedText, raw: accumulatedContent });
                return;
              }
              resolve(null);
            }, 0);
          }),
        getExtractedText: () => extractedText,
        close: async () => {}
      };
    };

    const encoder = new TextEncoder();
    global.fetch = vi.fn().mockImplementation(async () => {
      const stream = new ReadableStream({
        start(controller) {
          const e = (eventType: string, data: Record<string, unknown>) =>
            controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify({ type: eventType, ...data })}\n\n`));

          e('flow_start', { flowId: 'f1', flowName: 'Test', totalSteps: 1 });
          e('tool_start', { toolId: 'tc_1', name: 'test_tool', toolType: 'custom', startedAt: new Date().toISOString() });
          e('tool_complete', { toolId: 'tc_1', name: 'test_tool', success: true, completedAt: new Date().toISOString(), executionTime: 0 });
          e('text_start', { partId: 'text_1', messageId: 'msg_s1', seq: 1 });
          e('step_delta', {
            id: 's1',
            text: '{"text":"Tool returned a re',
            partId: 'text_1',
            messageId: 'msg_s1',
            seq: 2
          });
          e('text_end', { partId: 'text_1', messageId: 'msg_s1', seq: 3 });
          e('step_complete', {
            id: 's1',
            name: 'Response',
            stepType: 'prompt',
            success: true,
            result: { response: opts.stepCompleteResponse },
            executionTime: 500
          });
          e('flow_complete', { success: true });
          controller.close();
        }
      });
      return { ok: true, body: stream };
    });

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      streamParser: delayedJsonParser
    });
    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Call tool', createdAt: new Date().toISOString() }] },
      (event) => events.push(event)
    );
    await vi.runAllTimersAsync();
    vi.useRealTimers();

    const messageEvents = events.filter(e => e.type === 'message');
    const messagesById = new Map<string, AgentWidgetMessage>();
    for (const event of messageEvents) {
      if (event.type === 'message') messagesById.set(event.message.id, event.message);
    }

    const allMessages = Array.from(messagesById.values());
    const assistantTexts = allMessages
      .filter(m => m.role === 'assistant' && !m.variant)
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    const toolMsgs = allMessages.filter(m => m.variant === 'tool');

    expect(assistantTexts.length).toBe(1);
    expect(assistantTexts[0].content).toBe('Tool returned a result.');
    expect(assistantTexts[0].rawContent).toBe(opts.expectedRawContent);
    expect(assistantTexts[0].streaming).toBe(false);
    expect(toolMsgs.length).toBe(1);
  }

  it('should reconcile a sealed text segment with async parser output from step_complete', async () => {
    await runSealedSegmentReconciliationTest({
      parserMatchContent: '{"text":"Tool returned a result."',
      stepCompleteResponse: 'Tool returned a result.',
      expectedRawContent: '{"text":"Tool returned a re',
    });
  });

  it('should prefer the authoritative final structured response when reconciling a sealed segment', async () => {
    await runSealedSegmentReconciliationTest({
      parserMatchContent: '{"text":"Tool returned a result."}',
      stepCompleteResponse: '{"text":"Tool returned a result."}',
      expectedRawContent: '{"text":"Tool returned a result."}',
    });
  });
});

describe('preferFinalStructuredContent', () => {
  it('returns finalString when rawBuffer is undefined', () => {
    expect(preferFinalStructuredContent(undefined, 'hello')).toBe('hello');
  });

  it('returns finalString when rawBuffer is empty/whitespace', () => {
    expect(preferFinalStructuredContent('', 'hello')).toBe('hello');
    expect(preferFinalStructuredContent('   ', 'hello')).toBe('hello');
  });

  it('returns rawBuffer when finalString is empty/whitespace', () => {
    expect(preferFinalStructuredContent('{"text":"hi"}', '')).toBe('{"text":"hi"}');
    expect(preferFinalStructuredContent('{"text":"hi"}', '  ')).toBe('{"text":"hi"}');
  });

  it('returns rawBuffer when final is plain text (not structured)', () => {
    expect(preferFinalStructuredContent('{"text":"hi"}', 'plain text')).toBe('{"text":"hi"}');
  });

  it('returns finalString when raw is plain text but final is structured', () => {
    expect(preferFinalStructuredContent('partial plain', '{"text":"hi"}')).toBe('{"text":"hi"}');
  });

  it('returns finalString when both are identical structured content', () => {
    const json = '{"text":"hello"}';
    expect(preferFinalStructuredContent(json, json)).toBe(json);
  });

  it('returns finalString when final is a superset of the raw buffer', () => {
    expect(preferFinalStructuredContent(
      '{"text":"hel',
      '{"text":"hello"}'
    )).toBe('{"text":"hello"}');
  });

  it('returns finalString when final is parseable JSON but raw is not', () => {
    expect(preferFinalStructuredContent(
      '{"text":"hel',
      '{"text":"hello"}'
    )).toBe('{"text":"hello"}');
  });

  it('returns rawBuffer when both are structured but neither is a prefix of the other and both parse', () => {
    expect(preferFinalStructuredContent(
      '{"text":"segment two"}',
      '{"text":"full response with segment one and two"}'
    )).toBe('{"text":"segment two"}');
  });

  it('returns rawBuffer when both are structured, different, and raw parses', () => {
    expect(preferFinalStructuredContent(
      '{"text":"short"}',
      '{"text":"different content"}'
    )).toBe('{"text":"short"}');
  });

  it('returns finalString when final parses but raw does not (partial JSON)', () => {
    expect(preferFinalStructuredContent(
      '{"text":"incomp',
      '{"text":"complete"}'
    )).toBe('{"text":"complete"}');
  });

  it('handles XML-shaped content as structured', () => {
    expect(preferFinalStructuredContent(
      '<response>partial',
      '<response>full</response>'
    )).toBe('<response>partial');
  });

  it('handles array-shaped JSON content as structured', () => {
    expect(preferFinalStructuredContent(
      '[{"text":"par',
      '[{"text":"partial"}]'
    )).toBe('[{"text":"partial"}]');
  });
});

describe('AgentWidgetClient - Out-of-Order Sequence Reordering', () => {
  it('should reorder step_delta chunks by seq when events arrive out of order', async () => {
    const events: AgentWidgetEvent[] = [];

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });

    global.fetch = vi.fn().mockImplementation(async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const e = (data: any) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };
          e({ type: 'flow_start', flowId: 'f1', flowName: 'Test', totalSteps: 1 });
          e({ type: 'step_start', id: 's1', name: 'Prompt', stepType: 'prompt', index: 1, totalSteps: 1 });
          // Send chunks out of order (seq 3 before seq 2)
          e({ type: 'step_delta', id: 's1', text: 'Hello', partId: 'text_0', seq: 1 });
          e({ type: 'step_delta', id: 's1', text: ' world', partId: 'text_0', seq: 3 });
          e({ type: 'step_delta', id: 's1', text: ' beautiful', partId: 'text_0', seq: 2 });
          e({ type: 'step_delta', id: 's1', text: '!', partId: 'text_0', seq: 4 });
          e({ type: 'step_complete', id: 's1', name: 'Prompt', success: true });
          e({ type: 'flow_complete', success: true });
          controller.close();
        },
      });
      return { ok: true, body: stream };
    });

    await client.dispatch({ messages: [] }, (event) => events.push(event));

    const messageEvents = events.filter(
      (e): e is AgentWidgetEvent & { type: 'message' } => e.type === 'message'
    );
    const finalMessages = messageEvents.filter((e) => !e.message.streaming);
    expect(finalMessages.length).toBeGreaterThan(0);

    const lastFinal = finalMessages[finalMessages.length - 1];
    // Content should be in seq order, not arrival order
    expect(lastFinal.message.content).toBe('Hello beautiful world!');
  });

  it('repairs a delayed step_delta that arrives after the gap-timeout flush', async () => {
    vi.useFakeTimers();
    const events: AgentWidgetEvent[] = [];

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });

    global.fetch = vi.fn().mockImplementation(async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const e = (data: any) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };

          e({ type: 'flow_start', flowId: 'f1', flowName: 'Test', totalSteps: 1 });
          e({ type: 'step_start', id: 's1', name: 'Prompt', stepType: 'prompt', index: 1, totalSteps: 1 });
          e({ type: 'text_start', partId: 'text_0', messageId: 'msg_1', seq: 1 });
          e({ type: 'step_delta', id: 's1', text: 'a', partId: 'text_0', messageId: 'msg_1', seq: 2 });
          // seq=3 is delayed long enough for the reorder buffer to flush seq=4 and seq=5.
          e({ type: 'step_delta', id: 's1', text: 'c', partId: 'text_0', messageId: 'msg_1', seq: 4 });
          e({ type: 'text_end', partId: 'text_0', messageId: 'msg_1', seq: 5 });

          setTimeout(() => {
            e({ type: 'step_delta', id: 's1', text: 'b', partId: 'text_0', messageId: 'msg_1', seq: 3 });
          }, 60);

          setTimeout(() => {
            e({ type: 'flow_complete', success: true });
            controller.close();
          }, 70);
        },
      });
      return { ok: true, body: stream };
    });

    const dispatchPromise = client.dispatch({ messages: [] }, (event) => events.push(event));
    await vi.advanceTimersByTimeAsync(80);
    await dispatchPromise;
    vi.useRealTimers();

    const messageEvents = events.filter(
      (e): e is AgentWidgetEvent & { type: 'message' } => e.type === 'message'
    );
    const assistantMessages = messageEvents
      .filter((e) => e.message.role === 'assistant' && !e.message.variant)
      .map((e) => e.message);
    expect(assistantMessages.length).toBeGreaterThan(0);

    const repairedMessage = assistantMessages[assistantMessages.length - 1];
    expect(repairedMessage.content).toBe('abc');
    expect(repairedMessage.partId).toBe('text_0');
  });

  it('should reorder reason_delta chunks by sequenceIndex', async () => {
    const events: AgentWidgetEvent[] = [];

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });

    global.fetch = vi.fn().mockImplementation(async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const e = (data: any) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };
          e({ type: 'flow_start', flowId: 'f1', flowName: 'Test', totalSteps: 1 });
          e({ type: 'step_start', id: 's1', name: 'Prompt', stepType: 'prompt', index: 1, totalSteps: 1 });
          e({ type: 'reason_start', reasoningId: 'r1', hidden: false, done: false });
          // Send reasoning chunks out of order
          e({ type: 'reason_delta', reasoningId: 'r1', reasoningText: 'I ', hidden: false, done: false, sequenceIndex: 1 });
          e({ type: 'reason_delta', reasoningId: 'r1', reasoningText: 'about', hidden: false, done: false, sequenceIndex: 3 });
          e({ type: 'reason_delta', reasoningId: 'r1', reasoningText: 'think ', hidden: false, done: false, sequenceIndex: 2 });
          e({ type: 'reason_delta', reasoningId: 'r1', reasoningText: ' this.', hidden: false, done: false, sequenceIndex: 4 });
          e({ type: 'reason_complete', reasoningId: 'r1', hidden: false, done: true });
          e({ type: 'step_delta', id: 's1', text: 'Result', partId: 'text_0' });
          e({ type: 'step_complete', id: 's1', name: 'Prompt', success: true });
          e({ type: 'flow_complete', success: true });
          controller.close();
        },
      });
      return { ok: true, body: stream };
    });

    await client.dispatch({ messages: [] }, (event) => events.push(event));

    const messageEvents = events.filter(
      (e): e is AgentWidgetEvent & { type: 'message' } => e.type === 'message'
    );
    const reasoningMsgs = messageEvents.filter(
      (e) => e.message.reasoning && e.message.reasoning.chunks.length > 0
    );
    expect(reasoningMsgs.length).toBeGreaterThan(0);

    const lastReasoning = reasoningMsgs[reasoningMsgs.length - 1];
    // Reasoning chunks should be in sequenceIndex order
    const fullReasoning = lastReasoning.message.reasoning!.chunks.join('');
    expect(fullReasoning).toBe('I think about this.');
  });

  it('repairs a delayed reason_delta that arrives after the gap-timeout flush', async () => {
    vi.useFakeTimers();
    const events: AgentWidgetEvent[] = [];

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });

    global.fetch = vi.fn().mockImplementation(async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const e = (data: any) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };

          e({ type: 'flow_start', flowId: 'f1', flowName: 'Test', totalSteps: 1 });
          e({ type: 'step_start', id: 's1', name: 'Prompt', stepType: 'prompt', index: 1, totalSteps: 1 });
          e({ type: 'reason_start', reasoningId: 'r1', hidden: false, done: false, sequenceIndex: 1 });
          e({ type: 'reason_delta', reasoningId: 'r1', reasoningText: 'a', hidden: false, done: false, sequenceIndex: 2 });
          // sequenceIndex=3 is delayed long enough for the gap-timeout to flush sequenceIndex=4
          e({ type: 'reason_delta', reasoningId: 'r1', reasoningText: 'c', hidden: false, done: false, sequenceIndex: 4 });

          setTimeout(() => {
            // Late arrival after gap-timeout flush
            e({ type: 'reason_delta', reasoningId: 'r1', reasoningText: 'b', hidden: false, done: false, sequenceIndex: 3 });
          }, 60);

          setTimeout(() => {
            e({ type: 'reason_complete', reasoningId: 'r1', hidden: false, done: true, sequenceIndex: 5 });
            e({ type: 'step_delta', id: 's1', text: 'Result', partId: 'text_0', sequenceIndex: 6 });
            e({ type: 'step_complete', id: 's1', name: 'Prompt', success: true });
            e({ type: 'flow_complete', success: true });
            controller.close();
          }, 70);
        },
      });
      return { ok: true, body: stream };
    });

    const dispatchPromise = client.dispatch({ messages: [] }, (event) => events.push(event));
    await vi.advanceTimersByTimeAsync(80);
    await dispatchPromise;
    vi.useRealTimers();

    const messageEvents = events.filter(
      (e): e is AgentWidgetEvent & { type: 'message' } => e.type === 'message'
    );
    const reasoningMsgs = messageEvents.filter(
      (e) => e.message.reasoning && e.message.reasoning.chunks.length > 0
    );
    expect(reasoningMsgs.length).toBeGreaterThan(0);

    const lastReasoning = reasoningMsgs[reasoningMsgs.length - 1];
    const fullReasoning = lastReasoning.message.reasoning!.chunks.join('');
    expect(fullReasoning).toBe('abc');
  });

  it('should handle step_delta without seq gracefully (no reordering)', async () => {
    const events: AgentWidgetEvent[] = [];

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });

    global.fetch = vi.fn().mockImplementation(async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const e = (data: any) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };
          e({ type: 'flow_start', flowId: 'f1', flowName: 'Test', totalSteps: 1 });
          e({ type: 'step_start', id: 's1', name: 'Prompt', stepType: 'prompt', index: 1, totalSteps: 1 });
          // No seq field — should append in arrival order
          e({ type: 'step_delta', id: 's1', text: 'Hello ' });
          e({ type: 'step_delta', id: 's1', text: 'world' });
          e({ type: 'step_delta', id: 's1', text: '!' });
          e({ type: 'step_complete', id: 's1', name: 'Prompt', success: true });
          e({ type: 'flow_complete', success: true });
          controller.close();
        },
      });
      return { ok: true, body: stream };
    });

    await client.dispatch({ messages: [] }, (event) => events.push(event));

    const messageEvents = events.filter(
      (e): e is AgentWidgetEvent & { type: 'message' } => e.type === 'message'
    );
    const finalMessages = messageEvents.filter((e) => !e.message.streaming);
    expect(finalMessages.length).toBeGreaterThan(0);

    const lastFinal = finalMessages[finalMessages.length - 1];
    expect(lastFinal.message.content).toBe('Hello world!');
  });

  it('should handle leading-gap arrival (first event is not seq=1)', async () => {
    const events: AgentWidgetEvent[] = [];

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });

    global.fetch = vi.fn().mockImplementation(async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const e = (data: any) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };
          e({ type: 'flow_start', flowId: 'f1', flowName: 'Test', totalSteps: 1 });
          e({ type: 'step_start', id: 's1', name: 'Prompt', stepType: 'prompt', index: 1, totalSteps: 1 });
          // seq=3 arrives first (leading gap — seq 1 and 2 arrive later)
          e({ type: 'step_delta', id: 's1', text: 'c', partId: 'text_0', seq: 3 });
          e({ type: 'step_delta', id: 's1', text: 'a', partId: 'text_0', seq: 1 });
          e({ type: 'step_delta', id: 's1', text: 'b', partId: 'text_0', seq: 2 });
          e({ type: 'step_complete', id: 's1', name: 'Prompt', success: true });
          e({ type: 'flow_complete', success: true });
          controller.close();
        },
      });
      return { ok: true, body: stream };
    });

    await client.dispatch({ messages: [] }, (event) => events.push(event));

    const messageEvents = events.filter(
      (e): e is AgentWidgetEvent & { type: 'message' } => e.type === 'message'
    );
    const finalMessages = messageEvents.filter((e) => !e.message.streaming);
    expect(finalMessages.length).toBeGreaterThan(0);

    const lastFinal = finalMessages[finalMessages.length - 1];
    // Must be in seq order, not arrival order
    expect(lastFinal.message.content).toBe('abc');
  });

  it('should handle mixed seq + sequenceIndex in one stream', async () => {
    const events: AgentWidgetEvent[] = [];

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });

    global.fetch = vi.fn().mockImplementation(async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const e = (data: any) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };
          e({ type: 'flow_start', flowId: 'f1', flowName: 'Test', totalSteps: 1 });
          e({ type: 'step_start', id: 's1', name: 'Prompt', stepType: 'prompt', index: 1, totalSteps: 1 });
          // reason_delta uses sequenceIndex, step_delta uses seq — same counter
          e({ type: 'reason_start', reasoningId: 'r1', hidden: false, done: false });
          e({ type: 'reason_delta', reasoningId: 'r1', reasoningText: 'thinking', hidden: false, done: false, sequenceIndex: 1 });
          e({ type: 'reason_complete', reasoningId: 'r1', hidden: false, done: true });
          // step_delta seq=2 continues from the same counter
          e({ type: 'step_delta', id: 's1', text: 'Result', partId: 'text_0', seq: 2 });
          e({ type: 'step_complete', id: 's1', name: 'Prompt', success: true });
          e({ type: 'flow_complete', success: true });
          controller.close();
        },
      });
      return { ok: true, body: stream };
    });

    await client.dispatch({ messages: [] }, (event) => events.push(event));

    const messageEvents = events.filter(
      (e): e is AgentWidgetEvent & { type: 'message' } => e.type === 'message'
    );
    // Should have both reasoning and text messages, properly ordered
    const reasoningMsgs = messageEvents.filter(e => e.message.reasoning?.chunks?.length);
    expect(reasoningMsgs.length).toBeGreaterThan(0);
    expect(reasoningMsgs[reasoningMsgs.length - 1].message.reasoning!.chunks.join('')).toBe('thinking');

    const textMsgs = messageEvents.filter(e => e.message.role === 'assistant' && !e.message.variant && e.message.content);
    expect(textMsgs.length).toBeGreaterThan(0);
    expect(textMsgs[textMsgs.length - 1].message.content).toContain('Result');
  });

  it('should handle cross-event buffering around tool events', async () => {
    const events: AgentWidgetEvent[] = [];

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });

    global.fetch = vi.fn().mockImplementation(async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const e = (data: any) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };
          e({ type: 'flow_start', flowId: 'f1', flowName: 'Test', totalSteps: 1 });
          e({ type: 'step_start', id: 's1', name: 'Prompt', stepType: 'prompt', index: 1, totalSteps: 1 });
          // text_start and step_delta with seq, then tool events (no seq), then more text
          e({ type: 'text_start', partId: 'text_0', messageId: 'msg_1', seq: 1 });
          e({ type: 'step_delta', id: 's1', text: 'Before tool ', partId: 'text_0', seq: 2 });
          e({ type: 'text_end', partId: 'text_0', messageId: 'msg_1', seq: 3 });
          // Tool events don't carry top-level seq in non-agent flows
          e({ type: 'tool_start', toolCallId: 'tc1', name: 'fetch', parameters: {} });
          e({ type: 'tool_complete', toolCallId: 'tc1', name: 'fetch', result: { data: 'ok' }, executionTime: 100 });
          e({ type: 'text_start', partId: 'text_1', messageId: 'msg_1', seq: 4 });
          e({ type: 'step_delta', id: 's1', text: 'after tool', partId: 'text_1', seq: 5 });
          e({ type: 'text_end', partId: 'text_1', messageId: 'msg_1', seq: 6 });
          e({ type: 'step_complete', id: 's1', name: 'Prompt', success: true });
          e({ type: 'flow_complete', success: true });
          controller.close();
        },
      });
      return { ok: true, body: stream };
    });

    await client.dispatch({ messages: [] }, (event) => events.push(event));

    const messageEvents = events.filter(
      (e): e is AgentWidgetEvent & { type: 'message' } => e.type === 'message'
    );
    // Should have text content from both segments
    const allContent = messageEvents
      .filter(e => e.message.role === 'assistant' && !e.message.variant)
      .map(e => e.message.content);
    const combinedContent = allContent.join('');
    expect(combinedContent).toContain('Before tool ');
    expect(combinedContent).toContain('after tool');
  });

  it('delivers sequenced events still buffered when the stream closes', async () => {
    // Regression: if the SSE stream ends while the reorder buffer is still
    // waiting for a missing seq number, previously those events were silently
    // dropped (destroy() cancelled the gap timer without flushing). The fix
    // is an end-of-stream flush + drain; this test guards against regression.
    const events: AgentWidgetEvent[] = [];

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });

    global.fetch = vi.fn().mockImplementation(async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const e = (data: any) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };
          e({ type: 'flow_start', flowId: 'f1', flowName: 'Test', totalSteps: 1 });
          e({ type: 'step_start', id: 's1', name: 'Prompt', stepType: 'prompt', index: 1, totalSteps: 1 });
          // Only a seq=3 event arrives — seq=1 and seq=2 are never delivered.
          // Without the end-of-stream flush, this event would be stranded in
          // the reorder buffer and never emitted.
          e({ type: 'step_delta', id: 's1', text: 'tail', partId: 'text_0', seq: 3 });
          // Stream closes immediately, well inside the 50ms gap timer window.
          controller.close();
        },
      });
      return { ok: true, body: stream };
    });

    await client.dispatch({ messages: [] }, (event) => events.push(event));

    const messageEvents = events.filter(
      (e): e is AgentWidgetEvent & { type: 'message' } => e.type === 'message'
    );
    const assistantContent = messageEvents
      .filter((e) => e.message.role === 'assistant' && !e.message.variant)
      .map((e) => e.message.content)
      .join('');

    expect(assistantContent).toContain('tail');
  });

  it('drains timer-flushed sequenced events before the next SSE chunk arrives', async () => {
    vi.useFakeTimers();
    const events: AgentWidgetEvent[] = [];

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });

    global.fetch = vi.fn().mockImplementation(async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const e = (data: any) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };
          e({ type: 'flow_start', flowId: 'f1', flowName: 'Test', totalSteps: 1 });
          e({ type: 'step_start', id: 's1', name: 'Prompt', stepType: 'prompt', index: 1, totalSteps: 1 });
          e({ type: 'step_delta', id: 's1', text: 'a', partId: 'text_0', seq: 1 });
          // seq=3 buffers while seq=2 is missing.
          e({ type: 'step_delta', id: 's1', text: 'c', partId: 'text_0', seq: 3 });

          // Keep the stream open without delivering another SSE event until after
          // the gap timeout has fired. The buffered seq=3 event should still render.
          setTimeout(() => {
            e({ type: 'flow_complete', success: true });
            controller.close();
          }, 120);
        },
      });
      return { ok: true, body: stream };
    });

    const dispatchPromise = client.dispatch({ messages: [] }, (event) => events.push(event));

    await vi.advanceTimersByTimeAsync(60);

    const messageEventsDuringPause = events.filter(
      (e): e is AgentWidgetEvent & { type: 'message' } => e.type === 'message'
    );
    const assistantContentDuringPause = messageEventsDuringPause
      .filter((e) => e.message.role === 'assistant' && !e.message.variant)
      .map((e) => e.message.content)
      .join('');

    expect(assistantContentDuringPause).toContain('ac');

    await vi.advanceTimersByTimeAsync(70);
    await dispatchPromise;
    vi.useRealTimers();
  });

  it('delivers a buffered error event when the stream closes mid-gap', async () => {
    // Regression: an error event with seq > 1 arriving right before the
    // stream closes was being swallowed by the reorder buffer, leaving the
    // widget stuck in a streaming state with no error surfaced.
    const events: AgentWidgetEvent[] = [];

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });

    global.fetch = vi.fn().mockImplementation(async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const e = (data: any) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };
          e({ type: 'flow_start', flowId: 'f1', flowName: 'Test', totalSteps: 1 });
          // Only sequenced event — but seq > 1 so it would be buffered.
          e({ type: 'error', error: 'boom', seq: 2 });
          controller.close();
        },
      });
      return { ok: true, body: stream };
    });

    await client.dispatch({ messages: [] }, (event) => events.push(event));

    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents.length).toBe(1);
    if (errorEvents[0].type === 'error') {
      expect(errorEvents[0].error.message).toBe('boom');
    }
  });
});

// ============================================================================
// stopReason wiring (agent_turn_complete / step_complete)
// ============================================================================

describe('AgentWidgetClient - stopReason propagation', () => {
  const dispatchModeStream = (stopReason?: string) => {
    const data: Record<string, unknown> = {
      type: 'step_complete',
      id: 'step_1',
      stepType: 'prompt',
      result: { response: 'Hello there.' },
    };
    if (stopReason) data.stopReason = stopReason;
    return [
      `data: ${JSON.stringify(data)}\n\n`,
      `data: ${JSON.stringify({ type: 'flow_complete', success: true })}\n\n`,
    ];
  };

  const collectFinalAssistant = (events: AgentWidgetEvent[]): AgentWidgetMessage | null => {
    const messageEvents = events.filter(e => e.type === 'message');
    for (let i = messageEvents.length - 1; i >= 0; i--) {
      const ev = messageEvents[i];
      if (ev.type === 'message' && ev.message.role === 'assistant' && !ev.message.streaming) {
        return ev.message;
      }
    }
    return null;
  };

  const runDispatch = async (chunks: string[]): Promise<AgentWidgetEvent[]> => {
    global.fetch = vi.fn().mockImplementation(async (_url: string, _options: any) => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        }
      });
      return { ok: true, body: stream };
    });
    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });
    const events: AgentWidgetEvent[] = [];
    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Hi', createdAt: new Date().toISOString() }] },
      (e) => events.push(e)
    );
    return events;
  };

  it.each(['end_turn', 'max_tool_calls', 'length', 'content_filter', 'error', 'unknown'] as const)(
    'attaches stopReason=%s from step_complete (dispatch / flow path)',
    async (stopReason) => {
      const events = await runDispatch(dispatchModeStream(stopReason));
      const final = collectFinalAssistant(events);
      expect(final).not.toBeNull();
      expect(final!.stopReason).toBe(stopReason);
    }
  );

  it('leaves stopReason undefined when step_complete omits it (backcompat)', async () => {
    const events = await runDispatch(dispatchModeStream(undefined));
    const final = collectFinalAssistant(events);
    expect(final).not.toBeNull();
    expect(final!.stopReason).toBeUndefined();
  });

  it('captures the empty-content + max_tool_calls regression case', async () => {
    // Symptom the upstream fix targets: model emits a tool call then gets cut
    // off before producing follow-up text. Persona must record stopReason so
    // the UI can render an affordance instead of an empty bubble.
    const events = await runDispatch([
      `data: ${JSON.stringify({
        type: 'step_complete',
        id: 'step_1',
        stepType: 'prompt',
        result: { response: '' },
        stopReason: 'max_tool_calls',
      })}\n\n`,
      `data: ${JSON.stringify({ type: 'flow_complete', success: true })}\n\n`,
    ]);
    const final = collectFinalAssistant(events);
    expect(final).not.toBeNull();
    expect(final!.content).toBe('');
    expect(final!.stopReason).toBe('max_tool_calls');
  });

  it('agent_turn_complete.stopReason overrides any earlier step_complete value (agent-loop path)', async () => {
    // Build an agent-mode stream that emits both events. agent_turn_complete
    // arrives last; its stopReason should win.
    const execId = 'exec_stopreason';
    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', {
        executionId: execId, agentId: 'virtual', agentName: 'Test',
        maxTurns: 1, startedAt: new Date().toISOString(), seq: 1,
      }),
      sseEvent('agent_iteration_start', {
        executionId: execId, iteration: 1, maxTurns: 1,
        startedAt: new Date().toISOString(), seq: 2,
      }),
      sseEvent('agent_turn_start', {
        executionId: execId, iteration: 1, turnIndex: 0,
        role: 'assistant', turnId: 'turn_1', seq: 3,
      }),
      sseEvent('agent_turn_delta', {
        executionId: execId, iteration: 1, delta: 'partial answer',
        contentType: 'text', turnId: 'turn_1', seq: 4,
      }),
      sseEvent('agent_turn_complete', {
        executionId: execId, iteration: 1, role: 'assistant',
        turnId: 'turn_1', completedAt: new Date().toISOString(),
        stopReason: 'max_tool_calls', seq: 5,
      }),
      sseEvent('agent_iteration_complete', {
        executionId: execId, iteration: 1, toolCallsMade: 0,
        stopConditionMet: true, completedAt: new Date().toISOString(), seq: 6,
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
    const events: AgentWidgetEvent[] = [];
    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Hi', createdAt: new Date().toISOString() }] },
      (e) => events.push(e)
    );

    const final = collectFinalAssistant(events);
    expect(final).not.toBeNull();
    expect(final!.stopReason).toBe('max_tool_calls');
    expect(final!.agentMetadata?.turnId).toBe('turn_1');
  });
});

// ============================================================================
// step_await (LOCAL tool pause) + resumeFlow
// ============================================================================

describe('AgentWidgetClient — step_await parsing', () => {
  const buildStepAwaitStream = (payload: Record<string, unknown>): ReadableStream<Uint8Array> => {
    const encoder = new TextEncoder();
    const body = `event: step_await\ndata: ${JSON.stringify({ type: 'step_await', ...payload })}\n\n`;
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    });
  };

  it('emits a complete tool message with awaitingLocalTool=true for local_tool_required', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: buildStepAwaitStream({
        awaitReason: 'local_tool_required',
        id: 'step-1',
        name: 'Test Step',
        stepType: 'prompt',
        index: 0,
        toolId: 'runtime_ask_user_question_123',
        toolName: 'ask_user_question',
        executionId: 'exec_abc',
        parameters: {
          questions: [{ question: 'Who?', options: [{ label: 'A' }, { label: 'B' }] }],
        },
      }),
    });

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });
    const events: AgentWidgetEvent[] = [];
    await client.dispatch(
      { messages: [{ id: 'u1', role: 'user', content: 'hi', createdAt: new Date().toISOString() }] },
      (e) => events.push(e)
    );

    const toolMsg = events
      .filter((e) => e.type === 'message')
      .map((e) => (e as { message: AgentWidgetMessage }).message)
      .find((m) => m.variant === 'tool' && m.toolCall?.name === 'ask_user_question');

    expect(toolMsg).toBeDefined();
    expect(toolMsg!.toolCall!.id).toBe('runtime_ask_user_question_123');
    expect(toolMsg!.toolCall!.status).toBe('complete');
    expect(toolMsg!.toolCall!.args).toMatchObject({
      questions: [{ question: 'Who?', options: [{ label: 'A' }, { label: 'B' }] }],
    });
    expect(toolMsg!.agentMetadata?.executionId).toBe('exec_abc');
    expect(toolMsg!.agentMetadata?.awaitingLocalTool).toBe(true);
  });

  it('ignores step_await events whose awaitReason is not local_tool_required', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: buildStepAwaitStream({
        awaitReason: 'approval_required',
        toolId: 't1',
        toolName: 'some_tool',
        executionId: 'exec_abc',
        parameters: {},
      }),
    });

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });
    const events: AgentWidgetEvent[] = [];
    await client.dispatch(
      { messages: [{ id: 'u1', role: 'user', content: 'hi', createdAt: new Date().toISOString() }] },
      (e) => events.push(e)
    );

    const toolMsg = events
      .filter((e) => e.type === 'message')
      .map((e) => (e as { message: AgentWidgetMessage }).message)
      .find((m) => m.agentMetadata?.awaitingLocalTool);
    expect(toolMsg).toBeUndefined();
  });
});

describe('AgentWidgetClient.resumeFlow', () => {
  it('POSTs to ${apiUrl}/resume with the expected body shape', async () => {
    let capturedUrl: string | undefined;
    let capturedBody: Record<string, unknown> | undefined;
    let capturedHeaders: Record<string, string> | undefined;
    global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body as string);
      capturedHeaders = init.headers as Record<string, string>;
      return { ok: true, body: null };
    });

    const client = new AgentWidgetClient({ apiUrl: 'https://api.runtype.com/v1/dispatch' });
    await client.resumeFlow('exec_xyz', { ["ask_user_question"]: 'Hobbyists' });

    expect(capturedUrl).toBe('https://api.runtype.com/v1/dispatch/resume');
    expect(capturedBody).toEqual({
      executionId: 'exec_xyz',
      toolOutputs: { ["ask_user_question"]: 'Hobbyists' },
      streamResponse: true,
    });
    expect(capturedHeaders!['Content-Type']).toBe('application/json');
  });

  it('honors a custom streamResponse option', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return { ok: true, body: null };
    });

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:43111/api/chat/dispatch' });
    await client.resumeFlow('exec_abc', { t: 'ok' }, { streamResponse: false });

    expect(capturedBody!.streamResponse).toBe(false);
  });

  it('derives the URL correctly for proxy-style dispatch paths', async () => {
    let capturedUrl: string | undefined;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return { ok: true, body: null };
    });

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:43111/api/chat/dispatch' });
    await client.resumeFlow('exec_abc', {});

    expect(capturedUrl).toBe('http://localhost:43111/api/chat/dispatch/resume');
  });
});

