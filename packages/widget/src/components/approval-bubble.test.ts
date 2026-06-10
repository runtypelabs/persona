// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  approvalDetailsExpansionState,
  createApprovalBubble,
  humanizeToolName,
  updateApprovalDetailsUI,
} from "./approval-bubble";
import { recordWebMcpToolDisplayTitles } from "../webmcp-bridge";
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

const TOOL_DESCRIPTION =
  "Add products to the shopping cart. IMPORTANT: If a product has required options you MUST include the variantId.";

const makeDetailedMessage = (
  approval: Partial<AgentWidgetApproval> = {}
): AgentWidgetMessage =>
  makeMessage({
    toolType: "webmcp",
    description: TOOL_DESCRIPTION,
    parameters: { items: [{ productEntityId: 129, quantity: 1 }] },
    ...approval,
  });

const getSummary = (bubble: HTMLElement) =>
  bubble.querySelector("[data-approval-summary]") as HTMLElement | null;
const getToggle = (bubble: HTMLElement) =>
  bubble.querySelector('button[data-bubble-type="approval"]') as HTMLElement | null;
const getDetails = (bubble: HTMLElement) =>
  bubble.querySelector("[data-approval-details]") as HTMLElement | null;

beforeEach(() => {
  approvalDetailsExpansionState.clear();
  // Reset display titles recorded by a prior test (the map is rebuilt from
  // each full snapshot, so recording an empty snapshot clears it).
  recordWebMcpToolDisplayTitles([]);
});

describe("humanizeToolName", () => {
  it("converts snake_case to a sentence", () => {
    expect(humanizeToolName("add_to_cart")).toBe("Add to cart");
  });

  it("strips the webmcp: prefix", () => {
    expect(humanizeToolName("webmcp:add_to_cart")).toBe("Add to cart");
  });

  it("splits camelCase and kebab-case", () => {
    expect(humanizeToolName("getProductDetails")).toBe("Get product details");
    expect(humanizeToolName("apply-promo-code")).toBe("Apply promo code");
  });

  it("returns the input when nothing word-like remains", () => {
    expect(humanizeToolName("")).toBe("");
  });
});

describe("createApprovalBubble summary and details", () => {
  it("shows a friendly summary instead of the agent-facing description", () => {
    const bubble = createApprovalBubble(makeDetailedMessage());
    expect(getSummary(bubble)?.textContent).toBe(
      "The assistant wants to use “Add to cart”."
    );
    expect(getSummary(bubble)?.textContent).not.toContain("IMPORTANT");
  });

  it("collapses the description and parameters behind a toggle by default", () => {
    const bubble = createApprovalBubble(makeDetailedMessage());
    const toggle = getToggle(bubble);
    const details = getDetails(bubble);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.textContent).toContain("Show details");
    expect(details?.style.display).toBe("none");
    expect(details?.textContent).toContain("IMPORTANT");
    expect(details?.querySelector("pre")?.textContent).toContain("productEntityId");
  });

  it("renders details expanded when detailsDisplay is 'expanded'", () => {
    const config = { approval: { detailsDisplay: "expanded" } } as AgentWidgetConfig;
    const bubble = createApprovalBubble(makeDetailedMessage(), config);
    expect(getToggle(bubble)?.getAttribute("aria-expanded")).toBe("true");
    expect(getToggle(bubble)?.textContent).toContain("Hide details");
    expect(getDetails(bubble)?.style.display).toBe("");
  });

  it("omits the details section entirely when detailsDisplay is 'hidden'", () => {
    const config = { approval: { detailsDisplay: "hidden" } } as AgentWidgetConfig;
    const bubble = createApprovalBubble(makeDetailedMessage(), config);
    expect(getToggle(bubble)).toBeNull();
    expect(getDetails(bubble)).toBeNull();
    expect(bubble.textContent).not.toContain("IMPORTANT");
  });

  it("respects a per-message expansion override from prior toggling", () => {
    approvalDetailsExpansionState.set("msg-1", true);
    const bubble = createApprovalBubble(makeDetailedMessage());
    expect(getToggle(bubble)?.getAttribute("aria-expanded")).toBe("true");
    expect(getDetails(bubble)?.style.display).toBe("");
  });

  it("uses formatDescription for the summary when provided", () => {
    const config = {
      approval: {
        formatDescription: ({ toolName }: { toolName: string }) =>
          `Allow the page to run ${toolName}?`,
      },
    } as AgentWidgetConfig;
    const bubble = createApprovalBubble(makeDetailedMessage(), config);
    expect(getSummary(bubble)?.textContent).toBe("Allow the page to run add_to_cart?");
  });

  it("falls back to the default summary when formatDescription returns a falsy value", () => {
    const config = {
      approval: { formatDescription: () => undefined },
    } as AgentWidgetConfig;
    const bubble = createApprovalBubble(makeDetailedMessage(), config);
    expect(getSummary(bubble)?.textContent).toBe(
      "The assistant wants to use “Add to cart”."
    );
  });

  it("falls back to the raw description when there is no tool name, without duplicating it in details", () => {
    const bubble = createApprovalBubble(makeDetailedMessage({ toolName: "" }));
    expect(getSummary(bubble)?.textContent).toBe(TOOL_DESCRIPTION);
    const details = getDetails(bubble);
    expect(details?.textContent).not.toContain("IMPORTANT");
    expect(details?.querySelector("pre")?.textContent).toContain("productEntityId");
  });

  it("renders no toggle when there is nothing to show in details", () => {
    const bubble = createApprovalBubble(
      makeDetailedMessage({ toolName: "", description: "", parameters: undefined })
    );
    expect(getToggle(bubble)).toBeNull();
    expect(getDetails(bubble)).toBeNull();
  });

  it("prefers a declared WebMCP display title over the humanized tool name", () => {
    recordWebMcpToolDisplayTitles([
      { name: "add_to_cart", description: "", title: "Add to Cart" },
    ]);
    const bubble = createApprovalBubble(makeDetailedMessage());
    expect(getSummary(bubble)?.textContent).toBe(
      "The assistant wants to use “Add to Cart”."
    );
  });

  it("resolves the declared title for wire-prefixed tool names", () => {
    recordWebMcpToolDisplayTitles([
      { name: "add_to_cart", description: "", title: "Add to Cart" },
    ]);
    const bubble = createApprovalBubble(
      makeDetailedMessage({ toolName: "webmcp:add_to_cart", toolType: undefined })
    );
    expect(getSummary(bubble)?.textContent).toBe(
      "The assistant wants to use “Add to Cart”."
    );
  });

  it("ignores recorded titles for non-WebMCP approvals", () => {
    recordWebMcpToolDisplayTitles([
      { name: "add_to_cart", description: "", title: "Add to Cart" },
    ]);
    const bubble = createApprovalBubble(
      makeDetailedMessage({ toolType: undefined })
    );
    expect(getSummary(bubble)?.textContent).toBe(
      "The assistant wants to use “Add to cart”."
    );
  });

  it("passes the declared title to formatDescription as displayTitle", () => {
    recordWebMcpToolDisplayTitles([
      { name: "add_to_cart", description: "", title: "Add to Cart" },
    ]);
    const seen: unknown[] = [];
    const config = {
      approval: {
        formatDescription: (ctx: { displayTitle?: string }) => {
          seen.push(ctx.displayTitle);
          return undefined;
        },
      },
    } as AgentWidgetConfig;
    createApprovalBubble(makeDetailedMessage(), config);
    expect(seen).toEqual(["Add to Cart"]);
  });

  it("honors custom toggle labels", () => {
    const config = {
      approval: { showDetailsLabel: "Mehr anzeigen", hideDetailsLabel: "Weniger anzeigen" },
    } as AgentWidgetConfig;
    const bubble = createApprovalBubble(makeDetailedMessage(), config);
    expect(getToggle(bubble)?.textContent).toContain("Mehr anzeigen");
  });
});

