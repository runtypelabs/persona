import { AIMessageChunk } from "@langchain/core/messages";
import { FakeStreamingChatModel } from "@langchain/core/utils/testing";
import { describe, expect, it } from "vitest";
import { createLangGraphPersonaHandler } from "../app/lib/langgraph-adapter";
import { personaMessagesToChat, type PersonaDispatchBody } from "../app/lib/persona-wire";
import { collectSSE, dispatchRequest, summarizeWire } from "./wire-testing";

// Mock LLM: FakeStreamingChatModel streams the given chunks token-by-token, which
// LangGraph surfaces as `on_chat_model_stream` events. No provider, no API key.
const mockModel = (parts: string[]) =>
  new FakeStreamingChatModel({ chunks: parts.map((content) => new AIMessageChunk({ content })) });

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
