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
      // Real stream updates reuse the original tool message's timeline fields.
      // Keep them stable here so an upsert does not reorder the group.
      createdAt: "2026-01-01T00:00:00.000Z",
      sequence: Number(id.match(/(\d+)$/)?.[1] ?? 0),
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
    window.localStorage.clear();
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

  it("preserves a custom collapsed summary across tool chunk updates", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: {
        toolCallDisplay: {
          grouped: false,
          expandable: false,
          loadingAnimation: "none",
        },
      },
      toolCall: {
        renderCollapsedSummary: ({ toolCall }: any) => {
          const summary = document.createElement("span");
          summary.setAttribute("data-test-collapsed-summary", "true");
          summary.textContent = `${toolCall.name}:${toolCall.status}`;
          return summary;
        },
      },
    } as any);

    injectToolMessage(controller, {
      id: "tool-1",
      name: "Run SQL",
      chunks: ["starting"],
    });
    const bubble = mount.querySelector("#bubble-tool-1");
    const summary = mount.querySelector("[data-test-collapsed-summary='true']");

    injectToolMessage(controller, {
      id: "tool-1",
      name: "Run SQL",
      chunks: ["starting", "received rows"],
    });

    expect(mount.querySelector("#bubble-tool-1")).toBe(bubble);
    expect(mount.querySelector("[data-test-collapsed-summary='true']")).toBe(summary);

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

  it("preserves tool rows when a standalone row becomes a stacked group", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: {
        toolCallDisplay: {
          grouped: true,
          groupedMode: "stack",
        },
      },
    } as any);

    injectToolMessage(controller, { id: "tool-1", name: "Inspect data" });

    const firstRow = mount.querySelector("#wrapper-tool-1");
    const firstBubble = mount.querySelector("#bubble-tool-1");
    expect(firstRow).not.toBeNull();
    expect(firstBubble).not.toBeNull();

    injectToolMessage(controller, { id: "tool-2", name: "Run analysis" });

    const groupRow = mount.querySelector("[data-persona-tool-group-row='true']");
    expect(groupRow).not.toBeNull();
    expect(mount.querySelector("#wrapper-tool-1")).toBe(firstRow);
    expect(mount.querySelector("#bubble-tool-1")).toBe(firstBubble);

    injectToolMessage(controller, { id: "tool-3", name: "Build chart" });
    expect(mount.querySelector("[data-persona-tool-group-row='true']")).toBe(groupRow);
    expect(mount.querySelector("#wrapper-tool-1")).toBe(firstRow);
    expect(mount.querySelector("#bubble-tool-1")).toBe(firstBubble);

    controller.destroy();
  });

  it("keeps tool calls grouped across reasoning that is hidden", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: {
        showReasoning: false,
        toolCallDisplay: {
          grouped: true,
        },
      },
    } as any);

    injectToolMessage(controller, { id: "tool-1", name: "Inspect data" });
    injectReasoningMessage(controller, { id: "reason-1", chunks: ["Choosing a query"] });
    injectToolMessage(controller, { id: "tool-2", name: "Run analysis" });

    const group = mount.querySelector("[data-persona-tool-group='true']");
    expect(group).not.toBeNull();
    expect(group?.querySelectorAll("[data-persona-tool-group-item]")).toHaveLength(2);

    controller.destroy();
  });

  it("keeps a summary group's visible DOM stable from the first tool onward", () => {
    const mount = createMount();
    const renderedSummaries: HTMLElement[] = [];
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: {
        toolCallDisplay: {
          collapsedMode: "tool-name",
          activePreview: false,
          grouped: true,
          groupedMode: "summary",
          expandable: false,
          loadingAnimation: "shimmer-color",
        },
      },
      toolCall: {
        renderCollapsedSummary: ({ message, toolCall }: any) => {
          const step = document.createElement("span");
          step.setAttribute("data-test-collapsed-step", message.id);
          step.textContent = `${toolCall.name}:${toolCall.status}`;
          return step;
        },
        renderGroupedSummary: ({ toolCalls }: any) => {
          const list = document.createElement("span");
          list.setAttribute("data-test-activity-list", "true");
          toolCalls.forEach((toolCall: { id: string; status: string }) => {
            const step = document.createElement("span");
            step.setAttribute("data-test-activity-step", toolCall.id);
            step.textContent = `${toolCall.id}:${toolCall.status}`;
            list.appendChild(step);
          });
          renderedSummaries.push(list);
          return list;
        },
      },
    } as any);

    injectToolMessage(controller, {
      id: "tool-1",
      name: "Inspect data",
      status: "pending",
    });

    const groupRow = mount.querySelector("[data-persona-tool-group-row='true']");
    const activityList = mount.querySelector("[data-test-activity-list='true']");
    const firstStep = mount.querySelector("[data-test-activity-step='tool-1']");
    expect(groupRow).not.toBeNull();
    expect(groupRow?.getAttribute("data-wrapper-id")).toBe("tool-group-tool-1");
    expect(activityList).not.toBeNull();
    expect(firstStep).not.toBeNull();
    expect(mount.querySelector(".persona-tool-bubble")).toBeNull();

    injectToolMessage(controller, {
      id: "tool-1",
      name: "Inspect data",
      status: "running",
      chunks: ["starting"],
    });
    expect(mount.querySelector("[data-persona-tool-group-row='true']")).toBe(groupRow);
    expect(mount.querySelector("[data-test-activity-list='true']")).toBe(activityList);
    expect(mount.querySelector("[data-test-activity-step='tool-1']")).toBe(firstStep);

    injectToolMessage(controller, {
      id: "tool-1",
      name: "Inspect data",
      chunks: ["starting", "received rows"],
    });
    expect(mount.querySelector("[data-persona-tool-group-row='true']")).toBe(groupRow);
    expect(mount.querySelector("[data-test-activity-list='true']")).toBe(activityList);
    expect(mount.querySelector("[data-test-activity-step='tool-1']")).toBe(firstStep);

    injectToolMessage(controller, { id: "tool-2", name: "Run analysis" });

    const secondStep = mount.querySelector("[data-test-activity-step='tool-2']");
    expect(mount.querySelector("[data-persona-tool-group-row='true']")).toBe(groupRow);
    expect(mount.querySelector("[data-test-activity-list='true']")).toBe(activityList);
    expect(mount.querySelector("[data-test-activity-step='tool-1']")).toBe(firstStep);
    expect(secondStep).not.toBeNull();
    expect(mount.querySelector(".persona-tool-bubble")).toBeNull();

    injectToolMessage(controller, {
      id: "tool-1",
      name: "Inspect data",
      status: "complete",
      chunks: ["starting", "received rows"],
    });
    expect(mount.querySelector("[data-persona-tool-group-row='true']")).toBe(groupRow);
    expect(mount.querySelector("[data-test-activity-list='true']")).toBe(activityList);
    expect(mount.querySelector("[data-test-activity-step='tool-1']")).toBe(firstStep);
    expect(mount.querySelector("[data-test-activity-step='tool-2']")).toBe(secondStep);
    expect(firstStep?.textContent).toBe("tool-1:complete");
    expect(secondStep?.textContent).toBe("tool-2:running");

    injectToolMessage(controller, {
      id: "tool-2",
      name: "Run analysis",
      status: "complete",
    });
    expect(mount.querySelector("[data-persona-tool-group-row='true']")).toBe(groupRow);
    expect(mount.querySelector("[data-test-activity-list='true']")).toBe(activityList);
    expect(mount.querySelector("[data-test-activity-step='tool-1']")).toBe(firstStep);
    expect(mount.querySelector("[data-test-activity-step='tool-2']")).toBe(secondStep);
    expect(secondStep?.textContent).toBe("tool-2:complete");
    expect(mount.querySelector(".persona-tool-bubble")).toBeNull();

    // The callback can return a fresh tree on every status update; idiomorph
    // must reconcile it into the existing visible summary rather than mounting
    // those detached callback results.
    expect(renderedSummaries.length).toBeGreaterThan(1);
    expect(renderedSummaries).not.toContain(activityList);

    controller.destroy();
  });
});
