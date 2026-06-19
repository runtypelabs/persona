import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentWidgetClient, preferFinalStructuredContent } from './client';
import { AgentWidgetEvent, AgentWidgetMessage } from './types';
import { createJsonStreamParser } from './utils/formatting';
import { VERSION } from './version';
import { createUnifiedEventWrite } from './utils/__fixtures__/unified-translator.oracle';

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

    // Route the legacy step_chunk fixtures through the oracle as the 4.0 wire
    // (step_chunk → step_delta → text_delta), exercising the structured
    // JSON parser on the wire flow path: incremental text extraction, never
    // showing raw JSON, with the assembled response reconciled at step_complete.
    global.fetch = createRawStreamFetch(
      legacyToWireFrames(
        sseEvents
          .filter((f) => f.startsWith('data:'))
          .map((f) => f.replace('"type":"step_chunk"', '"type":"step_delta"') + '\n\n')
      )
    );

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
 * Re-encode legacy `agent_*` / `flow_*` / `step_*` / `tool_*` SSE frames into the
 * Persona wire the 4.0 API now emits, using the same encoder the API uses
 * (the vendored `createUnifiedEventWrite` oracle). The 4.0 widget only consumes the
 * wire vocabulary, so these handler tests author the rendering intent in the
 * (more readable) legacy frames and inject exactly what the client sees off the
 * wire — the bridge translates it straight back before the dispatch chain renders.
 */
function legacyToWireFrames(legacyFrames: string[]): string[] {
  const out: string[] = [];
  const write = createUnifiedEventWrite((chunk) => out.push(chunk));
  for (const frame of legacyFrames) write(frame);
  return out;
}

/** Stream pre-built SSE frames verbatim (no re-encode) — for fixtures already in
 *  the wire vocabulary. */
function createRawStreamFetch(frames: string[]) {
  return vi.fn().mockImplementation(async (_url?: string, _options?: any) => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const frame of frames) controller.enqueue(encoder.encode(frame));
        controller.close();
      }
    });
    return { ok: true, body: stream };
  });
}

/**
 * Mock fetch that streams the given legacy events as the 4.0 wire.
 */
function createAgentStreamFetch(events: string[]) {
  return createRawStreamFetch(legacyToWireFrames(events));
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

describe('AgentWidgetClient - target routing', () => {
  const userMessage = (): AgentWidgetMessage[] => [
    { id: 'u1', role: 'user', content: 'hi', createdAt: '2025-01-01T00:00:00.000Z' },
  ];

  it('routes a Runtype agent TypeID target through agent mode', async () => {
    let captured: any = null;
    global.fetch = vi.fn().mockImplementation(async (_url: string, options: any) => {
      captured = JSON.parse(options.body);
      const encoder = new TextEncoder();
      return {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(sseEvent('agent_complete', {
              executionId: 'exec_1', agentId: 'agent_123', success: true, iterations: 1,
              completedAt: new Date().toISOString(), seq: 1,
            })));
            controller.close();
          },
        }),
      };
    });

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000', target: 'agent_123' });
    expect(client.isAgentMode()).toBe(true);
    await client.dispatch({ messages: userMessage() }, () => {});

    expect(captured.agent).toEqual({ agentId: 'agent_123' });
  });

  it('routes a Runtype flow TypeID target through flow dispatch', async () => {
    let captured: any = null;
    global.fetch = vi.fn().mockImplementation(async (_url: string, options: any) => {
      captured = JSON.parse(options.body);
      const encoder = new TextEncoder();
      return {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"type":"flow_complete","success":true}\n\n'));
            controller.close();
          },
        }),
      };
    });

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000', target: 'flow_123' });
    expect(client.isAgentMode()).toBe(false);
    await client.dispatch({ messages: userMessage() }, () => {});

    expect(captured.flowId).toBe('flow_123');
    expect(captured.agent).toBeUndefined();
  });

  it('spreads a custom provider target payload into the proxy dispatch body', async () => {
    let captured: any = null;
    global.fetch = vi.fn().mockImplementation(async (_url: string, options: any) => {
      captured = JSON.parse(options.body);
      const encoder = new TextEncoder();
      return {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"type":"flow_complete","success":true}\n\n'));
            controller.close();
          },
        }),
      };
    });

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      target: 'eve:support',
      targetProviders: { eve: (id) => ({ payload: { assistant: id } }) },
    });
    expect(client.isAgentMode()).toBe(false);
    await client.dispatch({ messages: userMessage() }, () => {});

    expect(captured.assistant).toBe('support');
    expect(Array.isArray(captured.messages)).toBe(true);
  });

  it('throws when target is combined with agentId', () => {
    expect(
      () => new AgentWidgetClient({ apiUrl: 'http://localhost:8000', target: 'agent_1', agentId: 'agent_2' }),
    ).toThrow(/mutually exclusive/i);
  });
});

describe('AgentWidgetClient - Agent Payload Building', () => {
  it('should build a saved agent-id payload from top-level agentId', async () => {
    let capturedPayload: any = null;
    global.fetch = vi.fn().mockImplementation(async (_url: string, options: any) => {
      capturedPayload = JSON.parse(options.body);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseEvent('agent_complete', {
            executionId: 'exec_1',
            agentId: 'agent_123',
            success: true,
            iterations: 1,
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
      agentId: 'agent_123',
    });

    await client.dispatch({
      messages: [{
        id: 'usr_1',
        role: 'user',
        content: 'Hello saved agent',
        createdAt: '2025-01-01T00:00:00.000Z',
      }],
    }, () => {});

    expect(capturedPayload).toBeDefined();
    expect(capturedPayload.agent).toEqual({ agentId: 'agent_123' });
    expect(capturedPayload.flowId).toBeUndefined();
    expect(capturedPayload.messages).toHaveLength(1);
    expect(capturedPayload.messages[0].content).toBe('Hello saved agent');
    expect(capturedPayload.options.streamResponse).toBe(true);
    expect(capturedPayload.options.recordMode).toBe('virtual');
  });

  it('uses top-level agentId as the client-token session target', async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      requests.push({ url, body: JSON.parse(options.body) });
      if (url.endsWith('/v1/client/init')) {
        return {
          ok: true,
          json: async () => ({
            sessionId: 'sess_agent',
            expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
            config: {},
          }),
        };
      }
      const encoder = new TextEncoder();
      return {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(sseEvent('agent_complete', {
              executionId: 'exec_1',
              agentId: 'agent_123',
              success: true,
              iterations: 1,
              completedAt: new Date().toISOString(),
              seq: 1,
            })));
            controller.close();
          },
        }),
      };
    });

    const client = new AgentWidgetClient({
      apiUrl: 'https://api.runtype.com',
      clientToken: 'ct_live_demo',
      agentId: 'agent_123',
    });

    await client.dispatch({
      messages: [{
        id: 'usr_1',
        role: 'user',
        content: 'Hello agent token',
        createdAt: '2025-01-01T00:00:00.000Z',
      }],
    }, () => {});

    expect(requests[0]).toMatchObject({
      url: 'https://api.runtype.com/v1/client/init',
      body: { token: 'ct_live_demo', flowId: 'agent_123' },
    });
    expect(requests[1]).toMatchObject({
      url: 'https://api.runtype.com/v1/client/chat',
      body: { sessionId: 'sess_agent' },
    });
  });

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

    // Reflection now folds into a loop-scoped reasoning bubble (wire spec):
    // `agent_reflection` → reasoning_start{scope:"loop"} + reasoning_complete{text}.
    const reflectionMessages = Array.from(messagesById.values())
      .filter(m => m.variant === 'reasoning' && m.reasoning?.scope === 'loop');
    expect(reflectionMessages.length).toBe(1);
    expect(reflectionMessages[0].reasoning?.chunks.join('')).toBe('I should try a different approach.');
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
// Wire event name support (chunk → delta, agent_tool_* → tool_* with agentContext)
// ============================================================================

// ============================================================================
// Text/Tool Interleaving via partId Segmentation
// ============================================================================

