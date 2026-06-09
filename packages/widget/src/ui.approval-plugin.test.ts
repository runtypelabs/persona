// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import type { AgentWidgetPlugin } from "./plugins/types";

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

const injectApproval = (
  controller: ReturnType<typeof createAgentExperience>,
  {
    id = "appr-1",
    status = "pending" as "pending" | "approved" | "denied",
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
        // Single delegated listener at the root — the recommended pattern.
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
    // Force a re-render — the scenario where innerHTML morph drops listeners
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

    // Inject directly in the resolved state — plugin opts out, built-in renders.
    injectApproval(controller, { status: "approved" });

    expect(mount.querySelector('[data-test-id="custom-pending"]')).toBeNull();
    expect(mount.querySelector(".persona-approval-bubble")).not.toBeNull();
  });
});
