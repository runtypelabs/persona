// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import type { AgentWidgetPlugin } from "./plugins/types";
import type { AgentWidgetConfig, AgentWidgetMessage } from "./types";

// Persona marks an ask_user_question call "complete" as soon as its `await`
// arrives, while the question is still waiting on the person.
const question: AgentWidgetMessage = {
  id: "ask-1", role: "assistant", content: "", createdAt: "2026-04-24T00:00:02.000Z", sequence: 2,
  streaming: false, variant: "tool",
  toolCall: { id: "ask-1", name: "ask_user_question", status: "complete", chunks: [],
    args: { questions: [{ question: "Which audience?", options: [{ label: "Hobbyists" }, { label: "Pros" }] }] } },
  agentMetadata: { executionId: "exec_123", awaitingLocalTool: true },
};
const tool = (id: string, sequence: number): AgentWidgetMessage => ({
  id, role: "assistant", content: "", createdAt: `2026-04-24T00:00:0${sequence}.000Z`, sequence,
  streaming: false, variant: "tool", toolCall: { id, name: "search", status: "complete", chunks: ["done"] },
});

const removed = { toolCallDisplay: { completedVisibility: "removed" as const } };
const askPlugin = (render = vi.fn<NonNullable<AgentWidgetPlugin["renderAskUserQuestion"]>>(({ resolve }) => {
  const root = document.createElement("div");
  root.setAttribute("data-test-id", "plugin-question");
  const pick = document.createElement("button");
  pick.setAttribute("data-test-id", "pick-Hobbyists");
  pick.addEventListener("click", () => resolve("Hobbyists"));
  root.appendChild(pick);
  return root;
})): AgentWidgetPlugin & { render: typeof render } => ({ id: "asker", renderAskUserQuestion: render, render });

let controller: ReturnType<typeof createAgentExperience> | undefined;
const mountWith = (config: Partial<AgentWidgetConfig>, messages: AgentWidgetMessage[]) => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat", launcher: { enabled: false }, ...config,
  });
  for (const message of messages) controller.injectTestMessage({ type: "message", message: structuredClone(message) });
  return mount;
};
const row = (mount: HTMLElement, id: string) => mount.querySelector(`[data-wrapper-id="${id}"]`);
const sheet = (mount: HTMLElement) => mount.querySelector('[data-persona-ask-sheet-for="ask-1"]');

afterEach(() => {
  controller?.destroy();
  controller = undefined;
  document.body.innerHTML = "";
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('ask_user_question with toolCallDisplay.completedVisibility: "removed"', () => {
  it("keeps a pending question on the built-in sheet while ordinary completed tools are removed", () => {
    const mount = mountWith({ features: removed }, [tool("search-1", 1), question]);
    expect(sheet(mount)).not.toBeNull();
    expect(sheet(mount)?.textContent).toContain("Which audience?");
    expect(row(mount, "search-1")).toBeNull();
  });

  it("keeps a pending question rendered by a renderAskUserQuestion plugin", () => {
    const plugin = askPlugin();
    const mount = mountWith({ features: removed, plugins: [plugin] }, [tool("search-1", 1), question]);
    expect(plugin.render).toHaveBeenCalled();
    expect(row(mount, "ask-1")?.querySelector('[data-test-id="plugin-question"]')).not.toBeNull();
    expect(row(mount, "search-1")).toBeNull();
  });

  it("keeps the answered question's Q→A transcript", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({ start(c) {
        c.enqueue(new TextEncoder().encode('data: {"type":"execution_complete","success":true}\n\n'));
        c.close();
      } }),
    }) as unknown as typeof fetch;
    const mount = mountWith({ features: removed, plugins: [askPlugin()] }, [tool("search-1", 1), question]);
    mount.querySelector<HTMLButtonElement>('[data-test-id="pick-Hobbyists"]')!.click();
    await vi.waitFor(() => expect(mount.textContent).toContain("Hobbyists"));
    // Answered, the tool row gives way to the injected question and answer bubbles.
    expect(mount.querySelector('[data-test-id="plugin-question"]')).toBeNull();
    expect(mount.textContent).toContain("Which audience?");
    expect(row(mount, "search-1")).toBeNull();
  });

  it.each([
    ["no plugin", [] as AgentWidgetPlugin[]],
    ["a renderAskUserQuestion plugin", [askPlugin()]],
  ])("removes the question like any completed tool when the feature is off (%s)", (_label, plugins) => {
    const features = { ...removed, askUserQuestion: { enabled: false } };
    const mount = mountWith({ features, plugins }, [tool("search-1", 1), question]);
    expect(row(mount, "ask-1")).toBeNull();
    expect(sheet(mount)).toBeNull();
    expect(row(mount, "search-1")).toBeNull();
  });
});

describe("ask_user_question with the feature off", () => {
  const grouped = { toolCallDisplay: { grouped: true, groupedMode: "stack" as const, groupBoundary: "adjacent" as const } };
  const after = tool("search-3", 3);

  it.each([
    ["no plugin", [] as AgentWidgetPlugin[]],
    ["a renderAskUserQuestion plugin", [askPlugin()]],
  ])("renders it as a tool card grouped with its neighbors (%s)", (_label, plugins) => {
    const features = { ...grouped, askUserQuestion: { enabled: false } };
    const mount = mountWith({ features, plugins }, [tool("search-1", 1), question, after]);
    const groups = mount.querySelectorAll("[data-persona-tool-group-row]");
    expect(groups).toHaveLength(1);
    for (const id of ["search-1", "ask-1", "search-3"]) expect(groups[0].querySelector(`[data-wrapper-id="${id}"]`)).not.toBeNull();
    expect(sheet(mount)).toBeNull();
    for (const plugin of plugins) expect(plugin.renderAskUserQuestion).not.toHaveBeenCalled();
  });

  it("keeps it outside the tool group while the feature is on", () => {
    const plugin = askPlugin();
    const mount = mountWith({ features: grouped, plugins: [plugin] }, [tool("search-1", 1), question, after]);
    expect(mount.querySelector("[data-persona-tool-group-row]")).toBeNull();
    expect(row(mount, "ask-1")?.querySelector('[data-test-id="plugin-question"]')).not.toBeNull();
  });
});