describe('AgentWidgetClient - partId Text/Tool Interleaving', () => {
  it('should split flow text segments at a tool boundary', async () => {
    const events: AgentWidgetEvent[] = [];

    global.fetch = createAgentStreamFetch([
      sseEvent('flow_start', { flowId: 'f1', flowName: 'Test', totalSteps: 1 }),
      sseEvent('step_start', { id: 's1', name: 'Prompt', stepType: 'prompt', index: 0, totalSteps: 1 }),
      sseEvent('text_start', { messageId: 'msg_s1' }),
      sseEvent('step_delta', { id: 's1', text: 'Let me search' }),
      sseEvent('step_delta', { id: 's1', text: ' for that!' }),
      sseEvent('text_end', { messageId: 'msg_s1' }),
      sseEvent('tool_start', { toolId: 'tc_1', name: 'search', toolType: 'mcp', startedAt: new Date().toISOString() }),
      sseEvent('tool_complete', { toolId: 'tc_1', name: 'search', result: { found: true }, success: true, completedAt: new Date().toISOString(), executionTime: 200 }),
      sseEvent('text_start', { messageId: 'msg_s1' }),
      sseEvent('step_delta', { id: 's1', text: 'Found it! Here' }),
      sseEvent('step_delta', { id: 's1', text: ' are the results.' }),
      sseEvent('text_end', { messageId: 'msg_s1' }),
      sseEvent('flow_complete', { success: true }),
    ]);

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

    global.fetch = createAgentStreamFetch([
      sseEvent('flow_start', { flowId: 'f1', flowName: 'Test', totalSteps: 1 }),
      sseEvent('text_start', { messageId: 'msg_s1' }),
      sseEvent('step_delta', { id: 's1', text: 'Preamble text.' }),
      sseEvent('text_end', { messageId: 'msg_s1' }),
      sseEvent('tool_start', { toolId: 'tc_1', name: 'get_weather', toolType: 'builtin', startedAt: new Date().toISOString() }),
      sseEvent('tool_complete', { toolId: 'tc_1', name: 'get_weather', result: { temp: 72 }, success: true, completedAt: new Date().toISOString(), executionTime: 100 }),
      sseEvent('text_start', { messageId: 'msg_s1' }),
      sseEvent('step_delta', { id: 's1', text: 'The weather is 72F.' }),
      sseEvent('text_end', { messageId: 'msg_s1' }),
      sseEvent('flow_complete', { success: true }),
    ]);

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

  it('should not emit a whitespace-only assistant bubble before a leading tool call', async () => {
    const events: AgentWidgetEvent[] = [];

    // Tool UI is the first meaningful output. Some providers still emit
    // newline-only text lifecycle events around the tool boundary; those must
    // not become an empty assistant message bubble.
    global.fetch = createAgentStreamFetch([
      sseEvent('flow_start', { flowId: 'f1', flowName: 'Test', totalSteps: 1 }),
      sseEvent('step_start', { id: 's1', name: 'Prompt', stepType: 'prompt', index: 1, totalSteps: 1 }),
      sseEvent('tool_start', { toolId: 'tc_1', name: 'add_to_cart', toolType: 'local' }),
      sseEvent('text_start', { messageId: 'msg_s1' }),
      sseEvent('step_delta', { id: 's1', text: '\n' }),
      sseEvent('text_end', { messageId: 'msg_s1' }),
      sseEvent('tool_complete', { toolId: 'tc_1', name: 'add_to_cart', success: true, completedAt: new Date().toISOString(), executionTime: 20 }),
      sseEvent('flow_complete', { success: true }),
    ]);

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });
    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Add to cart', createdAt: new Date().toISOString() }] },
      (event) => events.push(event)
    );

    const messageEvents = events.filter(e => e.type === 'message');
    const messagesById = new Map<string, AgentWidgetMessage>();
    for (const event of messageEvents) {
      if (event.type === 'message') messagesById.set(event.message.id, event.message);
    }

    const allMessages = Array.from(messagesById.values());
    const assistantTexts = allMessages.filter(m => m.role === 'assistant' && !m.variant);
    const toolMsgs = allMessages.filter(m => m.variant === 'tool');

    expect(assistantTexts).toHaveLength(0);
    expect(toolMsgs).toHaveLength(1);
    expect(toolMsgs[0].toolCall?.name).toBe('add_to_cart');
    expect(toolMsgs[0].toolCall?.status).toBe('complete');
  });

  it('should keep consecutive deltas in one bubble when there is no segment boundary', async () => {
    const events: AgentWidgetEvent[] = [];

    // No text_end / tool boundary between the two deltas → one text block → one bubble.
    global.fetch = createAgentStreamFetch([
      sseEvent('flow_start', { flowId: 'f1', flowName: 'Test', totalSteps: 1 }),
      sseEvent('step_delta', { id: 's1', text: 'Hello ' }),
      sseEvent('step_delta', { id: 's1', text: 'world' }),
      sseEvent('flow_complete', { success: true }),
    ]);

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

    global.fetch = createAgentStreamFetch([
      sseEvent('flow_start', { flowId: 'f1', flowName: 'Test', totalSteps: 1 }),
      // preamble segment
      sseEvent('text_start', { messageId: 'msg_s1' }),
      sseEvent('step_delta', { id: 's1', text: 'Searching...' }),
      sseEvent('text_end', { messageId: 'msg_s1' }),
      // tool 1
      sseEvent('tool_start', { toolId: 'tc_1', name: 'search', toolType: 'mcp' }),
      sseEvent('tool_complete', { toolId: 'tc_1', name: 'search', result: { id: 27 }, success: true, executionTime: 100 }),
      // between-tools segment
      sseEvent('text_start', { messageId: 'msg_s1' }),
      sseEvent('step_delta', { id: 's1', text: 'Adding to cart...' }),
      sseEvent('text_end', { messageId: 'msg_s1' }),
      // tool 2
      sseEvent('tool_start', { toolId: 'tc_2', name: 'add_to_cart', toolType: 'mcp' }),
      sseEvent('tool_complete', { toolId: 'tc_2', name: 'add_to_cart', result: { success: true }, success: true, executionTime: 50 }),
      // final segment
      sseEvent('text_start', { messageId: 'msg_s1' }),
      sseEvent('step_delta', { id: 's1', text: 'Done! Item added.' }),
      sseEvent('text_end', { messageId: 'msg_s1' }),
      sseEvent('flow_complete', { success: true }),
    ]);

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

    global.fetch = createAgentStreamFetch([
      sseEvent('flow_start', { flowId: 'f1', flowName: 'Test', totalSteps: 1 }),
      sseEvent('text_start', { messageId: 'msg_s1' }),
      sseEvent('step_delta', { id: 's1', text: 'Before tool.' }),
      sseEvent('text_end', { messageId: 'msg_s1' }),
      sseEvent('tool_start', { toolId: 'tc_1', name: 'lookup', toolType: 'mcp' }),
      sseEvent('tool_complete', { toolId: 'tc_1', name: 'lookup', result: {}, success: true, executionTime: 50 }),
      sseEvent('text_start', { messageId: 'msg_s1' }),
      sseEvent('step_delta', { id: 's1', text: 'After tool.' }),
      sseEvent('text_end', { messageId: 'msg_s1' }),
      sseEvent('flow_complete', { success: true }),
    ]);

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
    // Second message composes baseId + the wire text block id for traceability
    expect(assistantTexts[1].id).toBe('ast_pre_generated_id_text_2');
    // Content is correct per segment
    expect(assistantTexts[0].content).toBe('Before tool.');
    expect(assistantTexts[1].content).toBe('After tool.');
  });

  it('should not overwrite last segment content with the full step response (flow)', async () => {
    const events: AgentWidgetEvent[] = [];

    // Wire: two flow text segments split by a tool, each its own block
    // (sealed by text_end → text_complete). The step's full structured response
    // (`step_complete.result.response`) reconciles rawContent without clobbering
    // either sealed bubble's displayed content.
    global.fetch = createAgentStreamFetch([
      sseEvent('flow_start', { flowId: 'f1', flowName: 'Test', totalSteps: 1, executionId: 'exec_f1' }),
      sseEvent('step_start', { id: 's1', name: 'Prompt', stepType: 'prompt', index: 0, totalSteps: 1 }),
      sseEvent('text_start', { messageId: 'msg_s1' }),
      sseEvent('step_delta', { id: 's1', text: 'First part.' }),
      sseEvent('text_end', { messageId: 'msg_s1' }),
      sseEvent('tool_start', { toolId: 'tc_1', name: 'action', toolType: 'mcp', startedAt: new Date().toISOString() }),
      sseEvent('tool_complete', { toolId: 'tc_1', name: 'action', result: {}, success: true, completedAt: new Date().toISOString(), executionTime: 10 }),
      sseEvent('text_start', { messageId: 'msg_s1' }),
      sseEvent('step_delta', { id: 's1', text: 'Second part.' }),
      sseEvent('text_end', { messageId: 'msg_s1' }),
      sseEvent('step_complete', { id: 's1', name: 'Prompt', stepType: 'prompt', success: true, result: { response: 'First part.Second part.' }, executionTime: 500 }),
      sseEvent('flow_complete', { success: true }),
    ]);

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

    global.fetch = createAgentStreamFetch([
      sseEvent('flow_start', { flowId: 'f1', flowName: 'Test', totalSteps: 1 }),
      // Tools fire first (no text before them)
      sseEvent('tool_start', { toolId: 'tc_1', name: 'test_tool', toolType: 'custom', startedAt: new Date().toISOString() }),
      sseEvent('tool_complete', { toolId: 'tc_1', name: 'test_tool', success: true, completedAt: new Date().toISOString(), executionTime: 0 }),
      // Then text segment
      sseEvent('text_start', { messageId: 'msg_s1' }),
      sseEvent('step_delta', { id: 's1', text: 'Tool returned a result.' }),
      sseEvent('text_end', { messageId: 'msg_s1' }),
      // step_complete with full response (should NOT create a duplicate)
      sseEvent('step_complete', { id: 's1', name: 'Response', stepType: 'prompt', success: true, result: { response: 'Tool returned a result.' }, executionTime: 500 }),
      sseEvent('flow_complete', { success: true }),
    ]);

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

    // Wire (via the oracle): a single flow text block carrying partial
    // structured JSON, sealed by text_end, then the authoritative final structured
    // response on step_complete. Exercises the async structured-content parser +
    // sealed-segment reconciliation on the wire flow path.
    global.fetch = createAgentStreamFetch([
      sseEvent('flow_start', { flowId: 'f1', flowName: 'Test', totalSteps: 1 }),
      sseEvent('tool_start', { toolId: 'tc_1', name: 'test_tool', toolType: 'custom', startedAt: new Date().toISOString() }),
      sseEvent('tool_complete', { toolId: 'tc_1', name: 'test_tool', success: true, completedAt: new Date().toISOString(), executionTime: 0 }),
      sseEvent('text_start', { messageId: 'msg_s1' }),
      sseEvent('step_delta', { id: 's1', text: '{"text":"Tool returned a re' }),
      sseEvent('text_end', { messageId: 'msg_s1' }),
      sseEvent('step_complete', {
        id: 's1',
        name: 'Response',
        stepType: 'prompt',
        success: true,
        result: { response: opts.stepCompleteResponse },
        executionTime: 500
      }),
      sseEvent('flow_complete', { success: true }),
    ]);

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

describe('AgentWidgetClient - nested flow-as-tool (parentToolCallId)', () => {
  // PR #4602: a flow running as a tool enriches its streamed text/reasoning with
  // toolContext.toolId; the wire surfaces it as text_start/reasoning_start
  // .parentToolCallId, and the widget routes that block into the parent tool's row.
  it('routes nested flow text into the parent tool row, not the top-level assistant', async () => {
    const events: AgentWidgetEvent[] = [];
    global.fetch = createAgentStreamFetch([
      sseEvent('flow_start', { flowId: 'f1', flowName: 'Test', totalSteps: 1 }),
      // top-level parent text
      sseEvent('text_start', { messageId: 'msg_parent' }),
      sseEvent('step_delta', { id: 's1', text: 'Parent says hi.' }),
      sseEvent('text_end', { messageId: 'msg_parent' }),
      // a nested flow runs as a tool
      sseEvent('tool_start', { toolId: 'tool_nested_1', name: 'run_subflow', toolType: 'flow', startedAt: new Date().toISOString() }),
      // nested flow text, enriched with toolContext.toolId
      sseEvent('text_start', { messageId: 'msg_nested', toolContext: { toolId: 'tool_nested_1' } }),
      sseEvent('step_delta', { id: 's2', text: 'Nested result.', toolContext: { toolId: 'tool_nested_1' } }),
      sseEvent('text_end', { messageId: 'msg_nested', toolContext: { toolId: 'tool_nested_1' } }),
      sseEvent('tool_complete', { toolId: 'tool_nested_1', name: 'run_subflow', success: true, executionTime: 100 }),
      sseEvent('flow_complete', { success: true }),
    ]);

    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });
    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Go', createdAt: new Date().toISOString() }] },
      (e) => events.push(e)
    );

    const byId = new Map<string, AgentWidgetMessage>();
    for (const ev of events) if (ev.type === 'message') byId.set(ev.message.id, ev.message);
    const all = Array.from(byId.values());
    const assistantTexts = all.filter((m) => m.role === 'assistant' && !m.variant);
    const tools = all.filter((m) => m.variant === 'tool');

    const topLevel = assistantTexts.find((m) => !m.agentMetadata?.parentToolId);
    const nested = assistantTexts.find((m) => m.agentMetadata?.parentToolId === 'tool_nested_1');

    expect(topLevel?.content).toBe('Parent says hi.');
    expect(nested).toBeDefined();
    expect(nested?.content).toBe('Nested result.');
    expect(nested?.streaming).toBe(false);
    expect(tools.some((t) => t.toolCall?.name === 'run_subflow')).toBe(true);
  });

  it('does not tag top-level flow text with a parentToolId', async () => {
    const events: AgentWidgetEvent[] = [];
    global.fetch = createAgentStreamFetch([
      sseEvent('flow_start', { flowId: 'f1', flowName: 'Test', totalSteps: 1 }),
      sseEvent('text_start', { messageId: 'msg_1' }),
      sseEvent('step_delta', { id: 's1', text: 'Just top-level.' }),
      sseEvent('text_end', { messageId: 'msg_1' }),
      sseEvent('flow_complete', { success: true }),
    ]);
    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });
    await client.dispatch(
      { messages: [{ id: 'u', role: 'user', content: 'Hi', createdAt: new Date().toISOString() }] },
      (e) => events.push(e)
    );
    const byId = new Map<string, AgentWidgetMessage>();
    for (const ev of events) if (ev.type === 'message') byId.set(ev.message.id, ev.message);
    const texts = Array.from(byId.values()).filter((m) => m.role === 'assistant' && !m.variant);
    expect(texts.length).toBe(1);
    expect(texts[0].content).toBe('Just top-level.');
    expect(texts[0].agentMetadata?.parentToolId).toBeUndefined();
  });

  it('routes nested flow reasoning into the parent tool row', async () => {
    const events: AgentWidgetEvent[] = [];
    global.fetch = createAgentStreamFetch([
      sseEvent('flow_start', { flowId: 'f1', flowName: 'Test', totalSteps: 1 }),
      sseEvent('tool_start', { toolId: 'tool_nested_2', name: 'run_subflow', toolType: 'flow', startedAt: new Date().toISOString() }),
      sseEvent('reason_start', { toolContext: { toolId: 'tool_nested_2' } }),
      sseEvent('reason_delta', { reasoningText: 'thinking nested', toolContext: { toolId: 'tool_nested_2' } }),
      sseEvent('reason_complete', { toolContext: { toolId: 'tool_nested_2' } }),
      sseEvent('tool_complete', { toolId: 'tool_nested_2', name: 'run_subflow', success: true, executionTime: 50 }),
      sseEvent('flow_complete', { success: true }),
    ]);
    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });
    await client.dispatch(
      { messages: [{ id: 'u', role: 'user', content: 'Hi', createdAt: new Date().toISOString() }] },
      (e) => events.push(e)
    );
    const byId = new Map<string, AgentWidgetMessage>();
    for (const ev of events) if (ev.type === 'message') byId.set(ev.message.id, ev.message);
    const reasoning = Array.from(byId.values()).filter((m) => m.variant === 'reasoning');
    const nested = reasoning.find((m) => m.agentMetadata?.parentToolId === 'tool_nested_2');
    expect(nested).toBeDefined();
    expect(nested?.reasoning?.chunks.join('')).toBe('thinking nested');
    expect(nested?.streaming).toBe(false);
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
// Within-turn text/tool interleaving: assistant text bubbles must seal at
// each agent_tool_start so the chronological text→tool→text→tool sequence
// renders as distinct timeline entries instead of one merged bubble that
// appears below all the tool cards.
// ============================================================================

