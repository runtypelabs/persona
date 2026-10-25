import { describe, expect, it } from "vitest";
import type { AgentWidgetMessage } from "@runtypelabs/persona";
import { historicalOperatorContext } from "../app/lib/operator-context";
import { personaMessagesToModelMessages, personaMessagesToOpenAIInput } from "../app/lib/persona-wire";
import { personaMessagesToChat as agentsMessages } from "../../openai-agents-next/app/lib/persona-wire";
import { personaMessagesToChat as graphMessages } from "../../langgraph-next/app/lib/persona-wire";
import { personaMessagesToChat as eveMessages } from "../../eve-next/app/lib/persona-wire";

const createdAt = "2026-10-24T12:00:00Z";
const human: AgentWidgetMessage = {
  id: "support-42", role: "operator", content: "Visible reply", llmContent: "Refund confirmed",
  createdAt, author: { id: "sam", displayName: "Sam", kind: "human" },
};

describe("stateless human support history", () => {
  it.each([
    ["AI SDK", personaMessagesToModelMessages],
    ["OpenAI Responses", personaMessagesToOpenAIInput],
    ["OpenAI Agents", agentsMessages],
    ["LangGraph", graphMessages],
    ["Eve", eveMessages],
  ])("preserves one attributed historical reply in chronological position through %s conversion", (_name, convert) => {
    const projected = historicalOperatorContext({ message: human, content: human.llmContent!, modelMessage: null })!;
    const messages: NonNullable<ReturnType<typeof historicalOperatorContext>>[] = [
      { role: "user", content: "Where is my order?", createdAt },
      { role: "assistant", content: "Checking", createdAt },
      projected,
      { role: "user", content: "Thanks", createdAt },
    ];
    const result = convert(messages);
    expect(result.map(message => message.role)).toEqual(["user", "assistant", "user", "user"]);
    expect(String(result[2]!.content)).toContain("Historical human support reply");
    expect(String(result[2]!.content)).toContain('"messageId":"support-42"');
    expect(String(result[2]!.content)).toContain('"id":"sam"');
    expect(String(result[2]!.content)).toContain('"kind":"human"');
    expect(JSON.stringify(result).match(/Refund confirmed/g)).toHaveLength(1);
    expect(human.role).toBe("operator");
  });

  it("keeps binary content parts on the wire, ahead of provider-specific conversion", () => {
    const image = { type: "image" as const, image: "https://example.com/photo.png" };
    const result = historicalOperatorContext({ message: human, content: [image], modelMessage: null })!;
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[1]).toEqual(image);
  });
});
