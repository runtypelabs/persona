// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { createApprovalBubble } from "./approval-bubble";
import type { AgentWidgetMessage } from "../types";

const makeApprovalMessage = (): AgentWidgetMessage => ({
  id: "approval-1",
  role: "assistant",
  content: "",
  createdAt: new Date().toISOString(),
  streaming: false,
  variant: "approval",
  approval: {
    id: "1",
    status: "pending",
    agentId: "agent-1",
    executionId: "exec-1",
    toolName: "submit_form",
    toolType: "local",
    description: "Approval is required before the tool can continue.",
    parameters: {
      pagePath: "/accounts/nimbus-robotics/implementation-request"
    }
  }
});

describe("createApprovalBubble", () => {
  it("includes the delegated click hook class for approval actions", () => {
    const bubble = createApprovalBubble(makeApprovalMessage());

    expect(bubble.classList.contains("vanilla-approval-bubble")).toBe(true);
    expect(
      bubble.querySelector('button[data-approval-action="approve"]')
    ).not.toBeNull();
    expect(
      bubble.querySelector('button[data-approval-action="deny"]')
    ).not.toBeNull();
  });
});