describe('AgentWidgetClient - agent_turn text/tool interleaving', () => {
  const collectMessages = (events: AgentWidgetEvent[]): AgentWidgetMessage[] => {
    const byId = new Map<string, AgentWidgetMessage>();
    const order: string[] = [];
    for (const e of events) {
      if (e.type !== 'message') continue;
      if (!byId.has(e.message.id)) order.push(e.message.id);
      byId.set(e.message.id, e.message);
    }
    return order.map((id) => byId.get(id)!);
  };

  it('seals the assistant text bubble at each agent_tool_start so subsequent text creates a new bubble', async () => {
    const execId = 'exec_interleave';
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
        executionId: execId, iteration: 1, delta: 'before tool 1',
        contentType: 'text', turnId: 'turn_1', seq: 4,
      }),
      sseEvent('agent_tool_start', {
        executionId: execId, iteration: 1,
        toolCallId: 'call_1', toolName: 'search', toolType: 'builtin', seq: 5,
      }),
      sseEvent('agent_tool_complete', {
        executionId: execId, iteration: 1,
        toolCallId: 'call_1', toolName: 'search', success: true,
        executionTime: 10, seq: 6,
      }),
      sseEvent('agent_turn_delta', {
        executionId: execId, iteration: 1, delta: 'between tools',
        contentType: 'text', turnId: 'turn_1', seq: 7,
      }),
      sseEvent('agent_tool_start', {
        executionId: execId, iteration: 1,
        toolCallId: 'call_2', toolName: 'fetch', toolType: 'builtin', seq: 8,
      }),
      sseEvent('agent_tool_complete', {
        executionId: execId, iteration: 1,
        toolCallId: 'call_2', toolName: 'fetch', success: true,
        executionTime: 10, seq: 9,
      }),
      sseEvent('agent_turn_delta', {
        executionId: execId, iteration: 1, delta: 'after tool 2',
        contentType: 'text', turnId: 'turn_1', seq: 10,
      }),
      sseEvent('agent_turn_complete', {
        executionId: execId, iteration: 1, role: 'assistant',
        turnId: 'turn_1', completedAt: new Date().toISOString(),
        stopReason: 'end_turn', seq: 11,
      }),
      sseEvent('agent_iteration_complete', {
        executionId: execId, iteration: 1, toolCallsMade: 2,
        stopConditionMet: true, completedAt: new Date().toISOString(), seq: 12,
      }),
      sseEvent('agent_complete', {
        executionId: execId, agentId: 'virtual', success: true,
        iterations: 1, stopReason: 'complete',
        completedAt: new Date().toISOString(), seq: 13,
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

    const messages = collectMessages(events);
    const assistants = messages.filter((m) => m.role === 'assistant' && m.variant !== 'tool');
    const tools = messages.filter((m) => m.variant === 'tool');

    expect(assistants.map((m) => m.content)).toEqual([
      'before tool 1',
      'between tools',
      'after tool 2',
    ]);
    expect(tools.map((m) => m.toolCall?.name)).toEqual(['search', 'fetch']);
    expect(new Set(assistants.map((m) => m.id)).size).toBe(3);
  });

  it('attaches agent_turn_complete.stopReason to the final assistant text segment when the turn ends with text', async () => {
    const execId = 'exec_stopreason_tail_text';
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
        executionId: execId, iteration: 1, delta: 'first segment',
        contentType: 'text', turnId: 'turn_1', seq: 4,
      }),
      sseEvent('agent_tool_start', {
        executionId: execId, iteration: 1,
        toolCallId: 'call_1', toolName: 'search', toolType: 'builtin', seq: 5,
      }),
      sseEvent('agent_tool_complete', {
        executionId: execId, iteration: 1,
        toolCallId: 'call_1', toolName: 'search', success: true,
        executionTime: 10, seq: 6,
      }),
      sseEvent('agent_turn_delta', {
        executionId: execId, iteration: 1, delta: 'final segment',
        contentType: 'text', turnId: 'turn_1', seq: 7,
      }),
      sseEvent('agent_turn_complete', {
        executionId: execId, iteration: 1, role: 'assistant',
        turnId: 'turn_1', completedAt: new Date().toISOString(),
        stopReason: 'length', seq: 8,
      }),
      sseEvent('agent_iteration_complete', {
        executionId: execId, iteration: 1, toolCallsMade: 1,
        stopConditionMet: true, completedAt: new Date().toISOString(), seq: 9,
      }),
      sseEvent('agent_complete', {
        executionId: execId, agentId: 'virtual', success: true,
        iterations: 1, stopReason: 'complete',
        completedAt: new Date().toISOString(), seq: 10,
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

    const assistants = collectMessages(events).filter(
      (m) => m.role === 'assistant' && m.variant !== 'tool'
    );
    expect(assistants).toHaveLength(2);
    expect(assistants[0].content).toBe('first segment');
    expect(assistants[0].stopReason).toBeUndefined();
    expect(assistants[1].content).toBe('final segment');
    expect(assistants[1].stopReason).toBe('length');
  });

  it('attaches agent_turn_complete.stopReason to the preceding text segment when the turn ends with a tool call', async () => {
    const execId = 'exec_stopreason_tail_tool';
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
        executionId: execId, iteration: 1, delta: 'about to call tool',
        contentType: 'text', turnId: 'turn_1', seq: 4,
      }),
      sseEvent('agent_tool_start', {
        executionId: execId, iteration: 1,
        toolCallId: 'call_1', toolName: 'search', toolType: 'builtin', seq: 5,
      }),
      sseEvent('agent_tool_complete', {
        executionId: execId, iteration: 1,
        toolCallId: 'call_1', toolName: 'search', success: true,
        executionTime: 10, seq: 6,
      }),
      sseEvent('agent_turn_complete', {
        executionId: execId, iteration: 1, role: 'assistant',
        turnId: 'turn_1', completedAt: new Date().toISOString(),
        stopReason: 'max_tool_calls', seq: 7,
      }),
      sseEvent('agent_iteration_complete', {
        executionId: execId, iteration: 1, toolCallsMade: 1,
        stopConditionMet: true, completedAt: new Date().toISOString(), seq: 8,
      }),
      sseEvent('agent_complete', {
        executionId: execId, agentId: 'virtual', success: true,
        iterations: 1, stopReason: 'max_tool_calls',
        completedAt: new Date().toISOString(), seq: 9,
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

    const assistants = collectMessages(events).filter(
      (m) => m.role === 'assistant' && m.variant !== 'tool'
    );
    expect(assistants).toHaveLength(1);
    expect(assistants[0].content).toBe('about to call tool');
    expect(assistants[0].stopReason).toBe('max_tool_calls');
  });
});

