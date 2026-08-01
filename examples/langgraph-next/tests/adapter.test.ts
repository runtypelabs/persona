import { AIMessageChunk, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { FakeStreamingChatModel } from "@langchain/core/utils/testing";
import { describe, expect, it } from "vitest";
import { createLangGraphPersonaHandler } from "../app/lib/langgraph-adapter";
import { personaMessagesToChat, type PersonaDispatchBody } from "../app/lib/persona-wire";
import { collectSSE, dispatchRequest, summarizeWire } from "./wire-testing";

// Mock LLM: FakeStreamingChatModel streams the given chunks token-by-token, which
// LangGraph surfaces as `on_chat_model_stream` events. No provider, no API key.
const mockModel = (parts: string[], toolCallChunks: ToolCallChunk[] = []) =>
  new FakeStreamingChatModel({
    chunks: [
      ...parts.map((content) => new AIMessageChunk({ content })),
      ...(toolCallChunks.length
        ? [new AIMessageChunk({ content: "", tool_call_chunks: toolCallChunks })]
        : []),
    ],
  });

type ToolCallChunk = { name: string; args: string; id: string; index: number; type: "tool_call_chunk" };

const suggestRepliesChunk = (suggestions: unknown[]): ToolCallChunk => ({
  name: "suggest_replies",
  args: JSON.stringify({ suggestions }),
  id: "call_suggest_1",
  index: 0,
  type: "tool_call_chunk",
});

const getMessages = (body: unknown) =>
  personaMessagesToChat((body as PersonaDispatchBody).messages);

describe("langgraph adapter → Persona wire", () => {
  it("translates streamEvents token deltas into a valid SSE run", async () => {
    const POST = createLangGraphPersonaHandler({
      llm: mockModel(["Hello", ", ", "world"]),
      getMessages,
    });

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

describe("langgraph adapter → follow-up suggestions", () => {
  const suggestions = [
    { label: "How does streaming work?" },
    { label: "Show me the wire frames", prompt: "Show me the full SSE frame sequence" },
  ];

  it("emits the suggest_replies tool frames after the text block and before turn_complete", async () => {
    const POST = createLangGraphPersonaHandler({
      llm: mockModel(["Here", " you go"], [suggestRepliesChunk(suggestions)]),
      getMessages,
    });

    const frames = await collectSSE(await POST(dispatchRequest("hi")));
    const events = frames.map((f) => f.event);
    const toolStart = events.indexOf("tool_start");

    expect(toolStart).toBeGreaterThan(events.indexOf("text_complete"));
    expect(events[toolStart + 1]).toBe("tool_complete");
    expect(toolStart).toBeLessThan(events.indexOf("turn_complete"));

    const start = frames[toolStart].data;
    expect(start.toolName).toBe("suggest_replies");
    expect(start.toolType).toBe("local");
    expect(start.origin).toBeUndefined();
    expect(start.parameters).toEqual({ suggestions });
    expect(frames[toolStart + 1].data.toolCallId).toBe(start.toolCallId);
    expect(frames[toolStart + 1].data.success).toBe(true);
    // The canned result every Persona example puts on tool_complete.
    expect(frames[toolStart + 1].data.result).toEqual({
      content: [{ type: "text", text: "Suggestions shown to the user." }],
    });
  });

  it("keeps the run well-formed around the tool call", async () => {
    const POST = createLangGraphPersonaHandler({
      llm: mockModel(["Here", " you go"], [suggestRepliesChunk(suggestions)]),
      getMessages,
    });

    const summary = summarizeWire(await collectSSE(await POST(dispatchRequest("hi"))));

    expect(summary.text).toBe("Here you go");
    expect(summary.toolCalls.map((c) => c.name)).toEqual(["suggest_replies"]);
    expect(summary.executionIds.size).toBe(1);
    expect(summary.success).toBe(true);
    expect(summary.seqMonotonic).toBe(true);
  });
});

describe("langgraph adapter → follow-up steering", () => {
  /** Captures the messages the graph node hands to the model. */
  const systemMessagesFor = async (
    options: { systemPrompt?: string; followUpSteering?: boolean | string } = {},
  ) => {
    const llm = mockModel(["ok"]);
    // `bindTools` would hand the graph a copy; without it the adapter keeps
    // this instance, so its own stream hook sees the built message list.
    (llm as unknown as { bindTools?: unknown }).bindTools = undefined;
    const seen: BaseMessage[] = [];
    const stream = llm._streamResponseChunks.bind(llm);
    (llm as unknown as { _streamResponseChunks: unknown })._streamResponseChunks = (
      ...args: Parameters<typeof stream>
    ) => {
      seen.push(...args[0]);
      return stream(...args);
    };

    const POST = createLangGraphPersonaHandler({ llm, getMessages, ...options });

    await collectSSE(await POST(dispatchRequest("hi")));
    return seen.filter((m): m is SystemMessage => m instanceof SystemMessage);
  };

  it("adds the built-in steering line by default", async () => {
    const system = await systemMessagesFor();
    expect(system).toHaveLength(1);
    expect(String(system[0].content)).toContain("suggest_replies");
  });

  it("appends the steering to an explicit system prompt", async () => {
    const system = await systemMessagesFor({ systemPrompt: "You are terse." });
    expect(String(system[0].content)).toBe(
      "You are terse. After answering, offer 2-3 follow-up suggestions with the suggest_replies tool, phrased in the user's voice.",
    );
  });

  it("lets a string replace the built-in line", async () => {
    const system = await systemMessagesFor({ followUpSteering: "Always offer four replies." });
    expect(String(system[0].content)).toBe("Always offer four replies.");
  });

  it("emits no system message when steering is off and no prompt is set", async () => {
    expect(await systemMessagesFor({ followUpSteering: false })).toHaveLength(0);
  });

  it("keeps an explicit system prompt when steering is off", async () => {
    const system = await systemMessagesFor({
      systemPrompt: "You are terse.",
      followUpSteering: false,
    });
    expect(String(system[0].content)).toBe("You are terse.");
  });
});
