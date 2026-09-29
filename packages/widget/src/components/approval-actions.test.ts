// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBuiltInApprovalPlugin } from "./approval-actions";
import type {
  AgentWidgetApproval,
  AgentWidgetConfig,
  AgentWidgetMessage,
} from "../types";
import type { AgentWidgetPlugin } from "../plugins/types";

// The chunked approval components read webmcp titles through an injected dep
// (see approval-deps.ts); wire the real core function here the way ui.ts does
// at chunk adoption.
import { initApprovalUi } from "./approval-deps";
import { getWebMcpToolDisplayTitle } from "../webmcp-bridge";

initApprovalUi({ webMcpToolTitle: getWebMcpToolDisplayTitle });


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

// Each widget owns its own plugin instance + teardown (state is per-instance).
// Track teardowns so afterEach can release any leftover document listeners.
let teardowns: Array<() => void> = [];
let expansionState: Map<string, boolean>;

const makePlugin = (): { plugin: AgentWidgetPlugin; teardown: () => void } => {
  const handle = createBuiltInApprovalPlugin(expansionState);
  teardowns.push(handle.teardown);
  return handle;
};

const renderWith = (
  plugin: AgentWidgetPlugin,
  config: AgentWidgetConfig = {},
  message: AgentWidgetMessage = makeMessage()
) => {
  const approve = vi.fn();
  const deny = vi.fn();
  const el = plugin.renderApproval!({
    message,
    defaultRenderer: () => document.createElement("div"),
    config,
    approve,
    deny,
  });
  if (el) document.body.appendChild(el);
  return { el, approve, deny };
};

// Convenience for single-render tests: fresh widget instance each call.
const render = (
  config: AgentWidgetConfig = {},
  message: AgentWidgetMessage = makeMessage()
) => renderWith(makePlugin().plugin, config, message);

const click = (el: Element | null | undefined): void => {
  el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
};

afterEach(() => {
  teardowns.forEach((t) => t());
  teardowns = [];
  document.body.innerHTML = "";
});

beforeEach(() => {
  expansionState = new Map<string, boolean>();
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
    expect(deny).not.toHaveBeenCalled();
    const denied = render();
    click(denied.el?.querySelector('[data-action="deny"]'));
    expect(denied.deny).toHaveBeenCalledTimes(1);
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

  it("teardown releases the document keydown listener", () => {
    const { plugin, teardown } = makePlugin();
    const { approve } = renderWith(plugin, cfg);
    teardown();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(approve).not.toHaveBeenCalled();
  });

  it("within one widget, only the latest pending approval owns the keyboard shortcuts", () => {
    const { plugin } = makePlugin();
    const first = renderWith(plugin, cfg, makeMessage({}, "msg-A"));
    const second = renderWith(plugin, cfg, makeMessage({}, "msg-B"));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(first.approve).not.toHaveBeenCalled();
    expect(second.approve).toHaveBeenCalledWith({ remember: true });
  });

  it("promotes an older pending approval to keyboard owner when the latest resolves", () => {
    const { plugin } = makePlugin();
    const first = renderWith(plugin, cfg, makeMessage({}, "msg-A"));
    const second = renderWith(plugin, cfg, makeMessage({}, "msg-B"));
    // Resolve the current owner (B); A should inherit the shortcuts.
    click(second.el?.querySelector('[data-action="deny"]'));
    expect(second.deny).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(first.approve).toHaveBeenCalledWith({ remember: true });
  });

  it("re-rendering an older approval does not steal shortcuts from the newest", () => {
    const { plugin } = makePlugin();
    const first = renderWith(plugin, cfg, makeMessage({}, "msg-A"));
    const second = renderWith(plugin, cfg, makeMessage({}, "msg-B"));
    // Older card (A) re-renders, e.g. via idiomorph — it must NOT claim the
    // shortcuts back from the newer card B at the bottom of the thread.
    const reA = renderWith(plugin, cfg, makeMessage({}, "msg-A"));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(first.approve).not.toHaveBeenCalled();
    expect(reA.approve).not.toHaveBeenCalled();
    expect(second.approve).toHaveBeenCalledWith({ remember: true });
  });

  it("tearing down one widget leaves another widget's approval shortcuts intact", () => {
    const widgetA = makePlugin();
    const widgetB = makePlugin();
    const a = renderWith(widgetA.plugin, cfg, makeMessage({}, "msg-A"));
    const b = renderWith(widgetB.plugin, cfg, makeMessage({}, "msg-B"));
    widgetA.teardown(); // destroy only widget A
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(a.approve).not.toHaveBeenCalled();
    expect(b.approve).toHaveBeenCalledWith({ remember: true });
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
    expect(expansionState.get("msg-1")).toBe(true);
  });

  it("detailsDisplay:'expanded' shows params up front", () => {
    const { el } = render({ approval: { detailsDisplay: "expanded" } }, withParams());
    expect(el?.querySelector<HTMLElement>('[data-role="params"]')?.hidden).toBe(false);
  });

  it("detailsDisplay:'hidden' omits the disclosure and header toggle", () => {
    const { el } = render({ approval: { detailsDisplay: "hidden" } }, withParams());
    expect(el?.querySelector('[data-role="params"]')).toBeNull();
    expect(el?.querySelector('[data-action="toggle-params"]')).toBeNull();
  });

  it("honors config show/hideDetailsLabel as the toggle's accessible label", () => {
    const { el } = render(
      { approval: { showDetailsLabel: "Reveal call", hideDetailsLabel: "Hide call" } },
      withParams()
    );
    const head = el?.querySelector<HTMLElement>('[data-action="toggle-params"]');
    expect(head?.getAttribute("aria-label")).toBe("Reveal call");
    click(head);
    expect(head?.getAttribute("aria-label")).toBe("Hide call");
  });

  it("defaults the toggle's accessible label to Show/Hide details", () => {
    const { el } = render({}, withParams());
    const head = el?.querySelector<HTMLElement>('[data-action="toggle-params"]');
    expect(head?.getAttribute("aria-label")).toBe("Show details");
    click(head);
    expect(head?.getAttribute("aria-label")).toBe("Hide details");
  });
});

