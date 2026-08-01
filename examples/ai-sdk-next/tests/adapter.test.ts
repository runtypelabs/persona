import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import { createAISDKPersonaHandler } from "../app/lib/ai-sdk-adapter";
import { personaMessagesToModelMessages, type PersonaDispatchBody } from "../app/lib/persona-wire";
import { collectSSE, dispatchRequest, summarizeWire } from "./wire-testing";

// Offline: the model is mocked, so these tests need no API key and no network.
// They pin the frame ordering the widget reads, not the model's wording.
const START_CHUNK: LanguageModelV3StreamPart = { type: "stream-start", warnings: [] };
const FINISH_CHUNK: LanguageModelV3StreamPart = {
  type: "finish",
  finishReason: { unified: "stop", raw: "stop" },
  usage: {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  },
};

function mockModel(chunks: LanguageModelV3StreamPart[]): MockLanguageModelV3 {
  const stream: LanguageModelV3StreamPart[] = [START_CHUNK, ...chunks, FINISH_CHUNK];
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: stream,
        initialDelayInMs: null,
        chunkDelayInMs: null,
      }),
    }),
  });
}

function textChunks(text: string): LanguageModelV3StreamPart[] {
  return [
    { type: "text-start", id: "t1" },
    { type: "text-delta", id: "t1", delta: text },
    { type: "text-end", id: "t1" },
  ];
}

const SUGGESTIONS = [
  { label: "How do I deploy this?" },
  { label: "Show me the wire format", prompt: "Show me the raw SSE frames this route emits." },
];

function handlerFor(chunks: LanguageModelV3StreamPart[]) {
  return createAISDKPersonaHandler({
    model: mockModel(chunks),
    system: "You are a concise assistant explaining Persona adapter examples.",
    getMessages(body) {
      return personaMessagesToModelMessages((body as PersonaDispatchBody).messages);
    },
  });
}

describe("ai-sdk adapter → Persona wire", () => {
  it("streams a valid SSE run for a text-only answer", async () => {
    const handle = handlerFor(textChunks("Adapters map an SDK stream onto Persona frames."));

    const summary = summarizeWire(await collectSSE(await handle(dispatchRequest("what is this?"))));

    expect(summary.events[0]).toBe("execution_start");
    expect(summary.events.at(-1)).toBe("execution_complete");
    expect(summary.text).toBe("Adapters map an SDK stream onto Persona frames.");
    expect(summary.toolCalls).toEqual([]);
    expect(summary.executionIds.size).toBe(1);
    expect(summary.kinds.has("agent")).toBe(true);
    expect(summary.success).toBe(true);
    expect(summary.seqMonotonic).toBe(true);
  });

  it("surfaces a mid-stream model failure as execution_error", async () => {
    const handle = handlerFor([
      ...textChunks("partial"),
      { type: "error", error: new Error("boom") },
    ]);

    const summary = summarizeWire(await collectSSE(await handle(dispatchRequest("hi"))));

    expect(summary.errored).toBe(true);
    expect(summary.success).toBe(false);
  });
});

// The model owns the suggestions; the adapter only forwards its tool call to
// the wire, fire-and-forget, with no `/resume` endpoint in play.
describe("ai-sdk adapter → follow-up suggestions", () => {
  const toolCallChunks: LanguageModelV3StreamPart[] = [
    ...textChunks("Here is the short version."),
    {
      type: "tool-call",
      toolCallId: "call_mock_1",
      toolName: "suggest_replies",
      input: JSON.stringify({ suggestions: SUGGESTIONS }),
    },
  ];

  it("emits suggest_replies after the text block and before the turn closes", async () => {
    const handle = handlerFor(toolCallChunks);

    const frames = await collectSSE(await handle(dispatchRequest("hi")));
    const events = frames.map((f) => f.event);
    const startIndex = events.indexOf("tool_start");

    expect(startIndex).toBeGreaterThan(events.indexOf("text_complete"));
    expect(startIndex).toBeLessThan(events.indexOf("turn_complete"));
    expect(frames[startIndex].data.toolName).toBe("suggest_replies");
    expect(frames[startIndex].data.toolType).toBe("local");
    // The widget reads `origin` on `await` frames only; omitting it always holds.
    expect(frames[startIndex].data.origin).toBeUndefined();
  });

  it("reuses the model's toolCallId and closes the call immediately", async () => {
    const handle = handlerFor(toolCallChunks);

    const frames = await collectSSE(await handle(dispatchRequest("hi")));
    const startIndex = frames.findIndex((f) => f.event === "tool_start");
    const completeFrame = frames[startIndex + 1];

    expect(frames[startIndex].data.toolCallId).toBe("call_mock_1");
    expect(completeFrame.event).toBe("tool_complete");
    expect(completeFrame.data.toolCallId).toBe("call_mock_1");
    expect(completeFrame.data.success).toBe(true);
    // The canned result every Persona example puts on tool_complete.
    expect(completeFrame.data.result).toEqual({
      content: [{ type: "text", text: "Suggestions shown to the user." }],
    });
  });

  it("carries the model's arguments on tool_start.parameters", async () => {
    const handle = handlerFor(toolCallChunks);

    const summary = summarizeWire(await collectSSE(await handle(dispatchRequest("hi"))));

    expect(summary.toolCalls.map((call) => call.name)).toEqual(["suggest_replies"]);

    const { suggestions } = summary.toolCalls[0].parameters as { suggestions: unknown[] };
    expect(Array.isArray(suggestions)).toBe(true);
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions.length).toBeLessThanOrEqual(4);
    for (const item of suggestions) {
      if (typeof item === "string") {
        expect(item.length).toBeGreaterThan(0);
      } else {
        expect(typeof (item as { label?: unknown }).label).toBe("string");
      }
    }
  });

  it("keeps the run well-formed with the tool call in it", async () => {
    const handle = handlerFor(toolCallChunks);

    const summary = summarizeWire(await collectSSE(await handle(dispatchRequest("hi"))));

    expect(summary.text).toBe("Here is the short version.");
    expect(summary.executionIds.size).toBe(1);
    expect(summary.seqMonotonic).toBe(true);
    expect(summary.success).toBe(true);
    expect(summary.events.at(-1)).toBe("execution_complete");
  });

  it("declares the tool to the model", async () => {
    const model = mockModel(textChunks("hi"));
    const handle = createAISDKPersonaHandler({
      model,
      getMessages: () => [{ role: "user", content: "hi" }],
    });

    await collectSSE(await handle(dispatchRequest("hi")));

    const call = model.doStreamCalls[0];
    expect(call.tools?.map((t) => t.name)).toContain("suggest_replies");
    expect(call.prompt[0]).toMatchObject({ role: "system" });
    expect(String((call.prompt[0] as { content: string }).content)).toContain("suggest_replies");
  });
});