// ============================================================================
// step_await (LOCAL tool pause) + resumeFlow
// ============================================================================

describe('AgentWidgetClient: step_await parsing', () => {
  // Wire collapses the legacy flow `step_await` (a `local_tool_required` pause)
  // into the neutral `await` event the native handler consumes.
  const buildAwaitStream = (payload: Record<string, unknown>): ReadableStream<Uint8Array> => {
    const encoder = new TextEncoder();
    const body = `event: await\ndata: ${JSON.stringify({ type: 'await', ...payload })}\n\n`;
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    });
  };
  // Legacy raw `step_await` frame — still exercised by the approval-reason guard
  // below until Phase C removes the legacy approval branch from the handler.
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
      body: buildAwaitStream({
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

  it('emits a running tool message for WebMCP local_tool_required until the browser tool resolves', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: buildAwaitStream({
        awaitReason: 'local_tool_required',
        id: 'step-1',
        name: 'Test Step',
        stepType: 'prompt',
        index: 0,
        toolCallId: 'tc_webmcp_1',
        toolName: 'webmcp:get_product_by_url',
        executionId: 'exec_abc',
        startedAt: 1234,
        parameters: { path: '/jade/' },
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
      .find((m) => m.variant === 'tool' && m.toolCall?.name === 'webmcp:get_product_by_url');

    expect(toolMsg).toBeDefined();
    expect(toolMsg!.toolCall!.id).toBe('tc_webmcp_1');
    expect(toolMsg!.toolCall!.status).toBe('running');
    expect(toolMsg!.toolCall!.startedAt).toBe(1234);
    expect(toolMsg!.toolCall!.completedAt).toBeUndefined();
    expect(toolMsg!.toolCall!.durationMs).toBeUndefined();
    expect(toolMsg!.toolCall!.args).toEqual({ path: '/jade/' });
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

// ============================================================================
// agent_await (AGENT-dispatch LOCAL tool pause) — resolves through the same
// path as step_await; carries a bare tool name + origin instead of a webmcp:
// prefix + awaitReason.
// ============================================================================

describe('AgentWidgetClient: agent_await parsing', () => {
  // Wire collapses the legacy `step_await`/`agent_await` pair into one `await`
  // event; the dispatch origin survives as the `origin` field on the payload.
  const buildAgentAwaitStream = (payload: Record<string, unknown>): ReadableStream<Uint8Array> => {
    const encoder = new TextEncoder();
    const body = `event: await\ndata: ${JSON.stringify({ type: 'await', ...payload })}\n\n`;
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    });
  };

  it('normalizes a WebMCP agent_await (origin "webmcp") to a running webmcp: tool message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: buildAgentAwaitStream({
        executionId: 'exec_abc',
        toolId: 'runtime_get_product_by_url_1',
        toolCallId: 'tc_webmcp_1',
        toolName: 'get_product_by_url',
        origin: 'webmcp',
        awaitedAt: 1234,
        parameters: { path: '/jade/' },
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
      .find((m) => m.variant === 'tool' && m.toolCall?.name === 'webmcp:get_product_by_url');

    expect(toolMsg).toBeDefined();
    // bare wire name is normalized to the webmcp: prefix
    expect(toolMsg!.toolCall!.name).toBe('webmcp:get_product_by_url');
    expect(toolMsg!.toolCall!.id).toBe('tc_webmcp_1');
    expect(toolMsg!.toolCall!.status).toBe('running');
    expect(toolMsg!.toolCall!.startedAt).toBe(1234);
    expect(toolMsg!.toolCall!.completedAt).toBeUndefined();
    expect(toolMsg!.toolCall!.args).toEqual({ path: '/jade/' });
    expect(toolMsg!.agentMetadata?.executionId).toBe('exec_abc');
    expect(toolMsg!.agentMetadata?.awaitingLocalTool).toBe(true);
    expect(toolMsg!.agentMetadata?.webMcpToolCallId).toBe('tc_webmcp_1');
  });

  it('emits a complete tool message for a non-WebMCP agent_await (origin "sdk")', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: buildAgentAwaitStream({
        executionId: 'exec_abc',
        toolId: 'runtime_ask_user_question_123',
        toolName: 'ask_user_question',
        origin: 'sdk',
        awaitedAt: 1234,
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
    // sdk-origin local tool keeps its bare name (no webmcp: prefix)
    expect(toolMsg!.toolCall!.name).toBe('ask_user_question');
    expect(toolMsg!.toolCall!.status).toBe('complete');
    expect(toolMsg!.agentMetadata?.executionId).toBe('exec_abc');
    expect(toolMsg!.agentMetadata?.awaitingLocalTool).toBe(true);
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

  it('routes to /v1/client/resume with sessionId in client-token mode (core#3889)', async () => {
    let capturedUrl: string | undefined;
    let capturedBody: Record<string, unknown> | undefined;
    let capturedHeaders: Record<string, string> | undefined;
    global.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body as string);
      capturedHeaders = init.headers as Record<string, string>;
      return { ok: true, body: null };
    });

    const client = new AgentWidgetClient({
      clientToken: 'ct_live_demo',
      apiUrl: 'https://api.runtype.com',
    });
    // Simulate an initialized client session (resumeFlow reads sessionId off it).
    (client as unknown as { clientSession: { sessionId: string; expiresAt: Date } }).clientSession = {
      sessionId: 'cs_123',
      expiresAt: new Date(Date.now() + 60_000),
    };

    await client.resumeFlow('exec_xyz', { toolu_A: { ok: true } });

    // Session-authed sibling of /v1/client/chat: no Bearer key, sessionId in body.
    expect(capturedUrl).toBe('https://api.runtype.com/v1/client/resume');
    expect(capturedBody).toEqual({
      executionId: 'exec_xyz',
      toolOutputs: { toolu_A: { ok: true } },
      streamResponse: true,
      sessionId: 'cs_123',
    });
    expect(capturedHeaders!['Authorization']).toBeUndefined();
  });

  it('strips a trailing /v1/dispatch from apiUrl when building the client resume URL', async () => {
    let capturedUrl: string | undefined;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return { ok: true, body: null };
    });

    const client = new AgentWidgetClient({
      clientToken: 'ct_live_demo',
      apiUrl: 'https://api.runtype.com/v1/dispatch',
    });
    // A live session so initSession() short-circuits instead of fetching /init.
    (client as unknown as { clientSession: { sessionId: string; expiresAt: Date } }).clientSession = {
      sessionId: 'cs_123',
      expiresAt: new Date(Date.now() + 60_000),
    };
    await client.resumeFlow('exec_abc', {});

    expect(capturedUrl).toBe('https://api.runtype.com/v1/client/resume');
  });

  it('refreshes the session via initSession() before resuming when stale (BugBot r3367875360)', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return { ok: true, body: null };
    });

    const client = new AgentWidgetClient({
      clientToken: 'ct_live_demo',
      apiUrl: 'https://api.runtype.com',
    });
    // A stale session that has already expired: a long WebMCP approval wait can
    // outlive it, so resumeFlow must not trust this.clientSession directly.
    (client as unknown as { clientSession: { sessionId: string; expiresAt: Date } }).clientSession = {
      sessionId: 'cs_stale',
      expiresAt: new Date(Date.now() - 60_000),
    };
    // initSession() is the single source of truth for a live session (it returns
    // the existing one while unexpired, else re-inits). Assert resumeFlow awaits
    // it and sends the refreshed sessionId, not the stale one.
    const initSpy = vi
      .spyOn(client, 'initSession')
      .mockResolvedValue({ sessionId: 'cs_fresh', expiresAt: new Date(Date.now() + 60_000) } as never);

    await client.resumeFlow('exec_xyz', { toolu_A: { ok: true } });

    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(capturedBody!.sessionId).toBe('cs_fresh');
    expect(capturedBody!.sessionId).not.toBe('cs_stale');
  });
});

// ============================================================================
// agent_media Event Handling
// ============================================================================

