// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createToolBubble } from "./tool-bubble";
import type { AgentWidgetConfig, AgentWidgetMessage } from "../types";

const makeMessage = (): AgentWidgetMessage => ({
  id: "msg-1",
  role: "assistant",
  content: "",
  createdAt: new Date().toISOString(),
  variant: "tool",
  streaming: false,
  toolCall: {
    id: "tool-1",
    name: "get_weather",
    status: "complete",
    args: { city: "SF" },
  },
});

describe("createToolBubble shadow", () => {
  it("falls back to the themeable --persona-tool-bubble-shadow variable when no config.shadow is set", () => {
    const bubble = createToolBubble(makeMessage());
    expect(bubble.style.boxShadow).toContain("--persona-tool-bubble-shadow");
  });

  it("applies a custom shadow inline from config.toolCall.shadow", () => {
    const config = { toolCall: { shadow: "0 8px 24px rgba(0,0,0,0.15)" } } as AgentWidgetConfig;
    const bubble = createToolBubble(makeMessage(), config);
    expect(bubble.style.boxShadow).toBe("0 8px 24px rgba(0,0,0,0.15)");
  });

  it('maps an empty shadow string to "none"', () => {
    const config = { toolCall: { shadow: "  " } } as AgentWidgetConfig;
    const bubble = createToolBubble(makeMessage(), config);
    expect(bubble.style.boxShadow).toBe("none");
  });
});
