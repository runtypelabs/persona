// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBuiltInApprovalPlugin,
  teardownAllBuiltInApprovals,
} from "./approval-actions";
import { approvalDetailsExpansionState } from "./approval-bubble";
import type {
  AgentWidgetApproval,
  AgentWidgetConfig,
  AgentWidgetMessage,
} from "../types";

const makeMessage = (
  approval: Partial<AgentWidgetApproval> = {},
  id = "msg-1"
): AgentWidgetMessage => ({
  id,
  role: "assistant",
  content: "",
  createdAt: new Date().toISOString(),
  variant: "approval",
  streaming: false,
  approval: {
    id: "appr-1",
    status: "pending",
    agentId: "agent-1",
    executionId: "exec-1",
    toolName: "search_docs",
    description: "Search the docs",
    ...approval,
  },
});

const render = (
  config: AgentWidgetConfig = {},
  message: AgentWidgetMessage = makeMessage()
) => {
  const approve = vi.fn();
  const deny = vi.fn();
  const el = createBuiltInApprovalPlugin().renderApproval!({
    message,
    defaultRenderer: () => document.createElement("div"),
    config,
    approve,
    deny,
  });
  if (el) document.body.appendChild(el);
  return { el, approve, deny };
};

const click = (el: Element | null | undefined): void => {
  el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
};

afterEach(() => {
  teardownAllBuiltInApprovals();
  approvalDetailsExpansionState.clear();
  document.body.innerHTML = "";
});

describe("built-in approval — flag off (default)", () => {
  it("renders a single Allow + Deny, no split control", () => {
    const { el } = render();
    expect(el?.querySelector('[data-action="allow"]')?.textContent).toContain("Allow");
    expect(el?.querySelector('[data-action="deny"]')).not.toBeNull();
    expect(el?.querySelector('[data-action="always"]')).toBeNull();
    expect(el?.querySelector('[data-action="toggle-menu"]')).toBeNull();
    expect(el?.textContent).not.toContain("Always allow");
  });

  it("Allow resolves approved without remember; Deny denies", () => {
    const { el, approve, deny } = render();
    click(el?.querySelector('[data-action="allow"]'));
    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve.mock.calls[0]).toEqual([]); // no { remember } argument
    click(el?.querySelector('[data-action="deny"]'));
    expect(deny).toHaveBeenCalledTimes(1);
  });

  it("renders the title from the tool name and an optional source", () => {
    const { el } = render({}, makeMessage({ toolName: "search_docs", toolType: "Runtype" }));
    const title = el?.querySelector(".persona-approval-title");
    expect(title?.textContent).toContain("Search docs");
    expect(title?.textContent).toContain("from");
    expect(title?.textContent).toContain("Runtype");
  });

  it("honors config.approval.approveLabel / denyLabel", () => {
    const { el } = render({ approval: { approveLabel: "Permit", denyLabel: "Refuse" } });
    expect(el?.querySelector('[data-action="allow"]')?.textContent).toContain("Permit");
    expect(el?.querySelector('[data-action="deny"]')?.textContent).toContain("Refuse");
  });
});

describe("built-in approval — flag on (enableAlwaysAllow)", () => {
  const cfg: AgentWidgetConfig = { approval: { enableAlwaysAllow: true } };

  it("renders the split Always allow + caret + Deny", () => {
    const { el } = render(cfg);
    expect(el?.querySelector('[data-action="always"]')?.textContent).toContain("Always allow");
    expect(el?.querySelector('[data-action="toggle-menu"]')).not.toBeNull();
    expect(el?.querySelector('[data-action="deny"]')).not.toBeNull();
    expect(el?.querySelector('[data-action="allow"]')).toBeNull();
  });

  it("Always allow resolves with { remember: true }", () => {
    const { el, approve } = render(cfg);
    click(el?.querySelector('[data-action="always"]'));
    expect(approve).toHaveBeenCalledWith({ remember: true });
  });

  it("Enter triggers Always allow", () => {
    const { approve } = render(cfg);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(approve).toHaveBeenCalledWith({ remember: true });
  });

  it("Escape denies", () => {
    const { deny } = render(cfg);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(deny).toHaveBeenCalledTimes(1);
  });

  it("Cmd/Ctrl+Enter triggers Allow once (no remember)", () => {
    const { approve } = render(cfg);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }));
    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve.mock.calls[0]).toEqual([]);
  });

  it("ignores keyboard shortcuts while typing in an editable field", () => {
    const { approve } = render(cfg);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(approve).not.toHaveBeenCalled();
  });

  it("teardownAllBuiltInApprovals releases the document keydown listener", () => {
    const { approve } = render(cfg);
    teardownAllBuiltInApprovals();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(approve).not.toHaveBeenCalled();
  });

  it("only the latest pending approval owns the keyboard shortcuts", () => {
    const first = render(cfg, makeMessage({}, "msg-A"));
    const second = render(cfg, makeMessage({}, "msg-B"));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(first.approve).not.toHaveBeenCalled();
    expect(second.approve).toHaveBeenCalledWith({ remember: true });
  });
});

describe("built-in approval — parameters disclosure", () => {
  const withParams = () => makeMessage({ parameters: { query: "x", n: 5 } });

  it("collapses parameters by default and expands on header click", () => {
    const { el } = render({}, withParams());
    const pre = el?.querySelector<HTMLElement>('[data-role="params"]');
    expect(pre).not.toBeNull();
    expect(pre?.hidden).toBe(true);
    click(el?.querySelector(".persona-approval-head"));
    expect(pre?.hidden).toBe(false);
    expect(approvalDetailsExpansionState.get("msg-1")).toBe(true);
  });

  it("detailsDisplay:'expanded' shows params up front", () => {
    const { el } = render({ approval: { detailsDisplay: "expanded" } }, withParams());
    expect(el?.querySelector<HTMLElement>('[data-role="params"]')?.hidden).toBe(false);
  });

  it("detailsDisplay:'hidden' omits the params block and header toggle", () => {
    const { el } = render({ approval: { detailsDisplay: "hidden" } }, withParams());
    expect(el?.querySelector('[data-role="params"]')).toBeNull();
    expect(el?.querySelector('[data-action="toggle-params"]')).toBeNull();
  });
});

describe("built-in approval — resolved states", () => {
  it("approved renders nothing visible (the tool call takes over)", () => {
    const { el } = render({}, makeMessage({ status: "approved" }));
    expect(el?.style.display).toBe("none");
    expect(el?.querySelector("[data-action]")).toBeNull();
  });

  it("denied renders a subtle one-line trace, no action buttons", () => {
    const { el } = render({}, makeMessage({ status: "denied" }));
    expect(el?.classList.contains("persona-approval-resolved")).toBe(true);
    expect(el?.textContent).toContain("Search docs");
    expect(el?.textContent).toContain("denied");
    expect(el?.querySelector("[data-action]")).toBeNull();
  });

  it("timeout renders a timed-out trace", () => {
    const { el } = render({}, makeMessage({ status: "timeout" }));
    expect(el?.textContent).toContain("timed out");
  });
});
