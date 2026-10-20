import { describe, expect, it } from "vitest";
import { AgentWidgetClient } from "./client";
import type { AgentWidgetEvent, AgentWidgetMessage } from "./types";
import type { RuntypeExecutionStreamEvent } from "./generated/runtype-openapi-contract";

type Frame = RuntypeExecutionStreamEvent extends infer E
  ? E extends RuntypeExecutionStreamEvent ? Omit<E, "seq" | "executionId"> : never
  : never;

async function consume(frames: Frame[]) {
  const events: AgentWidgetEvent[] = [];
  const client = new AgentWidgetClient({
    apiUrl: "https://example.test/dispatch",
    customFetch: async () => new Response(frames.map((frame, seq) =>
      `event: ${frame.type}\ndata: ${JSON.stringify({ executionId: "exec_test", seq, ...frame })}\n\n`
    ).join(""), { headers: { "Content-Type": "text/event-stream" } }),
  });
  await client.dispatch({ messages: [] }, event => events.push(structuredClone(event)));
  const messages = new Map<string, AgentWidgetMessage>();
  for (const event of events) if (event.type === "message") messages.set(event.message.id, event.message);
  return { events, messages: [...messages.values()] };
}

const start = (id: string, parameters?: Record<string, unknown>): Frame => ({
  type: "tool_start", toolCallId: id, toolName: "lookup", toolType: "builtin", parameters,
});

describe("canonical unified tool channels", () => {
  it.each([undefined, { query: "provisional" }])("applies final parameters after a provisional start (%j)", async parameters => {
    const { messages } = await consume([
      start("call_a", parameters),
      { type: "tool_input_delta", toolCallId: "call_a", delta: '{"query":"hello"}' },
      { type: "tool_input_complete", toolCallId: "call_a", parameters: { query: "hello" } },
      { type: "tool_complete", toolCallId: "call_a", success: true },
    ]);
    expect(messages[0].toolCall).toMatchObject({ id: "call_a", args: { query: "hello" }, chunks: ['{"query":"hello"}'] });
  });

  it("accepts empty final parameters", async () => {
    const { messages } = await consume([start("call_a", { stale: true }),
      { type: "tool_input_complete", toolCallId: "call_a", parameters: {} }]);
    expect(messages[0].toolCall?.args).toEqual({});
  });

  it("keeps continuation calls separate from the last started call", async () => {
    const { messages } = await consume([
      start("call_b"),
      { type: "tool_input_complete", toolCallId: "call_a", toolName: "lookup", parameters: { query: "A" } },
      { type: "tool_output_delta", toolCallId: "call_a", delta: "A output" },
      { type: "tool_complete", toolCallId: "call_a", toolName: "lookup", success: true, result: "A result", executionTime: 42 },
      { type: "tool_complete", toolCallId: "call_b", success: true, result: "B result" },
    ]);
    expect(messages.map(m => m.toolCall?.id).sort()).toEqual(["call_a", "call_b"]);
    expect(messages.find(m => m.toolCall?.id === "call_a")?.toolCall).toMatchObject({ args: { query: "A" }, chunks: ["A output"], result: "A result", duration: 42, durationMs: 42 });
    expect(messages.find(m => m.toolCall?.id === "call_b")?.toolCall?.result).toBe("B result");
  });

  it("keeps the canonical ID and name on a completion-only continuation", async () => {
    const { messages } = await consume([{ type: "tool_complete", toolCallId: "call_a", toolName: "lookup", success: true }]);
    expect(messages[0].toolCall).toMatchObject({ id: "call_a", name: "lookup" });
  });

  it("retains a tool failure while the execution continues", async () => {
    const { messages, events } = await consume([
      start("call_a"),
      { type: "tool_complete", toolCallId: "call_a", success: false, error: "Search timed out" },
      { type: "text_start", id: "text_a" },
      { type: "text_delta", id: "text_a", delta: "I can try another search." },
      { type: "text_complete", id: "text_a" },
      { type: "execution_complete", kind: "agent", success: true },
    ]);
    expect(messages[0].toolCall).toMatchObject({ status: "complete", success: false, error: "Search timed out" });
    expect(messages.at(-1)?.content).toBe("I can try another search.");
    expect(events.filter(e => e.type === "error")).toEqual([]);
  });
});

it.each(['tool_start', 'tool_output_delta', 'tool_complete'] as const)('stamps metadata on the first pending %s emission', async type => {
  const frame: Frame = type === 'tool_start' ? { ...start('call_b'), iteration: 2 }
    : type === 'tool_complete' ? { type, toolCallId: 'call_b', success: true, iteration: 2 }
    : { type, toolCallId: 'call_b', delta: 'output' };
  const { events } = await consume([{ ...start('call_a'), iteration: 2 }, frame]);
  const first = events.find((event): event is Extract<AgentWidgetEvent, { type: 'message' }> => event.type === 'message' && event.message.id === 'tool-call_b');
  expect(first?.message.toolCall?.status).toBe('pending');
  expect(first?.message.agentMetadata).toMatchObject({ executionId: 'exec_test', iteration: 2 });
});
it('keeps start iteration metadata when executionId is absent', async () => {
  const messages: AgentWidgetMessage[] = [];
  const client = new AgentWidgetClient({ apiUrl: '/chat' });
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new TextEncoder().encode('data: {"type":"tool_start","toolCallId":"a","toolName":"Search","iteration":3}\n\n'));
    controller.close();
  } });
  await client.processStream(stream, event => { if (event.type === 'message') messages.push(structuredClone(event.message)); });
  expect(messages.filter(message => message.variant === 'tool').every(message => message.agentMetadata?.iteration === 3)).toBe(true);
});

it('enriches an existing tool with execution and explicit iteration metadata', async () => {
  const messages: AgentWidgetMessage[] = [];
  const frames = [
    { type: 'tool_input_complete', toolCallId: 'a', toolName: 'Search', parameters: {} },
    { type: 'tool_start', toolCallId: 'a', toolName: 'Search', executionId: 'e1', iteration: 3 },
    { type: 'tool_start', toolCallId: 'b', toolName: 'Other', executionId: 'e1', iteration: 4 },
    { type: 'tool_output_delta', toolCallId: 'a', executionId: 'e1', delta: 'late output' },
  ];
  const client = new AgentWidgetClient({ apiUrl: '/chat' });
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new TextEncoder().encode(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join('')));
    controller.close();
  } });
  await client.processStream(stream, event => { if (event.type === 'message' && event.message.id === 'tool-a') messages.push(structuredClone(event.message)); });
  expect(messages[0].agentMetadata?.executionId).toBeUndefined();
  expect(messages.at(-1)?.agentMetadata).toMatchObject({ executionId: 'e1', iteration: 3 });
});