describe("updateApprovalDetailsUI", () => {
  it("syncs visibility and toggle state after the expansion state changes", () => {
    const bubble = createApprovalBubble(makeDetailedMessage());
    expect(getDetails(bubble)?.style.display).toBe("none");

    approvalDetailsExpansionState.set("msg-1", true);
    updateApprovalDetailsUI("msg-1", bubble);
    expect(getDetails(bubble)?.style.display).toBe("");
    expect(getToggle(bubble)?.getAttribute("aria-expanded")).toBe("true");
    expect(getToggle(bubble)?.textContent).toContain("Hide details");

    approvalDetailsExpansionState.set("msg-1", false);
    updateApprovalDetailsUI("msg-1", bubble);
    expect(getDetails(bubble)?.style.display).toBe("none");
    expect(getToggle(bubble)?.textContent).toContain("Show details");
  });
});

describe("createApprovalBubble agent reason", () => {
  it("renders the attributed reason line as plain text when present", () => {
    const bubble = createApprovalBubble(
      makeDetailedMessage({
        reason: "Adds the <b>large</b> blue tee to your cart as you asked.",
      })
    );
    const reasonLine = bubble.querySelector("[data-approval-reason]") as HTMLElement;
    expect(reasonLine).not.toBeNull();
    expect(reasonLine.textContent).toContain("Agent's stated reason:");
    expect(reasonLine.textContent).toContain(
      "Adds the <b>large</b> blue tee to your cart as you asked."
    );
    // Plain text rendering — markup in the agent-authored string must not
    // become elements (prompt-injection surface).
    expect(reasonLine.querySelector("b")).toBeNull();
  });

  it("omits the reason line when no reason is provided", () => {
    const bubble = createApprovalBubble(makeDetailedMessage());
    expect(bubble.querySelector("[data-approval-reason]")).toBeNull();
  });

  it("applies reasonColor and a custom reasonLabel from config", () => {
    const config: AgentWidgetConfig = {
      approval: { reasonColor: "rgb(1, 2, 3)", reasonLabel: "Why:" },
    } as AgentWidgetConfig;
    const bubble = createApprovalBubble(
      makeDetailedMessage({ reason: "Because you asked." }),
      config
    );
    const reasonLine = bubble.querySelector("[data-approval-reason]") as HTMLElement;
    expect(reasonLine.style.color).toBe("rgb(1, 2, 3)");
    expect(reasonLine.textContent).toContain("Why:");
    expect(reasonLine.textContent).not.toContain("Agent's stated reason:");
  });

  it("passes the reason to formatDescription", () => {
    let seenReason: string | undefined;
    const config: AgentWidgetConfig = {
      approval: {
        formatDescription: (approval: { reason?: string }) => {
          seenReason = approval.reason;
          return undefined;
        },
      },
    } as AgentWidgetConfig;
    createApprovalBubble(makeDetailedMessage({ reason: "Because." }), config);
    expect(seenReason).toBe("Because.");
  });
});
