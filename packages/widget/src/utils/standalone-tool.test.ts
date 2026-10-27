import { describe, expect, it } from "vitest";
import { ASK_USER_QUESTION_TOOL_NAME } from "../components/ask-user-question-bubble";
import type { AgentWidgetConfig, AgentWidgetMessage } from "../types";
import { isStandaloneTool, rendersAsQuestion } from "./standalone-tool";

const message = (name: string, answered = false, variant: AgentWidgetMessage["variant"] = "tool"): AgentWidgetMessage => ({
  id: "m", role: "assistant", content: "", createdAt: "now", variant,
  agentMetadata: { askUserQuestionAnswered: answered },
  toolCall: { id: "m", name, status: "complete", chunks: [] },
});
const enabled = (value?: boolean): AgentWidgetConfig =>
  value === undefined ? {} : { features: { askUserQuestion: { enabled: value } } };

describe("isStandaloneTool", () => {
  it.each([undefined, true])("is true for a question, pending or answered (enabled: %s)", value => {
    expect(isStandaloneTool(message(ASK_USER_QUESTION_TOOL_NAME), enabled(value))).toBe(true);
    expect(isStandaloneTool(message(ASK_USER_QUESTION_TOOL_NAME, true), enabled(value))).toBe(true);
  });

  it("is false for a question rendered as a tool card because the feature is off", () => {
    expect(isStandaloneTool(message(ASK_USER_QUESTION_TOOL_NAME), enabled(false))).toBe(false);
    expect(isStandaloneTool(message(ASK_USER_QUESTION_TOOL_NAME, true), enabled(false))).toBe(false);
  });

  it("is false for other tools and for non-tool messages", () => {
    expect(isStandaloneTool(message("search"), {})).toBe(false);
    expect(isStandaloneTool(message("webmcp:ask_user_question"), {})).toBe(false);
    expect(isStandaloneTool(message(ASK_USER_QUESTION_TOOL_NAME, false, "reasoning"), {})).toBe(false);
    expect(isStandaloneTool({ id: "t", role: "assistant", content: "", createdAt: "now" }, {})).toBe(false);
  });

  it("matches the question render condition", () => {
    for (const config of [enabled(), enabled(true), enabled(false)]) {
      const question = message(ASK_USER_QUESTION_TOOL_NAME);
      expect(isStandaloneTool(question, config)).toBe(rendersAsQuestion(question, config));
    }
  });
});
