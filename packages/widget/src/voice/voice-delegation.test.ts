import { describe, expect, it } from "vitest";
import type { AgentWidgetApproval } from "../types";
import { buildApprovalScript } from "./voice-delegation";

const approval = (extra: Partial<AgentWidgetApproval>): AgentWidgetApproval => ({
  id: "ap",
  status: "pending",
  agentId: "a1",
  executionId: "e1",
  toolName: "tool",
  description: "",
  ...extra,
});

describe("buildApprovalScript", () => {
  it("lists every pending action, humanized, with its arguments", () => {
    const script = buildApprovalScript([
      approval({ toolName: "webmcp:addToCart", parameters: { sku: "AB-1", quantity: 3 } }),
      approval({ toolName: "send-receipt", parameters: { to: { email: "n@example.com" }, copies: [] } }),
    ]);
    expect(script).toBe(
      "These actions need the user's approval in the chat before they happen:\n" +
        "- add to cart with sku: AB-1; quantity: 3\n" +
        "- send receipt with to: email n@example.com\n\n" +
        "Briefly tell the user what you're about to do and ask them to approve or decline it in the chat. Don't claim it's done.",
    );
  });

  it("stays under about 1,000 characters however much the tools carry", () => {
    const big = { notes: "x".repeat(5_000), items: Array.from({ length: 200 }, (_, i) => ({ name: `item ${i}`, qty: i })) };
    const script = buildApprovalScript(
      Array.from({ length: 5 }, (_, i) =>
        approval({ toolName: `tool_${i}`, description: "d".repeat(500), reason: "r".repeat(500), parameters: big }),
      ),
    );
    expect(script.length).toBeLessThanOrEqual(1_000);
    expect(script).toContain("- tool 4");
    expect(script.endsWith("Don't claim it's done.")).toBe(true);
  });
});