describe('AgentWidgetClient - agent_media events', () => {
  const collectMediaMessages = (events: AgentWidgetEvent[]): AgentWidgetMessage[] => {
    const byId = new Map<string, AgentWidgetMessage>();
    for (const event of events) {
      if (event.type === 'message' && event.message.id.startsWith('agent-media-')) {
        byId.set(event.message.id, event.message);
      }
    }
    return Array.from(byId.values());
  };

  it('renders a base64 image (AI SDK v6 type:"media") as a synthetic message', async () => {
    const execId = 'exec_media_image';
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
        executionId: execId, iteration: 1, toolCallId: 'tc_shot',
        toolName: 'browser:screenshot', startedAt: new Date().toISOString(), seq: 3,
      }),
      sseEvent('agent_tool_complete', {
        executionId: execId, iteration: 1, toolCallId: 'tc_shot',
        toolName: 'browser:screenshot', completedAt: new Date().toISOString(), seq: 4,
      }),
      sseEvent('agent_media', {
        executionId: execId, iteration: 1, toolCallId: 'tc_shot',
        toolName: 'browser:screenshot',
        media: [
          { type: 'media', data: 'iVBORw==', mediaType: 'image/png' },
        ],
        seq: 5,
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
    const events: AgentWidgetEvent[] = [];
    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Snap', createdAt: new Date().toISOString() }] },
      (e) => events.push(e)
    );

    const mediaMessages = collectMediaMessages(events);
    expect(mediaMessages).toHaveLength(1);
    const msg = mediaMessages[0]!;
    expect(msg.id).toMatch(/^agent-media-tc_shot-\d+$/);
    expect(msg.role).toBe('assistant');
    expect(msg.streaming).toBe(false);
    expect(msg.contentParts).toBeDefined();
    expect(msg.contentParts).toHaveLength(1);
    const part = msg.contentParts![0];
    expect(part.type).toBe('image');
    if (part.type === 'image') {
      expect(part.image).toBe('data:image/png;base64,iVBORw==');
      expect(part.mimeType).toBe('image/png');
    }
    expect(msg.agentMetadata?.executionId).toBe(execId);
    expect(msg.agentMetadata?.iteration).toBe(1);
  });

  it('renders a hosted image (AI SDK v3/v4 type:"image-url") as a synthetic message', async () => {
    const execId = 'exec_media_url';
    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', { executionId: execId, agentId: 'virtual', agentName: 'Test', maxTurns: 1, startedAt: new Date().toISOString(), seq: 1 }),
      sseEvent('agent_iteration_start', { executionId: execId, iteration: 1, maxTurns: 1, startedAt: new Date().toISOString(), seq: 2 }),
      sseEvent('agent_media', {
        executionId: execId, iteration: 1, toolCallId: 'tc_dalle', toolName: 'dalle',
        media: [{ type: 'image-url', url: 'https://r2.example.com/img.png' }],
        seq: 3,
      }),
      sseEvent('agent_complete', { executionId: execId, agentId: 'virtual', success: true, iterations: 1, stopReason: 'max_iterations', completedAt: new Date().toISOString(), seq: 4 }),
    ]);

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: { name: 'Test', model: 'openai:gpt-4o-mini', systemPrompt: 'test' },
    });
    const events: AgentWidgetEvent[] = [];
    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Generate', createdAt: new Date().toISOString() }] },
      (e) => events.push(e)
    );

    const mediaMessages = collectMediaMessages(events);
    expect(mediaMessages).toHaveLength(1);
    const part = mediaMessages[0]!.contentParts![0];
    expect(part.type).toBe('image');
    if (part.type === 'image') {
      expect(part.image).toBe('https://r2.example.com/img.png');
      expect(part.mimeType).toBeUndefined();
    }
  });

  it('preserves mediaType on image-url parts when provided', async () => {
    const execId = 'exec_media_url_typed';
    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', { executionId: execId, agentId: 'virtual', agentName: 'Test', maxTurns: 1, startedAt: new Date().toISOString(), seq: 1 }),
      sseEvent('agent_iteration_start', { executionId: execId, iteration: 1, maxTurns: 1, startedAt: new Date().toISOString(), seq: 2 }),
      sseEvent('agent_media', {
        executionId: execId, iteration: 1, toolCallId: 'tc_dalle', toolName: 'dalle',
        media: [{ type: 'image-url', url: 'https://r2.example.com/img.png', mediaType: 'image/png' }],
        seq: 3,
      }),
      sseEvent('agent_complete', { executionId: execId, agentId: 'virtual', success: true, iterations: 1, stopReason: 'max_iterations', completedAt: new Date().toISOString(), seq: 4 }),
    ]);

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: { name: 'Test', model: 'openai:gpt-4o-mini', systemPrompt: 'test' },
    });
    const events: AgentWidgetEvent[] = [];
    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Generate', createdAt: new Date().toISOString() }] },
      (e) => events.push(e)
    );

    const part = collectMediaMessages(events)[0]!.contentParts![0];
    expect(part.type).toBe('image');
    if (part.type === 'image') {
      expect(part.image).toBe('https://r2.example.com/img.png');
      expect(part.mimeType).toBe('image/png');
    }
  });

  it('renders a base64 audio part with mediaType', async () => {
    const execId = 'exec_media_audio';
    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', { executionId: execId, agentId: 'virtual', agentName: 'Test', maxTurns: 1, startedAt: new Date().toISOString(), seq: 1 }),
      sseEvent('agent_iteration_start', { executionId: execId, iteration: 1, maxTurns: 1, startedAt: new Date().toISOString(), seq: 2 }),
      sseEvent('agent_media', {
        executionId: execId, iteration: 1, toolCallId: 'tc_tts', toolName: 'elevenlabs-tts',
        media: [{ type: 'media', data: 'AAAA', mediaType: 'audio/mpeg' }],
        seq: 3,
      }),
      sseEvent('agent_complete', { executionId: execId, agentId: 'virtual', success: true, iterations: 1, stopReason: 'max_iterations', completedAt: new Date().toISOString(), seq: 4 }),
    ]);

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: { name: 'Test', model: 'openai:gpt-4o-mini', systemPrompt: 'test' },
    });
    const events: AgentWidgetEvent[] = [];
    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Speak', createdAt: new Date().toISOString() }] },
      (e) => events.push(e)
    );

    const mediaMessages = collectMediaMessages(events);
    expect(mediaMessages).toHaveLength(1);
    const part = mediaMessages[0]!.contentParts![0];
    expect(part.type).toBe('audio');
    if (part.type === 'audio') {
      expect(part.audio).toBe('data:audio/mpeg;base64,AAAA');
      expect(part.mimeType).toBe('audio/mpeg');
    }
  });

  it('routes file-url parts by mediaType (audio/video/file)', async () => {
    const execId = 'exec_media_file_url';
    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', { executionId: execId, agentId: 'virtual', agentName: 'Test', maxTurns: 1, startedAt: new Date().toISOString(), seq: 1 }),
      sseEvent('agent_iteration_start', { executionId: execId, iteration: 1, maxTurns: 1, startedAt: new Date().toISOString(), seq: 2 }),
      sseEvent('agent_media', {
        executionId: execId, iteration: 1, toolCallId: 'tc_files', toolName: 'multi',
        media: [
          { type: 'file-url', url: 'https://example.com/a.mp3', mediaType: 'audio/mpeg' },
          { type: 'file-url', url: 'https://example.com/v.mp4', mediaType: 'video/mp4' },
          { type: 'file-url', url: 'https://example.com/r.pdf', mediaType: 'application/pdf' },
        ],
        seq: 3,
      }),
      sseEvent('agent_complete', { executionId: execId, agentId: 'virtual', success: true, iterations: 1, stopReason: 'max_iterations', completedAt: new Date().toISOString(), seq: 4 }),
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

    // Wire streams each media item as its own block (media_start/complete),
    // so each renders as its own synthetic message with a single content part.
    const mediaMessages = collectMediaMessages(events);
    expect(mediaMessages).toHaveLength(3);
    const parts = mediaMessages.map((m) => m.contentParts![0]);
    expect(parts[0].type).toBe('audio');
    expect(parts[1].type).toBe('video');
    expect(parts[2].type).toBe('file');
    if (parts[0].type === 'audio') expect(parts[0].audio).toBe('https://example.com/a.mp3');
    if (parts[1].type === 'video') expect(parts[1].video).toBe('https://example.com/v.mp4');
    if (parts[2].type === 'file') {
      expect(parts[2].data).toBe('https://example.com/r.pdf');
      expect(parts[2].mimeType).toBe('application/pdf');
      expect(parts[2].filename).toBe('attachment.pdf');
    }
  });

  it('renders each mixed media part as its own synthetic message', async () => {
    const execId = 'exec_media_mixed';
    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', { executionId: execId, agentId: 'virtual', agentName: 'Test', maxTurns: 1, startedAt: new Date().toISOString(), seq: 1 }),
      sseEvent('agent_iteration_start', { executionId: execId, iteration: 1, maxTurns: 1, startedAt: new Date().toISOString(), seq: 2 }),
      sseEvent('agent_media', {
        executionId: execId, iteration: 1, toolCallId: 'tc_mix', toolName: 'multi',
        media: [
          { type: 'media', data: 'IMG', mediaType: 'image/png' },
          { type: 'image-url', url: 'https://example.com/dalle.png' },
          { type: 'media', data: 'FILE', mediaType: 'application/pdf' },
        ],
        seq: 3,
      }),
      sseEvent('agent_complete', { executionId: execId, agentId: 'virtual', success: true, iterations: 1, stopReason: 'max_iterations', completedAt: new Date().toISOString(), seq: 4 }),
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

    const mediaMessages = collectMediaMessages(events);
    expect(mediaMessages).toHaveLength(3);
    const parts = mediaMessages.map((m) => m.contentParts![0]);
    expect(parts[0].type).toBe('image');
    expect(parts[1].type).toBe('image');
    expect(parts[2].type).toBe('file');
    if (parts[2].type === 'file') {
      expect(parts[2].data).toBe('data:application/pdf;base64,FILE');
      expect(parts[2].filename).toBe('attachment.pdf');
    }
  });

  it('inserts media between tool bubble and the next text turn', async () => {
    const execId = 'exec_media_order';
    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', { executionId: execId, agentId: 'virtual', agentName: 'Test', maxTurns: 1, startedAt: new Date().toISOString(), seq: 1 }),
      sseEvent('agent_iteration_start', { executionId: execId, iteration: 1, maxTurns: 1, startedAt: new Date().toISOString(), seq: 2 }),
      sseEvent('agent_turn_start', { executionId: execId, iteration: 1, turnIndex: 0, role: 'assistant', turnId: 'turn_1', seq: 3 }),
      sseEvent('agent_turn_delta', { executionId: execId, iteration: 1, delta: 'Calling tool...', contentType: 'text', turnId: 'turn_1', seq: 4 }),
      sseEvent('agent_tool_start', { executionId: execId, iteration: 1, toolCallId: 'tc_1', toolName: 'browser:screenshot', startedAt: new Date().toISOString(), seq: 5 }),
      sseEvent('agent_tool_complete', { executionId: execId, iteration: 1, toolCallId: 'tc_1', toolName: 'browser:screenshot', completedAt: new Date().toISOString(), seq: 6 }),
      sseEvent('agent_media', {
        executionId: execId, iteration: 1, toolCallId: 'tc_1', toolName: 'browser:screenshot',
        media: [{ type: 'media', data: 'PNG', mediaType: 'image/png' }],
        seq: 7,
      }),
      sseEvent('agent_turn_start', { executionId: execId, iteration: 1, turnIndex: 1, role: 'assistant', turnId: 'turn_2', seq: 8 }),
      sseEvent('agent_turn_delta', { executionId: execId, iteration: 1, delta: 'Done!', contentType: 'text', turnId: 'turn_2', seq: 9 }),
      sseEvent('agent_complete', { executionId: execId, agentId: 'virtual', success: true, iterations: 1, stopReason: 'max_iterations', completedAt: new Date().toISOString(), seq: 10 }),
    ]);

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: { name: 'Test', model: 'openai:gpt-4o-mini', systemPrompt: 'test' },
    });
    const events: AgentWidgetEvent[] = [];
    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Take a snap', createdAt: new Date().toISOString() }] },
      (e) => events.push(e)
    );

    // Collect the most-recent state of every emitted message by id.
    const latest = new Map<string, AgentWidgetMessage>();
    for (const e of events) {
      if (e.type === 'message') latest.set(e.message.id, e.message);
    }
    const ordered = Array.from(latest.values()).sort(
      (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)
    );

    // Find the media bubble plus the assistant text bubble that came AFTER it
    const mediaMsg = ordered.find((m) => m.id.startsWith('agent-media-tc_1-'));
    expect(mediaMsg).toBeDefined();
    const followingText = ordered.find(
      (m) =>
        m.role === 'assistant' &&
        !m.variant &&
        !m.id.startsWith('agent-media-') &&
        (m.sequence ?? 0) > (mediaMsg!.sequence ?? 0)
    );
    expect(followingText).toBeDefined();
    expect(followingText!.content).toBe('Done!');
  });

  it('skips malformed media parts that have neither data nor url', async () => {
    const execId = 'exec_media_empty';
    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', { executionId: execId, agentId: 'virtual', agentName: 'Test', maxTurns: 1, startedAt: new Date().toISOString(), seq: 1 }),
      sseEvent('agent_iteration_start', { executionId: execId, iteration: 1, maxTurns: 1, startedAt: new Date().toISOString(), seq: 2 }),
      sseEvent('agent_media', {
        executionId: execId, iteration: 1, toolCallId: 'tc_x', toolName: 'noop',
        media: [
          { type: 'media', mediaType: 'image/png' },         // missing data
          { type: 'image-url' },                              // missing url
          { type: 'unknown-shape', payload: 'whatever' },     // unknown discriminator
        ],
        seq: 3,
      }),
      sseEvent('agent_complete', { executionId: execId, agentId: 'virtual', success: true, iterations: 1, stopReason: 'max_iterations', completedAt: new Date().toISOString(), seq: 4 }),
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

    expect(collectMediaMessages(events)).toHaveLength(0);
  });

  it('produces unique ids for repeated agent_media events on the same toolCallId', async () => {
    const execId = 'exec_media_repeat';
    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', { executionId: execId, agentId: 'virtual', agentName: 'Test', maxTurns: 1, startedAt: new Date().toISOString(), seq: 1 }),
      sseEvent('agent_iteration_start', { executionId: execId, iteration: 1, maxTurns: 1, startedAt: new Date().toISOString(), seq: 2 }),
      sseEvent('agent_media', {
        executionId: execId, iteration: 1, toolCallId: 'tc_repeat', toolName: 'multi',
        media: [{ type: 'media', data: 'A', mediaType: 'image/png' }],
        seq: 3,
      }),
      sseEvent('agent_media', {
        executionId: execId, iteration: 1, toolCallId: 'tc_repeat', toolName: 'multi',
        media: [{ type: 'media', data: 'B', mediaType: 'image/png' }],
        seq: 4,
      }),
      sseEvent('agent_complete', { executionId: execId, agentId: 'virtual', success: true, iterations: 1, stopReason: 'max_iterations', completedAt: new Date().toISOString(), seq: 5 }),
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

    const mediaMessages = collectMediaMessages(events);
    expect(mediaMessages).toHaveLength(2);
    expect(mediaMessages[0]!.id).not.toBe(mediaMessages[1]!.id);
    // Both messages should preserve the toolCallId in the id for traceability
    for (const m of mediaMessages) {
      expect(m.id).toMatch(/^agent-media-tc_repeat-\d+$/);
    }
    // First message keeps its first content part; not overwritten by the second
    const first = mediaMessages.find((m) => {
      const p = m.contentParts?.[0];
      return p?.type === 'image' && p.image === 'data:image/png;base64,A';
    });
    expect(first).toBeDefined();
  });

  it('seals an in-flight assistant text bubble before splitting on agent_media', async () => {
    const execId = 'exec_media_seal';
    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', { executionId: execId, agentId: 'virtual', agentName: 'Test', maxTurns: 1, startedAt: new Date().toISOString(), seq: 1 }),
      sseEvent('agent_iteration_start', { executionId: execId, iteration: 1, maxTurns: 1, startedAt: new Date().toISOString(), seq: 2 }),
      sseEvent('agent_turn_start', { executionId: execId, iteration: 1, turnIndex: 0, role: 'assistant', turnId: 'turn_1', seq: 3 }),
      sseEvent('agent_turn_delta', { executionId: execId, iteration: 1, delta: 'Streaming...', contentType: 'text', turnId: 'turn_1', seq: 4 }),
      // Media arrives mid-stream: earlier text bubble is still streaming.
      sseEvent('agent_media', {
        executionId: execId, iteration: 1, toolCallId: 'tc_seal', toolName: 'shot',
        media: [{ type: 'media', data: 'PNG', mediaType: 'image/png' }],
        seq: 5,
      }),
      sseEvent('agent_complete', { executionId: execId, agentId: 'virtual', success: true, iterations: 1, stopReason: 'max_iterations', completedAt: new Date().toISOString(), seq: 6 }),
    ]);

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: { name: 'Test', model: 'openai:gpt-4o-mini', systemPrompt: 'test' },
    });
    const events: AgentWidgetEvent[] = [];
    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Go', createdAt: new Date().toISOString() }] },
      (e) => events.push(e)
    );

    const latest = new Map<string, AgentWidgetMessage>();
    for (const e of events) {
      if (e.type === 'message') latest.set(e.message.id, e.message);
    }

    // The pre-media assistant bubble must be sealed (no orphan typing indicator).
    const orphan = Array.from(latest.values()).find(
      (m) =>
        m.role === 'assistant' &&
        !m.variant &&
        !m.id.startsWith('agent-media-') &&
        m.content === 'Streaming...'
    );
    expect(orphan).toBeDefined();
    expect(orphan!.streaming).toBe(false);
  });

  it('routes audio parts case-insensitively (RFC 7231)', async () => {
    const execId = 'exec_media_case';
    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', { executionId: execId, agentId: 'virtual', agentName: 'Test', maxTurns: 1, startedAt: new Date().toISOString(), seq: 1 }),
      sseEvent('agent_iteration_start', { executionId: execId, iteration: 1, maxTurns: 1, startedAt: new Date().toISOString(), seq: 2 }),
      sseEvent('agent_media', {
        executionId: execId, iteration: 1, toolCallId: 'tc_case', toolName: 'tts',
        // Non-canonical casing should still land in the audio bucket, not the file bucket.
        media: [{ type: 'media', data: 'AAAA', mediaType: 'Audio/MPEG' }],
        seq: 3,
      }),
      sseEvent('agent_complete', { executionId: execId, agentId: 'virtual', success: true, iterations: 1, stopReason: 'max_iterations', completedAt: new Date().toISOString(), seq: 4 }),
    ]);

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: { name: 'Test', model: 'openai:gpt-4o-mini', systemPrompt: 'test' },
    });
    const events: AgentWidgetEvent[] = [];
    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Speak', createdAt: new Date().toISOString() }] },
      (e) => events.push(e)
    );

    const part = collectMediaMessages(events)[0]!.contentParts![0];
    expect(part.type).toBe('audio');
    if (part.type === 'audio') {
      // mediaType is canonicalized to lowercase for both routing and storage.
      expect(part.mimeType).toBe('audio/mpeg');
      expect(part.audio).toBe('data:audio/mpeg;base64,AAAA');
    }
  });

  it('renders a base64 text/csv attachment as a file part (not silently dropped)', async () => {
    const execId = 'exec_media_csv';
    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', { executionId: execId, agentId: 'virtual', agentName: 'Test', maxTurns: 1, startedAt: new Date().toISOString(), seq: 1 }),
      sseEvent('agent_iteration_start', { executionId: execId, iteration: 1, maxTurns: 1, startedAt: new Date().toISOString(), seq: 2 }),
      sseEvent('agent_media', {
        executionId: execId, iteration: 1, toolCallId: 'tc_csv', toolName: 'export',
        media: [{ type: 'media', data: 'YSxiCjEsMg==', mediaType: 'text/csv' }],
        seq: 3,
      }),
      sseEvent('agent_complete', { executionId: execId, agentId: 'virtual', success: true, iterations: 1, stopReason: 'max_iterations', completedAt: new Date().toISOString(), seq: 4 }),
    ]);

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: { name: 'Test', model: 'openai:gpt-4o-mini', systemPrompt: 'test' },
    });
    const events: AgentWidgetEvent[] = [];
    await client.dispatch(
      { messages: [{ id: 'usr_1', role: 'user', content: 'Export', createdAt: new Date().toISOString() }] },
      (e) => events.push(e)
    );

    const part = collectMediaMessages(events)[0]!.contentParts![0];
    expect(part.type).toBe('file');
    if (part.type === 'file') {
      expect(part.mimeType).toBe('text/csv');
      expect(part.filename).toBe('attachment.csv');
      expect(part.data).toBe('data:text/csv;base64,YSxiCjEsMg==');
    }
  });

  it('defaults missing mediaType on a type:"media" part to application/octet-stream', async () => {
    const execId = 'exec_media_no_type';
    global.fetch = createAgentStreamFetch([
      sseEvent('agent_start', { executionId: execId, agentId: 'virtual', agentName: 'Test', maxTurns: 1, startedAt: new Date().toISOString(), seq: 1 }),
      sseEvent('agent_iteration_start', { executionId: execId, iteration: 1, maxTurns: 1, startedAt: new Date().toISOString(), seq: 2 }),
      sseEvent('agent_media', {
        executionId: execId, iteration: 1, toolCallId: 'tc_blob', toolName: 'opaque',
        // mediaType is empty: should not produce a malformed `data:;base64,...` URI.
        media: [{ type: 'media', data: 'AAAA', mediaType: '' }],
        seq: 3,
      }),
      sseEvent('agent_complete', { executionId: execId, agentId: 'virtual', success: true, iterations: 1, stopReason: 'max_iterations', completedAt: new Date().toISOString(), seq: 4 }),
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

    const part = collectMediaMessages(events)[0]!.contentParts![0];
    expect(part.type).toBe('file');
    if (part.type === 'file') {
      expect(part.mimeType).toBe('application/octet-stream');
      expect(part.data).toBe('data:application/octet-stream;base64,AAAA');
    }
  });
});

