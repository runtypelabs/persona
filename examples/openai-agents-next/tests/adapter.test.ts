import { Agent } from "@openai/agents";
import { aisdk } from "@openai/agents-extensions/ai-sdk";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import {
  createOpenAIAgentsPersonaHandler,
  SUGGEST_REPLIES_TOOL_USE_BEHAVIOR,
  suggestRepliesTool,
} from "../app/lib/openai-agents-adapter";
import { personaMessagesToChat, type PersonaDispatchBody } from "../app/lib/persona-wire";
import { collectSSE, dispatchRequest, summarizeWire } from "./wire-testing";

// Mock LLM: an AI SDK v6 MockLanguageModelV3 replaying known text-delta chunks,
// wrapped with `aisdk()` so the OpenAI Agents SDK uses it as its model. The agent
// runs for real, with no OpenAI provider and no OPENAI_API_KEY.
const mockModel = (parts: string[]) =>
  new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "0" },
          ...parts.map((delta) => ({ type: "text-delta", id: "0", delta })),
          { type: "text-end", id: "0" },
          {
            type: "finish",
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: parts.length, totalTokens: 1 + parts.length },
          },
        ] as any,
      }),
    }),
  });

const usage = (outputTokens: number) => ({
  inputTokens: 1,
  outputTokens,
  totalTokens: 1 + outputTokens,
});

// Mock LLM that exercises the tool path: text deltas, then a `suggest_replies`
// call. `stopAtToolNames` ends the run there, so it is only ever asked once.
const mockToolCallingModel = (parts: string[], suggestions: unknown[]) =>
  new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "0" },
          ...parts.map((delta) => ({ type: "text-delta", id: "0", delta })),
          { type: "text-end", id: "0" },
          {
            type: "tool-call",
            toolCallId: "call_mock_1",
            toolName: "suggest_replies",
            input: JSON.stringify({ suggestions }),
          },
          { type: "finish", finishReason: "tool-calls", usage: usage(parts.length) },
        ] as any,
      }),
    }),
  });

const getMessages = (body: unknown) =>
  personaMessagesToChat((body as PersonaDispatchBody).messages);

describe("openai-agents adapter → Persona wire", () => {
  it("translates a streamed agent run into a valid SSE run", async () => {
    const agent = new Agent({
      name: "Assistant",
      instructions: "Reply concisely.",
      model: aisdk(mockModel(["Hello", ", ", "world"])),
    });

    const POST = createOpenAIAgentsPersonaHandler({ agent, getMessages });
    const summary = summarizeWire(await collectSSE(await POST(dispatchRequest("hi"))));

    expect(summary.events[0]).toBe("execution_start");
    expect(summary.events.at(-1)).toBe("execution_complete");
    expect(summary.text).toBe("Hello, world");
    expect(summary.executionIds.size).toBe(1);
    expect(summary.kinds.has("agent")).toBe(true);
    expect(summary.success).toBe(true);
    expect(summary.seqMonotonic).toBe(true);
  });
});

// The chips are pure wire: a fire-and-forget `suggest_replies` tool call, no
// `/resume` endpoint and no widget config. The mock model decides to call the
// tool; the SDK runs it and the adapter mirrors the call onto the wire.
describe("openai-agents adapter → follow-up suggestions", () => {
  const suggestions = [
    { label: "How do I swap the model?" },
    { label: "Show me the wire frames", prompt: "Walk me through the SSE frames you emit." },
  ];

  const runWithSuggestions = async () => {
    const agent = new Agent({
      name: "Assistant",
      instructions: "Reply concisely.",
      model: aisdk(mockToolCallingModel(["Here", " you", " go"], suggestions)),
      tools: [suggestRepliesTool],
      toolUseBehavior: SUGGEST_REPLIES_TOOL_USE_BEHAVIOR,
    });

    const POST = createOpenAIAgentsPersonaHandler({ agent, getMessages });
    return collectSSE(await POST(dispatchRequest("hi")));
  };

  it("emits suggest_replies after the text block and before the turn closes", async () => {
    const frames = await runWithSuggestions();
    const events = frames.map((f) => f.event);
    const startIndex = events.indexOf("tool_start");

    expect(startIndex).toBeGreaterThan(events.indexOf("text_complete"));
    expect(startIndex).toBeLessThan(events.indexOf("turn_complete"));
    expect(frames[startIndex].data.toolName).toBe("suggest_replies");
    expect(frames[startIndex].data.toolType).toBe("local");
    // The widget reads `origin` on `await` frames only; omitting it always holds.
    expect(frames[startIndex].data.origin).toBeUndefined();
  });

  it("closes the tool call with the SDK's call id", async () => {
    const frames = await runWithSuggestions();
    const startIndex = frames.findIndex((f) => f.event === "tool_start");
    const completeFrame = frames[startIndex + 1];

    expect(frames[startIndex].data.toolCallId).toBe("call_mock_1");
    expect(completeFrame.event).toBe("tool_complete");
    expect(completeFrame.data.toolCallId).toBe(frames[startIndex].data.toolCallId);
    expect(completeFrame.data.success).toBe(true);
    // The canned result every Persona example puts on tool_complete.
    expect(completeFrame.data.result).toEqual({
      content: [{ type: "text", text: "Suggestions shown to the user." }],
    });
  });

  it("keeps the run well-formed and the payload within the widget's rules", async () => {
    const summary = summarizeWire(await runWithSuggestions());

    expect(summary.text).toBe("Here you go");
    expect(summary.executionIds.size).toBe(1);
    expect(summary.seqMonotonic).toBe(true);
    expect(summary.success).toBe(true);
    expect(summary.toolCalls.map((call) => call.name)).toEqual(["suggest_replies"]);

    const payload = summary.toolCalls[0].parameters as { suggestions: unknown[] };
    expect(Array.isArray(payload.suggestions)).toBe(true);
    expect(payload.suggestions.length).toBeGreaterThanOrEqual(1);
    expect(payload.suggestions.length).toBeLessThanOrEqual(4);
    for (const item of payload.suggestions) {
      expect(typeof (item as { label?: unknown }).label).toBe("string");
    }
  });
});