describe("built-in approval — agent description in disclosure", () => {
  it("surfaces approval.description in the collapsible details even without parameters", () => {
    const { el } = render(
      {},
      makeMessage({ description: "Reads your calendar", parameters: undefined })
    );
    const details = el?.querySelector<HTMLElement>('[data-role="params"]');
    expect(details).not.toBeNull();
    expect(el?.querySelector('[data-action="toggle-params"]')).not.toBeNull();
    expect(details?.querySelector(".persona-approval-desc")?.textContent).toContain(
      "Reads your calendar"
    );
  });

  it("shows the description alongside the parameters block", () => {
    const { el } = render(
      {},
      makeMessage({ description: "Reads your calendar", parameters: { when: "today" } })
    );
    const details = el?.querySelector<HTMLElement>('[data-role="params"]');
    expect(details?.querySelector(".persona-approval-desc")?.textContent).toContain(
      "Reads your calendar"
    );
    expect(details?.querySelector(".persona-approval-params")?.textContent).toContain("today");
  });

  it("detailsDisplay:'hidden' omits the description disclosure too", () => {
    const { el } = render(
      { approval: { detailsDisplay: "hidden" } },
      makeMessage({ description: "Reads your calendar", parameters: undefined })
    );
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

describe("V5 approval cards", () => {
  const config: AgentWidgetConfig = { future: { v5Defaults: true }, approval: { enableAlwaysAllow: true } };

  it("keeps one-time permission primary and remembered permission in the menu", () => {
    const { el, approve } = render(config);
    expect(el?.querySelector('[data-action="always"]')).toBeNull();
    expect(el?.querySelector('[data-action="allow"]')?.textContent).toBe("Allow once");
    click(el?.querySelector('[data-action="allow"]'));
    expect(approve).toHaveBeenCalledWith();
  });

  it("does not consume host-page keys or modified Enter", () => {
    const { el, approve, deny } = render(config);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    const allow = el?.querySelector<HTMLButtonElement>('[data-action="allow"]');
    allow?.focus();
    allow?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
    expect(approve).not.toHaveBeenCalled();
    expect(deny).not.toHaveBeenCalled();
    allow?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(approve).toHaveBeenCalledWith();
  });

  it("only resolves the instance owning the event", () => {
    const first = render(config);
    const second = render(config);
    first.el?.querySelector('[data-action="deny"]')?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(first.deny).toHaveBeenCalledOnce();
    expect(second.deny).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, "Allowed"],
    ["running", "Allowed · running"],
    ["completed", "Completed"],
    ["failed", "Failed"],
  ] as const)("renders compact approved rows with reliable execution status %s", (status, label) => {
    const { plugin } = makePlugin();
    const el = plugin.renderApproval!({
      message: makeMessage({ status: "approved" }), config,
      approve: vi.fn(), deny: vi.fn(), defaultRenderer: () => document.createElement("div"),
      execution: status ? { toolCallId: "tool-1", status } : undefined,
    });
    expect(el?.querySelector(".persona-approval-status")?.textContent).toBe(label);
    expect(el?.querySelector(".persona-approval-actions")).toBeNull();
    expect(el?.classList.contains("persona-approval-row")).toBe(true);
    expect(el?.querySelector(".persona-approval-head")?.textContent).toContain(`Search docs · ${label}`);
    expect(el?.querySelector(".persona-approval-logo")).toBeNull();
    expect(el?.textContent).not.toContain("wants to use");
  });

  it("renders denied rows without interpreting execution", () => {
    const { el } = render(config, makeMessage({ status: "denied" }));
    expect(el?.querySelector(".persona-approval-status")?.textContent).toBe("Denied");
  });

  it("honors explicit V4 presentation and shortcut overrides", () => {
    const { el } = render({ ...config, approval: { resolvedDisplay: "trace", keyboardShortcuts: false } }, makeMessage({ status: "approved" }));
    expect(el?.style.display).toBe("none");
  });
});

it("accepts only one decision while a pending card remains mounted", () => {
  const { el, approve, deny } = render({ future: { v5Defaults: true } });
  const allow = el?.querySelector('[data-action="allow"]');
  allow?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  click(allow);
  click(el?.querySelector('[data-action="deny"]'));
  expect(approve).toHaveBeenCalledOnce();
  expect(deny).not.toHaveBeenCalled();
});

it("keeps timeout details usable without decision controls", () => {
  const { el } = render({ future: { v5Defaults: true } }, makeMessage({ status: "timeout", parameters: { query: "docs" } }));
  expect(el?.querySelector(".persona-approval-status")?.textContent).toBe("Timed out");
  expect(el?.querySelector(".persona-approval-actions")).toBeNull();
  click(el?.querySelector('[data-action="toggle-params"]'));
  expect(el?.querySelector<HTMLElement>('[data-role="params"]')?.hidden).toBe(false);
});


it.each([false, true])("preserves the explicit retained-card option with V5=%s", (v5Defaults) => {
  const { el } = render({ future: { v5Defaults }, approval: { resolvedDisplay: "status-line" } }, makeMessage({ status: "approved" }));
  expect(el?.classList.contains("persona-approval-card")).toBe(true);
  expect(el?.querySelector(".persona-approval-status")?.textContent).toBe("Allowed");
  expect(el?.querySelector(".persona-approval-actions")).toBeNull();
});

it("retains decision context and per-instance disclosure through resolved rerenders", () => {
  const config: AgentWidgetConfig = { future: { v5Defaults: true } };
  const message = makeMessage({ reason: "Read public docs", parameters: { query: "theme" } });
  const first = createBuiltInApprovalPlugin();
  const second = createBuiltInApprovalPlugin();
  teardowns.push(first.teardown, second.teardown);
  const pending = renderWith(first.plugin, config, message).el;
  click(pending?.querySelector('[data-action="toggle-params"]'));
  const resolved = { ...message, approval: { ...message.approval!, status: "approved" as const } };
  const firstRow = renderWith(first.plugin, config, resolved).el;
  const otherRow = renderWith(second.plugin, config, resolved).el;
  const firstDetails = firstRow?.querySelector<HTMLElement>('[data-role="params"]');
  expect(firstDetails?.hidden).toBe(false);
  expect(firstDetails?.textContent).toContain("Read public docs");
  expect(firstDetails?.textContent).toContain('"query": "theme"');
  expect(otherRow?.querySelector<HTMLElement>('[data-role="params"]')?.hidden).toBe(true);
  const head = firstRow?.querySelector<HTMLElement>('[data-action="toggle-params"]');
  expect(head?.getAttribute("aria-controls")).toBe(firstDetails?.id);
  expect(head?.getAttribute("aria-controls")).not.toBe(otherRow?.querySelector("[aria-controls]")?.getAttribute("aria-controls"));
  expect(head?.getAttribute("aria-label")).toBe("Search docs · Allowed. Hide details");
  click(head);
  expect(firstRow?.querySelector<HTMLElement>(".persona-approval-body")?.hidden).toBe(true);
  expect(renderWith(first.plugin, config, resolved).el?.querySelector<HTMLElement>('[data-role="params"]')?.hidden).toBe(true);
});

it("makes reason-only resolved rows inspectable and honors hidden details", () => {
  const message = makeMessage({ status: "denied", description: undefined, reason: "Check inventory" });
  const { el } = render({ approval: { resolvedDisplay: "row" } }, message);
  click(el?.querySelector('[data-action="toggle-params"]'));
  expect(el?.querySelector<HTMLElement>('[data-role="params"]')?.hidden).toBe(false);
  expect(el?.querySelector('[data-role="params"]')?.textContent).toContain("Agent's stated reason: Check inventory");
  const hidden = render({ approval: { resolvedDisplay: "row", detailsDisplay: "hidden" } }, message).el;
  expect(hidden?.querySelector("button")).toBeNull();
  expect(hidden?.querySelector('[data-role="params"]')).toBeNull();
  expect(hidden?.textContent).toBe("Search docs · Denied");
});


it("honors initially expanded compact rows without enabling decision shortcuts", () => {
  const { el, approve, deny } = render({ future: { v5Defaults: true }, approval: { detailsDisplay: "expanded" } }, makeMessage({ status: "approved" }));
  expect(el?.querySelector<HTMLElement>('[data-role="params"]')?.hidden).toBe(false);
  expect(el?.querySelector<HTMLElement>(".persona-approval-body")?.hidden).toBe(false);
  el?.querySelector("button")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(approve).not.toHaveBeenCalled();
  expect(deny).not.toHaveBeenCalled();
});