describe('AgentWidgetClient - requestMiddleware preserves clientTools', () => {
  it('preserves clientTools when middleware returns a payload that omits it', async () => {
    // Iter-10 MED: naive middleware that rebuilds the payload by listing
    // only the fields it cares about used to drop the WebMCP clientTools
    // snapshot. Preserve them as a fallback when the middleware-returned
    // object doesn't mention clientTools at all.
    let capturedBody: string | null = null;
    global.fetch = vi.fn().mockImplementation(async (_url: string, options: { body: string }) => {
      capturedBody = options.body;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
          controller.close();
        },
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
    });
    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      requestMiddleware: ({ payload }) => ({
        // Naive middleware: rebuild without acknowledging clientTools.
        messages: payload.messages,
      }),
    });
    // Force a populated clientTools snapshot by stubbing the bridge spot.
    (client as unknown as { webMcpBridge: { snapshotForDispatch: () => unknown[] } | null })
      .webMcpBridge = {
        snapshotForDispatch: () => [
          { name: 'search', description: 's', origin: 'webmcp' },
        ],
      };
    await client.dispatch(
      { messages: [{ id: 'u1', role: 'user', content: 'hi', createdAt: new Date().toISOString() }] },
      () => undefined,
    );
    expect(capturedBody).not.toBeNull();
    const parsed = JSON.parse(capturedBody!);
    expect(parsed.clientTools).toEqual([
      { name: 'search', description: 's', origin: 'webmcp' },
    ]);
  });

  it("respects middleware that explicitly sets clientTools (even to undefined)", async () => {
    // The fallback only triggers when `clientTools` is entirely absent from
    // the middleware result. An integrator who sets `clientTools: undefined`
    // explicitly is opting out and must be respected.
    let capturedBody: string | null = null;
    global.fetch = vi.fn().mockImplementation(async (_url: string, options: { body: string }) => {
      capturedBody = options.body;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
          controller.close();
        },
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
    });
    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      requestMiddleware: ({ payload }) => ({
        messages: payload.messages,
        clientTools: undefined,
      }),
    });
    (client as unknown as { webMcpBridge: { snapshotForDispatch: () => unknown[] } | null })
      .webMcpBridge = {
        snapshotForDispatch: () => [{ name: 'search', description: 's', origin: 'webmcp' }],
      };
    await client.dispatch(
      { messages: [{ id: 'u1', role: 'user', content: 'hi', createdAt: new Date().toISOString() }] },
      () => undefined,
    );
    const parsed = JSON.parse(capturedBody!);
    expect(parsed.clientTools).toBeUndefined();
  });
});


