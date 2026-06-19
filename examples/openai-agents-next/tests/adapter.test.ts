import { Agent } from "@openai/agents";
import { aisdk } from "@openai/agents-extensions/ai-sdk";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { createOpenAIAgentsPersonaHandler } from "../app/lib/openai-agents-adapter";
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
