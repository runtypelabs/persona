// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import type { AgentWidgetPlugin } from "./plugins/types";

// The approval UI ships in a lazy chunk; provide it eagerly so this file's
// synchronous render assertions hold. Per-file module isolation keeps the
// async transport path covered by ui.approval-chunk.test.ts.
import { provideApprovalUi } from "./approval-ui-loader";
import * as approvalUiEntry from "./approval-ui-entry";

provideApprovalUi(approvalUiEntry);


const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

const approvalDetails = (mount: HTMLElement): HTMLElement => {
  const details = mount.querySelector<HTMLElement>('[data-role="params"]');
  expect(details).not.toBeNull();
  return details!;
};

const toggleApprovalDetails = (mount: HTMLElement): void => {
  const toggle = mount.querySelector<HTMLElement>('[data-action="toggle-params"]');
  expect(toggle).not.toBeNull();
  toggle!.click();
};

const injectApproval = (
  controller: ReturnType<typeof createAgentExperience>,
  {
    id = "appr-1",
    status = "pending" as "pending" | "approved" | "denied",
    toolCallId = undefined as string | undefined,
  } = {}
) => {
  controller.injectTestMessage({
    type: "message",
    message: {
      id: `approval-${id}`,
      role: "assistant",
      content: "",
      createdAt: "2026-04-24T00:00:00.000Z",
      streaming: false,
      variant: "approval",
      approval: {
        id,
        status,
        toolCallId,
        agentId: "agent_1",
        executionId: "exec_1",
        toolName: "Search documentation",
        description: "Search the docs",
        parameters: { query: "approval theming" },
      },
    },
  });
};

const injectNoise = (
  controller: ReturnType<typeof createAgentExperience>,
  id = "noise"
) => {
  controller.injectTestMessage({
    type: "message",
    message: {
      id,
      role: "user",
      content: "noise",
      createdAt: "2026-04-26T00:00:00.000Z",
      streaming: false,
    },
  });
};

