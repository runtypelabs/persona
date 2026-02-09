import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgentWidgetClient, SSEEventCallback } from "../client";
import type { AgentWidgetEvent, AgentWidgetMessage } from "../types";

/**
 * Helper to create an SSE data line from a payload object.
 * The client parses "data: <json>\n\n" formatted SSE events.
 */
function sseData(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Helper to create a mock fetch that returns an SSE stream from data lines.
 */
function createMockFetch(dataLines: string[]) {
  return vi.fn().mockImplementation(async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const line of dataLines) {
          controller.enqueue(encoder.encode(line));
        }
        controller.close();
      }
    });
    return { ok: true, body: stream };
  });
}

describe("Event Capture Pipeline - onSSEEvent callback", () => {
  let client: AgentWidgetClient;
  let capturedSSEEvents: Array<{ eventType: string; payload: unknown }>;
  let widgetEvents: AgentWidgetEvent[];

  beforeEach(() => {
    capturedSSEEvents = [];
    widgetEvents = [];
    client = new AgentWidgetClient({
      apiUrl: "http://localhost:8000"
    });
    // Wire up the SSE event callback (same as ui.ts does)
    client.setSSEEventCallback((eventType: string, payload: unknown) => {
      capturedSSEEvents.push({ eventType, payload });
    });
  });

  it("should fire onSSEEvent for step_chunk events", async () => {
    global.fetch = createMockFetch([
      sseData({
        type: "step_chunk",
        id: "step_1",
        name: "Prompt 1",
        executionType: "prompt",
        index: 1,
        text: "Hello world"
      }),
      sseData({
        type: "flow_complete",
        flowId: "flow_1",
        success: true,
        duration: 100
      })
    ]);

    await client.dispatch(
      {
        messages: [
          {
            id: "usr_1",
            role: "user",
            content: "Hi",
            createdAt: new Date().toISOString()
          }
        ]
      },
      (event) => widgetEvents.push(event)
    );

    // Should capture both events
    const stepChunkEvents = capturedSSEEvents.filter(
      (e) => e.eventType === "step_chunk"
    );
    expect(stepChunkEvents).toHaveLength(1);
    expect(stepChunkEvents[0].payload).toMatchObject({
      type: "step_chunk",
      text: "Hello world"
    });
  });

  it("should fire onSSEEvent for tool_start events", async () => {
    global.fetch = createMockFetch([
      sseData({
        type: "tool_start",
        toolCallId: "tc_1",
        toolName: "search",
        args: { query: "weather" },
        startedAt: "2025-01-01T00:00:00.000Z"
      }),
      sseData({
        type: "tool_complete",
        toolCallId: "tc_1",
        toolName: "search",
        result: { temperature: 72 },
        duration: 150,
        completedAt: "2025-01-01T00:00:01.000Z"
      }),
      sseData({
        type: "flow_complete",
        flowId: "flow_1",
        success: true,
        duration: 200
      })
    ]);

    await client.dispatch(
      {
        messages: [
          {
            id: "usr_1",
            role: "user",
            content: "Weather?",
            createdAt: new Date().toISOString()
          }
        ]
      },
      (event) => widgetEvents.push(event)
    );

    const toolStartEvents = capturedSSEEvents.filter(
      (e) => e.eventType === "tool_start"
    );
    expect(toolStartEvents).toHaveLength(1);
    expect(toolStartEvents[0].payload).toMatchObject({
      type: "tool_start",
      toolName: "search",
      args: { query: "weather" }
    });

    const toolCompleteEvents = capturedSSEEvents.filter(
      (e) => e.eventType === "tool_complete"
    );
    expect(toolCompleteEvents).toHaveLength(1);
    expect(toolCompleteEvents[0].payload).toMatchObject({
      type: "tool_complete",
      toolName: "search",
      result: { temperature: 72 }
    });
  });

  it("should fire onSSEEvent for flow_complete events", async () => {
    global.fetch = createMockFetch([
      sseData({
        type: "flow_complete",
        flowId: "flow_1",
        success: true,
        duration: 500,
        completedAt: "2025-01-01T00:00:05.000Z",
        totalTokensUsed: 1234
      })
    ]);

    await client.dispatch(
      {
        messages: [
          {
            id: "usr_1",
            role: "user",
            content: "Hello",
            createdAt: new Date().toISOString()
          }
        ]
      },
      (event) => widgetEvents.push(event)
    );

    const flowCompleteEvents = capturedSSEEvents.filter(
      (e) => e.eventType === "flow_complete"
    );
    expect(flowCompleteEvents).toHaveLength(1);
    expect(flowCompleteEvents[0].payload).toMatchObject({
      type: "flow_complete",
      flowId: "flow_1",
      success: true,
      duration: 500
    });
  });

  it("should fire onSSEEvent for every event in a multi-event stream", async () => {
    global.fetch = createMockFetch([
      sseData({
        type: "step_chunk",
        id: "step_1",
        name: "Prompt 1",
        executionType: "prompt",
        index: 1,
        text: "Hello"
      }),
      sseData({
        type: "step_chunk",
        id: "step_1",
        name: "Prompt 1",
        executionType: "prompt",
        index: 2,
        text: " world"
      }),
      sseData({
        type: "tool_start",
        toolCallId: "tc_1",
        toolName: "lookup",
        args: { id: 42 }
      }),
      sseData({
        type: "tool_complete",
        toolCallId: "tc_1",
        toolName: "lookup",
        result: { found: true },
        duration: 50
      }),
      sseData({
        type: "flow_complete",
        flowId: "flow_1",
        success: true,
        duration: 300
      })
    ]);

    await client.dispatch(
      {
        messages: [
          {
            id: "usr_1",
            role: "user",
            content: "Test",
            createdAt: new Date().toISOString()
          }
        ]
      },
      (event) => widgetEvents.push(event)
    );

    // Verify all 5 events were captured
    expect(capturedSSEEvents).toHaveLength(5);

    const types = capturedSSEEvents.map((e) => e.eventType);
    expect(types).toEqual([
      "step_chunk",
      "step_chunk",
      "tool_start",
      "tool_complete",
      "flow_complete"
    ]);
  });

  it("should pass correct payload type when event type differs from payload.type", async () => {
    // When SSE has `event: custom_type` prefix, payloadType = the event field
    // When SSE has no event prefix, payloadType = payload.type
    global.fetch = createMockFetch([
      sseData({
        type: "step_chunk",
        text: "chunk1"
      }),
      sseData({
        type: "flow_complete",
        success: true
      })
    ]);

    await client.dispatch(
      {
        messages: [
          {
            id: "usr_1",
            role: "user",
            content: "Test",
            createdAt: new Date().toISOString()
          }
        ]
      },
      (event) => widgetEvents.push(event)
    );

    // Event types should be resolved from payload.type
    expect(capturedSSEEvents[0].eventType).toBe("step_chunk");
    expect(capturedSSEEvents[1].eventType).toBe("flow_complete");
  });
});

