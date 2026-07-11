// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import type { AgentWidgetStoredState } from "./types";
import { createUnifiedEventWrite } from "./utils/__fixtures__/unified-translator.oracle";

type RafCallback = (time: number) => void;

const installRafMock = () => {
  let nextId = 1;
  let now = 0;
  const callbacks = new Map<number, RafCallback>();
  vi.stubGlobal("requestAnimationFrame", (callback: RafCallback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  return {
    step() {
      const pending = [...callbacks.values()];
      callbacks.clear();
      now += 16;
      pending.forEach((callback) => callback(now));
    },
    flush() {
      for (let count = 0; callbacks.size > 0 && count < 20; count += 1) this.step();
      if (callbacks.size > 0) throw new Error("RAF queue did not settle");
    },
  };
};

const flushMicrotasks = async (times = 20) => {
  for (let index = 0; index < times; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const legacyEvent = (type: string, data: Record<string, unknown>) =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;

const createStreamHarness = () => {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let write: ((frame: string) => void) | null = null;
  const fetchMock = vi.fn(async () =>
    new Response(new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController;
        write = createUnifiedEventWrite((chunk) => {
          streamController.enqueue(encoder.encode(chunk));
        });
      },
    }))
  );
  return {
    fetchMock,
    send(type: string, data: Record<string, unknown>) {
      if (!write) throw new Error("stream not started");
      write(legacyEvent(type, data));
    },
    close() {
      controller?.close();
    },
  };
};

const startTurn = async (mount: HTMLElement) => {
  const input = mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")!;
  input.value = "start";
  mount.querySelector<HTMLButtonElement>("[data-persona-composer-submit]")!.click();
  await flushMicrotasks();
};

const startText = (stream: ReturnType<typeof createStreamHarness>, deltas: string[]) => {
  stream.send("flow_start", { flowId: "flow_1", flowName: "Test", totalSteps: 1 });
  stream.send("step_start", {
    id: "step_1",
    name: "Prompt",
    stepType: "prompt",
    index: 0,
    totalSteps: 1,
  });
  stream.send("text_start", { messageId: "message_1" });
  deltas.forEach((text) => stream.send("step_delta", { id: "step_1", text }));
};

const finishText = (stream: ReturnType<typeof createStreamHarness>) => {
  stream.send("text_end", { messageId: "message_1" });
  stream.send("step_complete", {
    id: "step_1",
    name: "Prompt",
    stepType: "prompt",
    success: true,
    result: { response: "Hello world" },
  });
  stream.send("flow_complete", { flowId: "flow_1", success: true });
  stream.close();
};

const createWidget = (save: (state: AgentWidgetStoredState) => void) => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    storageAdapter: { save },
  });
  return { mount, controller };
};

