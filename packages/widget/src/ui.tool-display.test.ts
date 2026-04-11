// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import type { AgentWidgetController } from "./ui";

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

const injectToolMessage = (
  controller: AgentWidgetController,
  {
    id,
    name,
    status = "running",
    chunks = [],
  }: {
    id: string;
    name?: string;
    status?: "pending" | "running" | "complete";
    chunks?: string[];
  }
) => {
  controller.injectTestMessage({
    type: "message",
    message: {
      id,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      streaming: status !== "complete",
      variant: "tool",
      toolCall: {
        id,
        name,
        status,
        chunks,
      },
    },
  });
};

const injectReasoningMessage = (
  controller: AgentWidgetController,
  {
    id,
    status = "streaming",
    chunks = [],
  }: {
    id: string;
    status?: "pending" | "streaming" | "complete";
    chunks?: string[];
  }
) => {
  controller.injectTestMessage({
    type: "message",
    message: {
      id,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      streaming: status !== "complete",
      variant: "reasoning",
      reasoning: {
        id,
        status,
        chunks,
      },
    },
  });
};

describe("createAgentExperience tool call display modes", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: (time: number) => void) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("keeps collapsed tool rows on the generic summary by default", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
    });

    injectToolMessage(controller, {
      id: "tool-1",
      name: "Get platform documentation",
      chunks: ["Loaded tools, used Runtype integration"],
    });

    const header = mount.querySelector(".persona-tool-bubble button[data-expand-header='true']");
    expect(header?.textContent).toContain("Using tool...");
    expect(header?.textContent).not.toContain("Get platform documentation");

    controller.destroy();
  });

  it("shows the tool name in collapsed rows when configured", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: {
        toolCallDisplay: {
          collapsedMode: "tool-name",
        },
      },
    } as any);

    injectToolMessage(controller, {
      id: "tool-1",
      name: "Get platform documentation",
      chunks: ["Loaded tools, used Runtype integration"],
    });

    const header = mount.querySelector(".persona-tool-bubble button[data-expand-header='true']");
    expect(header?.textContent).toContain("Get platform documentation");

    controller.destroy();
  });

  it("renders a collapsed preview for active tool rows when enabled", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: {
        toolCallDisplay: {
          activePreview: true,
        },
      },
    } as any);

    injectToolMessage(controller, {
      id: "tool-1",
      name: "Get platform documentation",
      chunks: ["Loaded tools, used Runtype integration"],
    });

    const preview = mount.querySelector("[data-persona-collapsed-preview='tool']");
    expect(preview?.textContent).toContain("Loaded tools, used Runtype integration");

    controller.destroy();
  });

  it("renders a collapsed preview for active reasoning rows when enabled", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: {
        reasoningDisplay: {
          activePreview: true,
        },
      },
    } as any);

    injectReasoningMessage(controller, {
      id: "reason-1",
      chunks: ["Now let me get the Persona embed documentation and builtin tools catalog."],
    });

    const preview = mount.querySelector("[data-persona-collapsed-preview='reasoning']");
    expect(preview?.textContent).toContain("Now let me get the Persona embed documentation");

    controller.destroy();
  });

  it("groups consecutive tool calls when enabled", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: {
        toolCallDisplay: {
          grouped: true,
        },
      },
    } as any);

    injectToolMessage(controller, { id: "tool-1", name: "Load tools", chunks: ["Loaded tools"] });
    injectToolMessage(controller, { id: "tool-2", name: "Get docs", chunks: ["Fetched docs"] });

    const group = mount.querySelector("[data-persona-tool-group='true']");
    expect(group).not.toBeNull();
    expect(group?.textContent).toContain("Called 2 tools");

    controller.destroy();
  });
});