// ============================================================================
// Diff-only / send-once WebMCP clientTools (client-token mode)
// ============================================================================

describe('AgentWidgetClient - diff-only clientTools (client-token)', () => {
  const TOOLS = [
    { name: 'add_to_cart', description: 'Add to cart', origin: 'webmcp' as const },
  ];

  function sse(): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
        c.close();
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
  }

  // A client-token client with a live session (so initSession short-circuits)
  // and a stubbed bridge returning `tools`.
  function makeClient(tools: unknown[]) {
    const client = new AgentWidgetClient({
      clientToken: 'ct_live_demo',
      apiUrl: 'https://api.runtype.com',
    });
    (client as unknown as { clientSession: { sessionId: string; expiresAt: Date } }).clientSession = {
      sessionId: 'cs_diff_1',
      expiresAt: new Date(Date.now() + 600_000),
    };
    (client as unknown as { webMcpBridge: { snapshotForDispatch: () => unknown[] } | null }).webMcpBridge = {
      snapshotForDispatch: () => tools,
    };
    return client;
  }

  const userMsg = (content = 'hi') => ({
    messages: [{ id: 'u1', role: 'user' as const, content, createdAt: new Date().toISOString() }],
    assistantMessageId: 'a1',
  });

  let chatBodies: Array<Record<string, unknown>>;
  beforeEach(() => {
    chatBodies = [];
  });

  function captureSseFetch() {
    return vi.fn().mockImplementation(async (url: string, init: { body: string }) => {
      if (url.includes('/client/chat')) chatBodies.push(JSON.parse(init.body));
      return sse();
    });
  }

  it('first turn sends the full tool list AND a fingerprint', async () => {
    global.fetch = captureSseFetch();
    const client = makeClient(TOOLS);

    await client.dispatch(userMsg(), () => undefined);

    expect(chatBodies).toHaveLength(1);
    expect(chatBodies[0]!.clientTools).toEqual(TOOLS);
    expect(typeof chatBodies[0]!.clientToolsFingerprint).toBe('string');
  });

  it('an unchanged second turn sends fingerprint-only (no clientTools array)', async () => {
    global.fetch = captureSseFetch();
    const client = makeClient(TOOLS);

    await client.dispatch(userMsg('one'), () => undefined);
    await client.dispatch(userMsg('two'), () => undefined);

    expect(chatBodies).toHaveLength(2);
    expect(chatBodies[1]!.clientTools).toBeUndefined();
    expect(chatBodies[1]!.clientToolsFingerprint).toBe(chatBodies[0]!.clientToolsFingerprint);
  });

  it('a changed tool set resends the full list with a new fingerprint', async () => {
    global.fetch = captureSseFetch();
    // Mutable stub so the second turn snapshots a different set.
    const live = [...TOOLS];
    const client = new AgentWidgetClient({
      clientToken: 'ct_live_demo',
      apiUrl: 'https://api.runtype.com',
    });
    (client as unknown as { clientSession: { sessionId: string; expiresAt: Date } }).clientSession = {
      sessionId: 'cs_diff_1',
      expiresAt: new Date(Date.now() + 600_000),
    };
    (client as unknown as { webMcpBridge: { snapshotForDispatch: () => unknown[] } | null }).webMcpBridge = {
      snapshotForDispatch: () => live,
    };

    await client.dispatch(userMsg('one'), () => undefined);
    live.push({ name: 'checkout', description: 'Checkout', origin: 'webmcp' });
    await client.dispatch(userMsg('two'), () => undefined);

    expect(chatBodies).toHaveLength(2);
    expect(chatBodies[1]!.clientTools).toEqual(live);
    expect(chatBodies[1]!.clientToolsFingerprint).not.toBe(chatBodies[0]!.clientToolsFingerprint);
  });

  it('order-independent: reordering the same tools stays fingerprint-only', async () => {
    global.fetch = captureSseFetch();
    const live = [
      { name: 'a', description: 'A', origin: 'webmcp' as const },
      { name: 'b', description: 'B', origin: 'webmcp' as const },
    ];
    const client = new AgentWidgetClient({
      clientToken: 'ct_live_demo',
      apiUrl: 'https://api.runtype.com',
    });
    (client as unknown as { clientSession: { sessionId: string; expiresAt: Date } }).clientSession = {
      sessionId: 'cs_diff_1',
      expiresAt: new Date(Date.now() + 600_000),
    };
    let current = live;
    (client as unknown as { webMcpBridge: { snapshotForDispatch: () => unknown[] } | null }).webMcpBridge = {
      snapshotForDispatch: () => current,
    };

    await client.dispatch(userMsg('one'), () => undefined);
    current = [live[1]!, live[0]!]; // same set, reordered
    await client.dispatch(userMsg('two'), () => undefined);

    expect(chatBodies[1]!.clientTools).toBeUndefined();
  });

  it('a 409 client_tools_resend_required triggers exactly one retry with the full list', async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string, init: { body: string }) => {
      if (!url.includes('/client/chat')) return sse();
      call += 1;
      chatBodies.push(JSON.parse(init.body));
      if (call === 1) {
        return new Response(JSON.stringify({ error: 'client_tools_resend_required' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return sse();
    });
    const client = makeClient(TOOLS);
    // Pre-seed the cache so the first attempt would be fingerprint-only: the
    // server then forces a resend.
    (client as unknown as { lastSentClientToolsFingerprint: string | null; clientToolsFingerprintSessionId: string | null }).lastSentClientToolsFingerprint =
      'stale';
    (client as unknown as { clientToolsFingerprintSessionId: string | null }).clientToolsFingerprintSessionId =
      'cs_diff_1';

    await client.dispatch(userMsg(), () => undefined);

    expect(chatBodies).toHaveLength(2);
    // Retry carried the full list...
    expect(chatBodies[1]!.clientTools).toEqual(TOOLS);
    // ...with the SAME messages + assistantMessageId (no double user message).
    expect(chatBodies[1]!.messages).toEqual(chatBodies[0]!.messages);
    expect(chatBodies[1]!.assistantMessageId).toBe(chatBodies[0]!.assistantMessageId);
  });

  it('clearMessages-style reset (resetClientToolsFingerprint) forces a full resend next turn', async () => {
    global.fetch = captureSseFetch();
    const client = makeClient(TOOLS);

    await client.dispatch(userMsg('one'), () => undefined);
    client.resetClientToolsFingerprint();
    await client.dispatch(userMsg('two'), () => undefined);

    expect(chatBodies[1]!.clientTools).toEqual(TOOLS); // not fingerprint-only
  });

  it('does not commit the cache on a network failure (next turn resends full)', async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string, init: { body: string }) => {
      if (!url.includes('/client/chat')) return sse();
      call += 1;
      chatBodies.push(JSON.parse(init.body));
      if (call === 1) throw new Error('network down');
      return sse();
    });
    const client = makeClient(TOOLS);

    await client.dispatch(userMsg('one'), () => undefined).catch(() => undefined);
    await client.dispatch(userMsg('two'), () => undefined);

    // Second turn still sends the full list because the first never committed.
    expect(chatBodies[1]!.clientTools).toEqual(TOOLS);
  });

  it('minting a fresh session via initSession() resets the fingerprint cache', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/client/init')) {
        return new Response(
          JSON.stringify({
            sessionId: 'cs_freshly_minted',
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
            flow: { id: 'flow_x', name: 'F', description: null },
            config: { welcomeMessage: null, placeholder: 'p', theme: null },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return sse();
    });
    const client = new AgentWidgetClient({
      clientToken: 'ct_live_demo',
      apiUrl: 'https://api.runtype.com',
    });
    // Pre-seed a stale fingerprint bound to a prior session (no live session, so
    // initSession() takes the mint path and fetches /client/init).
    const internals = client as unknown as {
      lastSentClientToolsFingerprint: string | null;
      clientToolsFingerprintSessionId: string | null;
    };
    internals.lastSentClientToolsFingerprint = 'stale-fp';
    internals.clientToolsFingerprintSessionId = 'cs_old';

    await client.initSession();

    expect(internals.lastSentClientToolsFingerprint).toBeNull();
    expect(internals.clientToolsFingerprintSessionId).toBeNull();
  });
});