describe("pure streaming text update coalescing", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("coalesces same-message text deltas and flushes the terminal state", async () => {
    const raf = installRafMock();
    const stream = createStreamHarness();
    global.fetch = stream.fetchMock;
    const saves: AgentWidgetStoredState[] = [];
    const { mount, controller } = createWidget((state) => saves.push(state));
    await startTurn(mount);

    startText(stream, ["Hel"]);
    await flushMicrotasks();
    const afterFirstDelta = saves.length;
    stream.send("step_delta", { id: "step_1", text: "lo" });
    stream.send("step_delta", { id: "step_1", text: " world" });
    await flushMicrotasks();

    expect(saves).toHaveLength(afterFirstDelta);
    expect(mount.textContent).not.toContain("Hello world");
    raf.step();
    expect(saves).toHaveLength(afterFirstDelta + 1);
    expect(mount.textContent).toContain("Hello world");

    finishText(stream);
    await flushMicrotasks(40);
    expect(controller.getState().streaming).toBe(false);
    expect(saves.at(-1)?.messages?.at(-1)?.content).toBe("Hello world");
    controller.destroy();
  });

  it("flushes pending text and applies ask, tool, and approval insertions immediately", async () => {
    installRafMock();
    const stream = createStreamHarness();
    global.fetch = stream.fetchMock;
    const save = vi.fn();
    const { mount, controller } = createWidget(save);
    await startTurn(mount);

    startText(stream, ["Hel", "lo"]);
    await flushMicrotasks();
    const beforeAsk = save.mock.calls.length;
    controller.injectTestMessage({
      type: "message",
      message: {
        id: "ask-1",
        role: "assistant",
        content: "",
        createdAt: "2026-07-11T00:00:00.000Z",
        streaming: false,
        variant: "tool",
        toolCall: {
          id: "ask-1",
          name: "ask_user_question",
          status: "complete",
          args: { questions: [{ question: "Choose now", options: [{ label: "Yes" }] }] },
          chunks: [],
        },
        agentMetadata: { executionId: "exec-1", awaitingLocalTool: true },
      },
    });
    expect(save.mock.calls.length).toBeGreaterThan(beforeAsk);
    expect(mount.textContent).toContain("Hello");
    expect(mount.querySelector("[data-persona-ask-sheet-for]")).not.toBeNull();

    const beforeTool = save.mock.calls.length;
    controller.injectTestMessage({
      type: "message",
      message: {
        id: "tool-1",
        role: "assistant",
        content: "",
        createdAt: "2026-07-11T00:00:01.000Z",
        streaming: true,
        variant: "tool",
        toolCall: { id: "tool-1", name: "search", status: "running", chunks: [] },
      },
    });
    expect(save.mock.calls.length).toBeGreaterThan(beforeTool);
    expect(mount.textContent).toContain("search");

    const beforeApproval = save.mock.calls.length;
    controller.injectTestMessage({
      type: "message",
      message: {
        id: "approval-1",
        role: "assistant",
        content: "",
        createdAt: "2026-07-11T00:00:02.000Z",
        streaming: false,
        variant: "approval",
        approval: {
          id: "approval-1",
          status: "pending",
          agentId: "agent-1",
          executionId: "exec-1",
          toolName: "Approve search",
          description: "Approval test",
        },
      },
    });
    expect(save.mock.calls.length).toBeGreaterThan(beforeApproval);
    expect(mount.textContent).toContain("Approve search");
    controller.destroy();
    stream.close();
  });

  it("flushes pending text when a different message changes", async () => {
    installRafMock();
    const stream = createStreamHarness();
    global.fetch = stream.fetchMock;
    const save = vi.fn();
    const { mount, controller } = createWidget(save);
    await startTurn(mount);
    startText(stream, ["one", " two"]);
    await flushMicrotasks();
    const userMessage = controller.getMessages().find((message) => message.role === "user")!;
    const beforeUpdate = save.mock.calls.length;

    controller.injectTestMessage({
      type: "message",
      message: {
        ...userMessage,
        content: "changed user message",
      },
    });

    expect(save.mock.calls.length).toBeGreaterThan(beforeUpdate);
    expect(mount.textContent).toContain("changed user message");
    expect(mount.textContent).toContain("one two");
    controller.destroy();
    stream.close();
  });

  it("discards pending pre-clear text instead of replaying it", async () => {
    const raf = installRafMock();
    const stream = createStreamHarness();
    global.fetch = stream.fetchMock;
    const saves: AgentWidgetStoredState[] = [];
    const clear = vi.fn();
    const mount = document.createElement("div");
    document.body.appendChild(mount);
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      storageAdapter: {
        save: (state) => {
          saves.push(state);
        },
        clear,
      },
    });
    await startTurn(mount);
    startText(stream, ["one", " two"]);
    await flushMicrotasks();

    controller.clearChat();
    raf.flush();

    expect(controller.getMessages()).toEqual([]);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(
      saves.some((state) =>
        state.messages?.some((message) => message.content === "one two")
      )
    ).toBe(false);
    stream.close();
  });

  it("flushes final pending text before destroy teardown", async () => {
    const raf = installRafMock();
    const stream = createStreamHarness();
    global.fetch = stream.fetchMock;
    const saves: AgentWidgetStoredState[] = [];
    const { mount, controller } = createWidget((state) => saves.push(state));
    await startTurn(mount);
    startText(stream, ["one", " two"]);
    await flushMicrotasks();
    const beforeDestroy = saves.length;

    controller.destroy();
    raf.flush();

    expect(saves).toHaveLength(beforeDestroy + 1);
    expect(saves.at(-1)?.messages?.at(-1)?.content).toBe("one two");
    stream.close();
  });
});
