import { describe, expect, it } from "vitest";

import {
  findPrecedingUserMessageId,
  findRetryableAssistantMessageId,
  findUserTurnBoundary,
  isEditableUserMessage,
} from "./resubmit-turn";

const turn = [
  { id: "u1", role: "user" },
  { id: "r1", role: "assistant", variant: "reasoning" },
  { id: "t1", role: "assistant", variant: "tool" },
  { id: "ap1", role: "assistant", variant: "approval" },
  { id: "s1", role: "system" },
  { id: "a1", role: "assistant" },
  { id: "u2", role: "user" },
  { id: "a2", role: "assistant" },
];

describe("findUserTurnBoundary", () => {
  it("spans reasoning, tool, approval, and system variants up to the next user message", () => {
    expect(findUserTurnBoundary(turn, "u1")).toEqual({ start: 0, end: 6 });
  });

  it("ends the final turn at the transcript end", () => {
    expect(findUserTurnBoundary(turn, "u2")).toEqual({ start: 6, end: 8 });
  });

  it("returns null for an unknown id", () => {
    expect(findUserTurnBoundary(turn, "nope")).toBeNull();
  });

  it("returns null when the id is not a user message", () => {
    expect(findUserTurnBoundary(turn, "a1")).toBeNull();
  });

  it("handles a user message with no assistant reply", () => {
    expect(findUserTurnBoundary([{ id: "u1", role: "user" }], "u1")).toEqual({
      start: 0,
      end: 1,
    });
  });
});

describe("findPrecedingUserMessageId", () => {
  it("walks back past variant bubbles to the user message", () => {
    expect(findPrecedingUserMessageId(turn, "a1")).toBe("u1");
  });

  it("returns null when no user message precedes", () => {
    expect(
      findPrecedingUserMessageId([{ id: "a1", role: "assistant" }], "a1")
    ).toBeNull();
  });
});

describe("findRetryableAssistantMessageId", () => {
  it("picks the last plain assistant bubble of the final turn", () => {
    expect(findRetryableAssistantMessageId(turn)).toBe("a2");
  });

  it("returns null while that turn is still streaming", () => {
    expect(
      findRetryableAssistantMessageId([
        { id: "u1", role: "user" },
        { id: "a1", role: "assistant", streaming: true },
      ])
    ).toBeNull();
  });

  it("returns null when the transcript ends on a user message", () => {
    expect(
      findRetryableAssistantMessageId([
        { id: "a1", role: "assistant" },
        { id: "u1", role: "user" },
      ])
    ).toBeNull();
  });

  it("returns null for an assistant message with no user turn behind it", () => {
    expect(
      findRetryableAssistantMessageId([{ id: "a1", role: "assistant" }])
    ).toBeNull();
  });

  it("skips trailing variant bubbles to reach the plain assistant bubble", () => {
    expect(
      findRetryableAssistantMessageId([
        { id: "u1", role: "user" },
        { id: "a1", role: "assistant" },
        { id: "t1", role: "assistant", variant: "tool" },
      ])
    ).toBe("a1");
  });
});

describe("isEditableUserMessage", () => {
  const base = { role: "user", content: "hello" };

  it("accepts a plain text-only user message", () => {
    expect(isEditableUserMessage(base)).toBe(true);
  });

  it("accepts an llmContent identical to content", () => {
    expect(isEditableUserMessage({ ...base, llmContent: "hello" })).toBe(true);
  });

  it.each([
    ["attachments", { contentParts: [{ type: "text", text: "x" }] }],
    ["mention refs", { contextMentions: [{ sourceId: "s", itemId: "i", label: "l" }] }],
    ["inline segments", { contentSegments: [{ type: "text", text: "x" }] }],
    ["structured mention context", { mentionContext: { a: 1 } }],
    ["raw content", { rawContent: "{}" }],
    ["distinct llmContent", { llmContent: "something else" }],
    ["a quote", { quote: { text: "quoted" } }],
    ["a variant", { variant: "tool" }],
    ["streaming", { streaming: true }],
  ])("rejects a message carrying %s", (_label, extra) => {
    expect(isEditableUserMessage({ ...base, ...extra })).toBe(false);
  });

  it("rejects assistant messages", () => {
    expect(isEditableUserMessage({ role: "assistant", content: "hi" })).toBe(false);
  });

  it("rejects empty text", () => {
    expect(isEditableUserMessage({ role: "user", content: "" })).toBe(false);
  });
});