describe('AgentWidgetClient - non-client-token paths always send full clientTools', () => {
  function sse(): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
        c.close();
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
  }

  it('proxy mode sends full clientTools and no fingerprint on every turn', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return sse();
    });
    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });
    (client as unknown as { webMcpBridge: { snapshotForDispatch: () => unknown[] } | null }).webMcpBridge = {
      snapshotForDispatch: () => [{ name: 'search', description: 's', origin: 'webmcp' }],
    };

    const msg = () => ({
      messages: [{ id: 'u1', role: 'user' as const, content: 'hi', createdAt: new Date().toISOString() }],
    });
    await client.dispatch(msg(), () => undefined);
    await client.dispatch(msg(), () => undefined);

    expect(bodies).toHaveLength(2);
    for (const b of bodies) {
      expect(b.clientTools).toEqual([{ name: 'search', description: 's', origin: 'webmcp' }]);
      expect(b.clientToolsFingerprint).toBeUndefined();
    }
  });
});

describe('AgentWidgetClient - Feedback request builder', () => {
  const INIT_RESPONSE = {
    sessionId: 'sess_123',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    flow: {},
    config: { welcomeMessage: 'hi', placeholder: 'type…', theme: {} },
  };

  function mockInitAndFeedback() {
    const feedbackBodies: Array<Record<string, unknown>> = [];
    global.fetch = vi.fn().mockImplementation(async (url: string, options: { body: string }) => {
      if (typeof url === 'string' && url.endsWith('/v1/client/feedback')) {
        feedbackBodies.push(JSON.parse(options.body));
        return { ok: true, status: 200, json: async () => ({}) };
      }
      // init request
      return { ok: true, status: 200, json: async () => INIT_RESPONSE };
    });
    return feedbackBodies;
  }

  it('includes the client token in the feedback request body', async () => {
    const feedbackBodies = mockInitAndFeedback();
    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      clientToken: 'ct_live_abc123',
    });
    await client.initSession();

    await client.sendFeedback({ sessionId: 'sess_123', messageId: 'm1', type: 'upvote' });

    expect(feedbackBodies).toHaveLength(1);
    expect(feedbackBodies[0]).toEqual({
      sessionId: 'sess_123',
      messageId: 'm1',
      type: 'upvote',
      token: 'ct_live_abc123',
    });
  });

  it('sends the token on csat/nps submissions too', async () => {
    const feedbackBodies = mockInitAndFeedback();
    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      clientToken: 'ct_live_xyz789',
    });
    await client.initSession();

    await client.sendFeedback({ sessionId: 'sess_123', type: 'csat', rating: 5 });

    expect(feedbackBodies[0].token).toBe('ct_live_xyz789');
    expect(feedbackBodies[0].rating).toBe(5);
  });
});

describe('AgentWidgetClient - version header', () => {
  function captureHeaders() {
    const headers: Array<Record<string, string>> = [];
    global.fetch = vi.fn().mockImplementation(async (_url: string, options: { headers: Record<string, string> }) => {
      headers.push(options.headers);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(encoder.encode('data: {"type":"flow_complete","success":true}\n\n'));
          c.close();
        },
      });
      return { ok: true, body: stream };
    });
    return headers;
  }

  const msg = () => ({
    messages: [{ id: 'u1', role: 'user' as const, content: 'hi', createdAt: '2025-01-01T00:00:00.000Z' }],
  });

  it('broadcasts X-Persona-Version on the dispatch request', async () => {
    const headers = captureHeaders();
    const client = new AgentWidgetClient({ apiUrl: 'http://localhost:8000' });

    await client.dispatch(msg(), () => undefined);

    expect(headers[0]['X-Persona-Version']).toBe(VERSION);
  });

  it('lets an explicit config header override the version', async () => {
    const headers = captureHeaders();
    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      headers: { 'X-Persona-Version': 'override' },
    });

    await client.dispatch(msg(), () => undefined);

    expect(headers[0]['X-Persona-Version']).toBe('override');
  });
});

describe('AgentWidgetClient - Wire event vocabulary (default in 4.0)', () => {
  const sampleTextStream = (execId: string) => [
    sseEvent('execution_start', { kind: 'agent', executionId: execId, agentId: 'virtual', agentName: 'Test', maxTurns: 1, startedAt: new Date().toISOString(), seq: 1 }),
    sseEvent('turn_start', { executionId: execId, id: 'turn_1', iteration: 1, role: 'assistant', seq: 2 }),
    sseEvent('text_start', { executionId: execId, id: 'text_1', role: 'assistant', seq: 3 }),
    sseEvent('text_delta', { executionId: execId, id: 'text_1', delta: 'Hello', seq: 4 }),
    sseEvent('text_delta', { executionId: execId, id: 'text_1', delta: ' World', seq: 5 }),
    sseEvent('text_complete', { executionId: execId, id: 'text_1', seq: 6 }),
    sseEvent('turn_complete', { executionId: execId, id: 'turn_1', iteration: 1, role: 'assistant', completedAt: new Date().toISOString(), seq: 7 }),
    sseEvent('execution_complete', { kind: 'agent', executionId: execId, success: true, completedAt: new Date().toISOString(), seq: 8 }),
  ];

  it('does not append an events param to the dispatch URL (the wire is the only format)', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(c) {
          for (const e of sampleTextStream('exec_u')) c.enqueue(encoder.encode(e));
          c.close();
        },
      });
      return { ok: true, body: stream };
    });

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: { name: 'Test', model: 'openai:gpt-4o-mini', systemPrompt: 'test' },
    });
    await client.dispatch(
      { messages: [{ id: 'u1', role: 'user', content: 'Hi', createdAt: new Date().toISOString() }] },
      () => {}
    );
    expect(capturedUrl).not.toContain('events=');
  });

  it('renders a wire stream through the internal handlers with no config flag', async () => {
    const events: AgentWidgetEvent[] = [];
    const execId = 'exec_u1';
    global.fetch = createRawStreamFetch(sampleTextStream(execId));

    const client = new AgentWidgetClient({
      apiUrl: 'http://localhost:8000',
      agent: { name: 'Test', model: 'openai:gpt-4o-mini', systemPrompt: 'test' },
    });
    await client.dispatch(
      { messages: [{ id: 'u1', role: 'user', content: 'Hi', createdAt: new Date().toISOString() }] },
      (e) => events.push(e)
    );

    const messageEvents = events.filter((e) => e.type === 'message');
    expect(messageEvents.length).toBeGreaterThan(0);
    const last = messageEvents[messageEvents.length - 1];
    expect(last.type).toBe('message');
    if (last.type === 'message') {
      expect(last.message.content).toBe('Hello World');
      expect(last.message.streaming).toBe(false);
      expect(last.message.role).toBe('assistant');
      expect(last.message.agentMetadata?.executionId).toBe(execId);
    }
  });
});
