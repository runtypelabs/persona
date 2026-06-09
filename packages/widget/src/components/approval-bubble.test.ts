// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createApprovalBubble } from "./approval-bubble";
import type {
  AgentWidgetApproval,
  AgentWidgetConfig,
  AgentWidgetMessage,
} from "../types";

const makeMessage = (
  approval: Partial<AgentWidgetApproval> = {}
): AgentWidgetMessage => ({
  id: "msg-1",
  role: "assistant",
  content: "",
  createdAt: new Date().toISOString(),
  variant: "tool",
  streaming: false,
  approval: {
    id: "appr-1",
    status: "pending",
    agentId: "agent-1",
    executionId: "exec-1",
    toolName: "add_to_cart",
    description: "Approval required",
    ...approval,
  },
});

describe("createApprovalBubble shadow", () => {
  it("falls back to the themeable --persona-approval-shadow variable when no config.shadow is set", () => {
    const bubble = createApprovalBubble(makeMessage());
    expect(bubble.style.boxShadow).toContain("--persona-approval-shadow");
  });

  it("applies a custom shadow from config.approval.shadow", () => {
    const config: AgentWidgetConfig = {
      approval: { shadow: "0 8px 24px rgba(0,0,0,0.15)" },
    } as AgentWidgetConfig;
    const bubble = createApprovalBubble(makeMessage(), config);
    expect(bubble.style.boxShadow).toBe("0 8px 24px rgba(0,0,0,0.15)");
  });

  it('maps an empty shadow string to "none"', () => {
    const config: AgentWidgetConfig = {
      approval: { shadow: "  " },
    } as AgentWidgetConfig;
    const bubble = createApprovalBubble(makeMessage(), config);
    expect(bubble.style.boxShadow).toBe("none");
  });

  it("uses the themeable variable fallback when approval handling is disabled (approval: false)", () => {
    const config: AgentWidgetConfig = { approval: false } as AgentWidgetConfig;
    const bubble = createApprovalBubble(makeMessage(), config);
    expect(bubble.style.boxShadow).toContain("--persona-approval-shadow");
  });
});
