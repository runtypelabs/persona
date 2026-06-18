// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createBuiltInApprovalPlugin } from "./approval-actions";
import { approvalDetailsExpansionState } from "./approval-bubble";
import type {
  AgentWidgetApproval,
  AgentWidgetConfig,
  AgentWidgetMessage,
} from "../types";
import type { AgentWidgetPlugin } from "../plugins/types";

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

const makePlugin = (): { plugin: AgentWidgetPlugin; teardown: () => void } => {
  const handle = createBuiltInApprovalPlugin();
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
    expect(approvalDetailsExpansionState.get("msg-1")).toBe(true);
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