describe("renderApproval plugin hook", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    if (typeof localStorage !== "undefined") localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders a plugin-returned element in place of the built-in bubble", () => {
    const plugin: AgentWidgetPlugin = {
      id: "custom-approval",
      renderApproval: ({ message }) => {
        const root = document.createElement("div");
        root.setAttribute("data-test-id", "custom-approval");
        root.textContent = message.approval?.toolName ?? "";
        return root;
      },
    };

    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      plugins: [plugin],
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    injectApproval(controller);

    const custom = mount.querySelector('[data-test-id="custom-approval"]');
    expect(custom).not.toBeNull();
    expect(custom?.textContent).toBe("Search documentation");
    // The built-in bubble must NOT also render.
    expect(mount.querySelector(".persona-approval-bubble")).toBeNull();
  });

  it("preserves plugin click listeners (e.g. an accordion) across morph re-renders", () => {
    const toggleSpy = vi.fn();
    const plugin: AgentWidgetPlugin = {
      id: "accordion-approval",
      renderApproval: ({ message }) => {
        if (message.approval?.status !== "pending") return null;
        const root = document.createElement("div");
        root.setAttribute("data-test-id", "appr-root");
        const head = document.createElement("button");
        head.type = "button";
        head.setAttribute("data-test-id", "appr-head");
        head.setAttribute("data-action", "toggle");
        const params = document.createElement("pre");
        params.setAttribute("data-test-id", "appr-params");
        // Single delegated listener at the root: the recommended pattern.
        root.addEventListener("click", (e) => {
          const target = (e.target as HTMLElement).closest("[data-action]");
          if (target?.getAttribute("data-action") === "toggle") {
            params.hidden = !params.hidden;
            toggleSpy();
          }
        });
        root.append(head, params);
        return root;
      },
    };

    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      plugins: [plugin],
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    injectApproval(controller);
    // Force a re-render: the scenario where innerHTML morph drops listeners
    // on a freshly-built plugin element unless it's hydrated post-morph.
    injectNoise(controller);

    const head = mount.querySelector<HTMLButtonElement>('[data-test-id="appr-head"]');
    const params = mount.querySelector<HTMLPreElement>('[data-test-id="appr-params"]');
    expect(head).not.toBeNull();
    expect(params).not.toBeNull();

    head!.click();
    expect(toggleSpy).toHaveBeenCalledTimes(1);
    expect(params!.hidden).toBe(true);
  });

  it("resolves via the approve callback (with the remember option)", async () => {
    const onDecision = vi.fn(async () => {});
    const plugin: AgentWidgetPlugin = {
      id: "approve-callback",
      renderApproval: ({ message, approve }) => {
        if (message.approval?.status !== "pending") return null;
        const root = document.createElement("div");
        const btn = document.createElement("button");
        btn.setAttribute("data-test-id", "always-allow");
        btn.addEventListener("click", () => approve({ remember: true }));
        root.appendChild(btn);
        return root;
      },
    };

    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      approval: { onDecision },
      plugins: [plugin],
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    injectApproval(controller);
    injectNoise(controller);

    const btn = mount.querySelector<HTMLButtonElement>('[data-test-id="always-allow"]');
    expect(btn).not.toBeNull();
    btn!.click();

    await Promise.resolve();
    expect(onDecision).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: "Search documentation" }),
      "approved",
      { remember: true }
    );
  });

  it("falls through to the built-in bubble when the plugin returns null (resolved state)", () => {
    const plugin: AgentWidgetPlugin = {
      id: "pending-only-approval",
      renderApproval: ({ message }) => {
        if (message.approval?.status !== "pending") return null;
        const root = document.createElement("div");
        root.setAttribute("data-test-id", "custom-pending");
        return root;
      },
    };

    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      plugins: [plugin],
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    // Inject directly in the resolved state: plugin opts out, built-in renders.
    injectApproval(controller, { status: "approved" });

    expect(mount.querySelector('[data-test-id="custom-pending"]')).toBeNull();
    expect(mount.querySelector("#wrapper-approval-appr-1")?.firstElementChild).toHaveProperty("style.display", "none");
  });

  it("keeps approval disclosure expansion separate for widgets with matching message ids", () => {
    const firstMount = createMount();
    const first = createAgentExperience(firstMount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
    } as unknown as Parameters<typeof createAgentExperience>[1]);
    injectApproval(first, { id: "shared" });
    toggleApprovalDetails(firstMount);
    expect(approvalDetails(firstMount).hidden).toBe(false);

    const secondMount = createMount();
    const second = createAgentExperience(secondMount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
    } as unknown as Parameters<typeof createAgentExperience>[1]);
    injectApproval(second, { id: "shared" });

    expect(approvalDetails(secondMount).hidden).toBe(true);
    first.destroy();
    second.destroy();
  });

  it("resets approval disclosure expansion on clearChat and destroy", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
    } as unknown as Parameters<typeof createAgentExperience>[1]);
    injectApproval(controller, { id: "after-clear" });
    toggleApprovalDetails(mount);
    expect(approvalDetails(mount).hidden).toBe(false);
    controller.clearChat();
    injectApproval(controller, { id: "after-clear" });
    expect(approvalDetails(mount).hidden).toBe(true);
    controller.destroy();

    const replacementMount = createMount();
    const replacement = createAgentExperience(replacementMount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
    } as unknown as Parameters<typeof createAgentExperience>[1]);
    injectApproval(replacement, { id: "after-clear" });
    expect(approvalDetails(replacementMount).hidden).toBe(true);
    replacement.destroy();
  });

  it.each(["wrapped", "null"])("uses configured defaults for %s custom renderers", (mode) => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      approval: { resolvedDisplay: "status-line" },
      plugins: [{ id: "fallback", renderApproval: ({ defaultRenderer }) => {
        if (mode === "null") return null;
        const wrapper = document.createElement("section");
        wrapper.append(defaultRenderer());
        return wrapper;
      } }],
    });
    injectApproval(controller, { status: "approved" });
    expect(mount.querySelector(".persona-approval-status")?.textContent).toBe("Allowed");
    controller.destroy();
  });

  it("preserves lifetime and DOM until replacement, then aborts before rendering and clear", () => {
    const mount = createMount();
    const signals: AbortSignal[] = [];
    const renderer = vi.fn(({ signal }: Parameters<NonNullable<AgentWidgetPlugin["renderApproval"]>>[0]) => {
      if (signals.length) expect(signals.at(-1)?.aborted).toBe(true);
      signals.push(signal!);
      return document.createElement("section");
    });
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat", launcher: { enabled: false },
      plugins: [{ id: "lifetime", renderApproval: renderer }],
    });
    injectApproval(controller);
    const element = mount.querySelector("#wrapper-approval-appr-1")?.firstElementChild;
    injectNoise(controller);
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(signals[0].aborted).toBe(false);
    expect(mount.querySelector("#wrapper-approval-appr-1")?.firstElementChild).toBe(element);
    injectApproval(controller, { status: "approved" });
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    signals[1].addEventListener("abort", () => expect(mount.contains(element ?? null)).toBe(false));
    controller.clearChat();
    expect(signals[1].aborted).toBe(true);
    injectApproval(controller);
    controller.destroy();
    expect(signals[2].aborted).toBe(true);
  });

  it("links execution only through explicit per-call ids and rebuilds on state changes", () => {
    const mount = createMount();
    const render = vi.fn(({ defaultRenderer }: Parameters<NonNullable<AgentWidgetPlugin["renderApproval"]>>[0]) => defaultRenderer());
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat", launcher: { enabled: false },
      approval: { resolvedDisplay: "status-line" },
      plugins: [{ id: "execution", renderApproval: render }],
    });
    const tool = (id: string, status: "running" | "complete", success?: boolean, executionId = "exec_1") => controller.injectTestMessage({
      type: "message", message: {
        id: `tool-${id}`, role: "assistant", content: "", createdAt: "2026-04-24T00:00:00.000Z",
        variant: "tool", toolCall: { id, name: "Search documentation", status, success },
        agentMetadata: { executionId },
      },
    });
    injectApproval(controller, { status: "approved" });
    tool("unrelated", "complete", true);
    expect(render.mock.calls.at(-1)?.[0].execution).toBeUndefined();
    injectApproval(controller, { status: "approved", toolCallId: "linked" });
    tool("linked", "complete", true, "another-turn");
    expect(render.mock.calls.at(-1)?.[0].execution).toBeUndefined();
    tool("linked", "running");
    expect(render.mock.calls.at(-1)?.[0].execution).toEqual({ toolCallId: "linked", status: "running" });
    expect(mount.querySelector(".persona-approval-status")?.textContent).toBe("Allowed · running");
    const runningSignal = render.mock.calls.at(-1)![0].signal!;
    tool("linked", "complete", true);
    expect(runningSignal.aborted).toBe(true);
    expect(mount.querySelector(".persona-approval-status")?.textContent).toBe("Completed");
    tool("linked", "complete", false);
    expect(mount.querySelector(".persona-approval-status")?.textContent).toBe("Failed");
    controller.destroy();
  });

  it("isolates renderer lifetimes between widgets with identical ids", () => {
    const signals: AbortSignal[] = [];
    const plugin: AgentWidgetPlugin = { id: "shared", renderApproval: ({ signal }) => {
      signals.push(signal!);
      return document.createElement("section");
    } };
    const first = createAgentExperience(createMount(), { apiUrl: "/chat", plugins: [plugin] });
    const secondMount = createMount();
    const second = createAgentExperience(secondMount, { apiUrl: "/chat", plugins: [plugin] });
    injectApproval(first);
    injectApproval(second);
    first.destroy();
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    expect(secondMount.querySelector("#wrapper-approval-appr-1 section")).not.toBeNull();
    second.destroy();
    expect(signals[1].aborted).toBe(true);
  });


  it("aborts before disabling approvals removes the live element", () => {
    const mount = createMount();
    let signal: AbortSignal | undefined;
    let element: HTMLElement;
    const controller = createAgentExperience(mount, { apiUrl: "/chat", plugins: [{
      id: "disable", renderApproval: (context) => {
        signal = context.signal;
        element = document.createElement("section");
        signal!.addEventListener("abort", () => expect(mount.contains(element)).toBe(true));
        return element;
      },
    }] });
    injectApproval(controller);
    controller.update({ approval: false });
    expect(signal?.aborted).toBe(true);
    expect(mount.contains(element!)).toBe(false);
    controller.destroy();
  });

  it.each([false, true])("focuses a new default approval only from widget focus (shadow=%s)", (shadow) => {
    const host = createMount();
    const mount = shadow ? document.createElement("div") : host;
    if (shadow) host.attachShadow({ mode: "open" }).append(mount);
    const controller = createAgentExperience(mount, {
      apiUrl: "/chat", launcher: { enabled: false }, approval: { keyboardShortcuts: "focused" },
    });
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    injectApproval(controller, { id: "outside" });
    expect(document.activeElement).toBe(outside);
    const inside = document.createElement("button");
    mount.append(inside);
    inside.focus();
    injectApproval(controller, { id: "inside" });
    const root = mount.getRootNode() as Document | ShadowRoot;
    expect(root.activeElement).toBe(mount.querySelector('[data-wrapper-id="approval-inside"] [data-action="allow"]'));
    inside.focus();
    injectNoise(controller);
    expect(root.activeElement).toBe(inside);
    controller.destroy();
  });

  it("fully custom renderers keep default shortcuts inactive even if a default element was discarded", () => {
    const mount = createMount();
    const onDecision = vi.fn();
    const controller = createAgentExperience(mount, {
      apiUrl: "/chat", approval: { keyboardShortcuts: "legacy", enableAlwaysAllow: true, onDecision },
      plugins: [{ id: "discard-default", renderApproval: ({ defaultRenderer }) => {
        defaultRenderer();
        return document.createElement("section");
      } }],
    });
    injectApproval(controller);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onDecision).not.toHaveBeenCalled();
    controller.destroy();
  });


  it("does not move focus from a second widget to a new approval", () => {
    const firstMount = createMount();
    const secondMount = createMount();
    const config = { apiUrl: "/chat", launcher: { enabled: false }, approval: { keyboardShortcuts: "focused" as const } };
    const first = createAgentExperience(firstMount, config);
    const second = createAgentExperience(secondMount, config);
    const secondFocus = document.createElement("button");
    secondMount.append(secondFocus);
    secondFocus.focus();
    injectApproval(first);
    expect(document.activeElement).toBe(secondFocus);
    injectApproval(second);
    expect(document.activeElement).toBe(secondMount.querySelector('[data-action="allow"]'));
    first.destroy();
    second.destroy();
  });

});


it("keeps compact approval disclosure clickable after injection and unrelated rerenders", () => {
  const mount = createMount();
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat", launcher: { enabled: false },
    future: { v5Defaults: true },
  });
  injectApproval(controller, { status: "approved" });
  const head = mount.querySelector<HTMLButtonElement>(".persona-approval-row .persona-approval-head")!;
  expect(head).not.toBeNull();
  head.click();
  expect(head.getAttribute("aria-expanded")).toBe("true");
  expect(approvalDetails(mount).hidden).toBe(false);
  injectNoise(controller);
  expect(mount.querySelector(".persona-approval-head")).toBe(head);
  head.click();
  expect(head.getAttribute("aria-expanded")).toBe("false");
  expect(approvalDetails(mount).hidden).toBe(true);
  head.click();
  expect(approvalDetails(mount).hidden).toBe(false);
  controller.destroy();
});
