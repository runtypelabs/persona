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


describe("tool failure presentation", () => {
  it("shows the failure in the header and escapes its detail", () => {
    const message = makeMessage();
    message.toolCall = { ...message.toolCall!, success: false, error: "<script>bad()</script> timed out" };
    const bubble = createToolBubble(message);
    expect(bubble.textContent).toContain("Failed");
    expect(bubble.querySelector("[data-persona-tool-error]")?.textContent).toBe(message.toolCall.error);
    expect(bubble.querySelector("script")).toBeNull();
  });
});

describe("approval-superseded presentation", () => {
  it("labels an approved call that ran again under a new id", () => {
    const message = makeMessage();
    message.toolCall = { ...message.toolCall!, approvalStatus: "approved", superseded: true };
    const bubble = createToolBubble(message);
    expect(bubble.textContent).toContain("Approved, ran again below");
  });
});

describe("semantic activity row labels", () => {
  const config: AgentWidgetConfig = { future: { v5Defaults: true } };
  const message = () => ({ ...makeMessage(), toolCall: { ...makeMessage().toolCall!, name: "web_search" } });
  const header = (settings = config) => createToolBubble(message(), settings).querySelector("button")!.textContent;

  it("uses the semantic default and retains the original name in expanded details", () => {
    const bubble = createToolBubble(message(), config);
    expect(bubble.querySelector("button")?.textContent).toBe("Searched the web");
    expect(bubble.querySelector("[data-persona-tool-name]")?.textContent).toBe("web_search");
  });
  it("preserves explicit display modes, authored templates and custom renderers", () => {
    expect(header({ ...config, features: { toolCallDisplay: { collapsedMode: "tool-name" } } })).toBe("web_search");
    expect(header({ ...config, features: { toolCallDisplay: { collapsedMode: "tool-preview" } } })).toContain("SF");
    expect(header({ ...config, toolCall: { completeTextTemplate: "Finished {toolName}" } })).toBe("Finished web_search");
    expect(header({ ...config, toolCall: { renderCollapsedSummary: () => "Custom search" } })).toBe("Custom search");
  });
  it("retains approval and failure attention", () => {
    const item = message(); Object.assign(item.toolCall, { success: false, approvalStatus: "pending" });
    expect(createToolBubble(item, config).querySelector("button")?.textContent).toContain("Web search · Failed · Waiting for approval");
  });
  it("uses message approval in preference to stale tool approval", () => {
    const item = message(); item.toolCall.approvalStatus = "approved";
    item.approval = { id: "approval", agentId: "agent", executionId: "execution", toolName: "web_search", description: "Approve search", status: "pending" };
    expect(createToolBubble(item, config).querySelector("button")?.textContent).toBe("Web search · Waiting for approval");
  });
  it("does not claim a superseded original executed", () => {
    const item = message(); item.toolCall.superseded = true;
    expect(createToolBubble(item, config).querySelector("button")?.textContent).toBe("Web search · Approved, ran again below");
  });
});

describe("descriptive action titles without turn classification", () => {
  const active = (): AgentWidgetMessage => {
    const message = makeMessage();
    message.toolCall = { ...message.toolCall!, name: "Read", status: "running", actionTitle: "  Checking citations  " };
    return message;
  };
  const title = (message: AgentWidgetMessage, config: AgentWidgetConfig) => createToolBubble(message, config).querySelector("button")!.textContent;
  const row: AgentWidgetConfig = { features: { toolCallDisplay: { variant: "row" } } };
  it("uses plain text direct titles, and preserves tool-name, preview, templates and attention", () => {
    const message = active();
    expect(title(message, row)).toBe("Checking citations");
    message.toolCall!.actionTitle = "<b>Checking citations</b>";
    expect(createToolBubble(message, row).querySelector("button b")).toBeNull();
    expect(title(message, { features: { toolCallDisplay: { variant: "row", collapsedMode: "tool-name" } } })).toBe("Read");
    message.toolCall!.chunks = ["Preview output"];
    expect(title(message, { features: { toolCallDisplay: { variant: "row", collapsedMode: "tool-preview" } } })).toBe("Preview output");
    expect(title(message, { ...row, toolCall: { activeTextTemplate: "Host {toolName}" } })).toBe("Host Read");
    for (const attention of [{error: "Failed"}, {success: false}, {interrupted: true}, {approvalStatus: "pending" as const}]) {
      const other = active(); Object.assign(other.toolCall!, attention);
      expect(title(other, row)).not.toContain("Checking citations");
    }
  });
  it("resolves adapter titles by original call identity, with direct precedence and blank fallback", () => {
    const message = active();
    const settings = { ...row, toolCall: { resolveActionTitle: (tool: NonNullable<AgentWidgetMessage["toolCall"]>, original: AgentWidgetMessage) => {
      expect(tool).toBe(message.toolCall); expect(original).toBe(message); return "Adapter title";
    } } };
    expect(title(message, settings)).toBe("Checking citations");
    message.toolCall!.actionTitle = "  ";
    expect(title(message, settings)).toBe("Adapter title");
    for (const value of ["  ", null, undefined]) expect(title(message, { ...row, toolCall: { resolveActionTitle: () => value } })).toBe("Reading a file");
  });
  it("keeps card headers unchanged and offers resolved title to the custom renderer", () => {
    const message = active();
    let received: string | undefined;
    const bubble = createToolBubble(message, { features: { toolCallDisplay: { variant: "card" } }, toolCall: {
      renderCollapsedSummary: context => { received = context.actionTitle; expect(context.defaultSummary).not.toContain("Checking citations"); return null; },
    } });
    expect(received).toBe("Checking citations");
    expect(bubble.querySelector("button")!.textContent).not.toContain("Checking citations");
  });
});