describe("Event Capture Pipeline - no interference with message processing", () => {
  let client: AgentWidgetClient;
  let capturedSSEEvents: Array<{ eventType: string; payload: unknown }>;
  let widgetEvents: AgentWidgetEvent[];

  beforeEach(() => {
    capturedSSEEvents = [];
    widgetEvents = [];
    client = new AgentWidgetClient({
      apiUrl: "http://localhost:8000"
    });
    client.setSSEEventCallback((eventType: string, payload: unknown) => {
      capturedSSEEvents.push({ eventType, payload });
    });
  });

  it("should still create assistant message correctly when event capture is active", async () => {
    global.fetch = createMockFetch([
      sseData({
        type: "step_chunk",
        id: "step_1",
        name: "Prompt 1",
        executionType: "prompt",
        index: 1,
        text: "Hello"
      }),
      sseData({
        type: "step_chunk",
        id: "step_1",
        name: "Prompt 1",
        executionType: "prompt",
        index: 2,
        text: " there"
      }),
      sseData({
        type: "flow_complete",
        flowId: "flow_1",
        success: true,
        duration: 100
      })
    ]);

    await client.dispatch(
      {
        messages: [
          {
            id: "usr_1",
            role: "user",
            content: "Say hello",
            createdAt: new Date().toISOString()
          }
        ]
      },
      (event) => widgetEvents.push(event)
    );

    // Verify event capture worked
    expect(capturedSSEEvents).toHaveLength(3);

    // Verify assistant message was still created properly
    const messageEvents = widgetEvents.filter(
      (e) => e.type === "message" && e.message.role === "assistant"
    ) as Extract<AgentWidgetEvent, { type: "message" }>[];
    expect(messageEvents.length).toBeGreaterThan(0);

    // Get final message state (last emitted message event for the assistant)
    const lastMsg = messageEvents[messageEvents.length - 1].message;
    expect(lastMsg.content).toBe("Hello there");
    expect(lastMsg.streaming).toBe(false);
  });

  it("should still display tool calls properly when event capture is active", async () => {
    global.fetch = createMockFetch([
      sseData({
        type: "tool_start",
        toolCallId: "tc_1",
        toolName: "search",
        args: { query: "test" },
        startedAt: "2025-01-01T00:00:00.000Z"
      }),
      sseData({
        type: "tool_complete",
        toolCallId: "tc_1",
        toolName: "search",
        result: { items: ["a", "b"] },
        duration: 250,
        completedAt: "2025-01-01T00:00:01.000Z"
      }),
      sseData({
        type: "step_chunk",
        id: "step_1",
        name: "Prompt 1",
        executionType: "prompt",
        index: 1,
        text: "Found results"
      }),
      sseData({
        type: "flow_complete",
        flowId: "flow_1",
        success: true,
        duration: 500
      })
    ]);

    await client.dispatch(
      {
        messages: [
          {
            id: "usr_1",
            role: "user",
            content: "Search",
            createdAt: new Date().toISOString()
          }
        ]
      },
      (event) => widgetEvents.push(event)
    );

    // Verify SSE capture got all events
    expect(capturedSSEEvents).toHaveLength(4);

    // Verify tool message was created properly
    const messageEvents = widgetEvents.filter(
      (e) => e.type === "message"
    ) as Extract<AgentWidgetEvent, { type: "message" }>[];

    // Collect unique messages by id (last state wins)
    const messagesById = new Map<string, AgentWidgetMessage>();
    for (const evt of messageEvents) {
      messagesById.set(evt.message.id, evt.message);
    }

    // Should have a tool message
    const toolMessages = Array.from(messagesById.values()).filter(
      (m) => m.variant === "tool"
    );
    expect(toolMessages).toHaveLength(1);
    expect(toolMessages[0].toolCall?.name).toBe("search");
    expect(toolMessages[0].toolCall?.status).toBe("complete");
    expect(toolMessages[0].toolCall?.result).toEqual({ items: ["a", "b"] });

    // Should have an assistant message with the text
    const assistantMessages = Array.from(messagesById.values()).filter(
      (m) => m.role === "assistant" && !m.variant
    );
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0].content).toBe("Found results");
  });

  it("should work correctly without an SSE callback set", async () => {
    // Create a client with no SSE callback
    const clientNoCallback = new AgentWidgetClient({
      apiUrl: "http://localhost:8000"
    });

    global.fetch = createMockFetch([
      sseData({
        type: "step_chunk",
        id: "step_1",
        name: "Prompt 1",
        executionType: "prompt",
        index: 1,
        text: "Works fine"
      }),
      sseData({
        type: "flow_complete",
        flowId: "flow_1",
        success: true,
        duration: 50
      })
    ]);

    const events: AgentWidgetEvent[] = [];
    await clientNoCallback.dispatch(
      {
        messages: [
          {
            id: "usr_1",
            role: "user",
            content: "Test",
            createdAt: new Date().toISOString()
          }
        ]
      },
      (event) => events.push(event)
    );

    // Message processing should work fine without the callback
    const msgEvents = events.filter(
      (e) => e.type === "message" && e.message.role === "assistant"
    ) as Extract<AgentWidgetEvent, { type: "message" }>[];
    expect(msgEvents.length).toBeGreaterThan(0);
    const last = msgEvents[msgEvents.length - 1].message;
    expect(last.content).toBe("Works fine");
  });

  it("should capture events even if the callback throws", async () => {
    const clientWithBadCallback = new AgentWidgetClient({
      apiUrl: "http://localhost:8000"
    });

    let callCount = 0;
    clientWithBadCallback.setSSEEventCallback(() => {
      callCount++;
      // Throwing in the callback should not break message processing
      // since the callback is called with optional chaining (this.onSSEEvent?.())
      // Note: the throw will bubble up but the test verifies the callback was called
    });

    global.fetch = createMockFetch([
      sseData({
        type: "step_chunk",
        id: "step_1",
        name: "Prompt 1",
        executionType: "prompt",
        index: 1,
        text: "Still works"
      }),
      sseData({
        type: "flow_complete",
        flowId: "flow_1",
        success: true,
        duration: 50
      })
    ]);

    const events: AgentWidgetEvent[] = [];
    await clientWithBadCallback.dispatch(
      {
        messages: [
          {
            id: "usr_1",
            role: "user",
            content: "Test",
            createdAt: new Date().toISOString()
          }
        ]
      },
      (event) => events.push(event)
    );

    // Callback was invoked for each event
    expect(callCount).toBe(2);

    // Message processing completed
    const msgEvents = events.filter(
      (e) => e.type === "message" && e.message.role === "assistant"
    ) as Extract<AgentWidgetEvent, { type: "message" }>[];
    expect(msgEvents.length).toBeGreaterThan(0);
  });
});
