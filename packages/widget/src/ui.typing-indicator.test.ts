// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

/**
 * Mount a widget with a never-resolving fetch, send a message, and return the
 * standalone typing indicator bubble rendered during the silent gap.
 */
const renderTypingBubble = async (
  config: Record<string, unknown>
): Promise<{ bubble: HTMLElement; destroy: () => void }> => {
  global.fetch = vi.fn().mockImplementation(
    () => new Promise(() => {})
  ) as unknown as typeof fetch;

  const mount = createMount();
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    ...config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);

  controller.submitMessage("hello");
  await Promise.resolve();
  await Promise.resolve();

  const bubble = mount.querySelector<HTMLElement>('[data-typing-indicator="true"]')!;
  return { bubble, destroy: () => controller.destroy() };
};

describe("standalone typing indicator bubble", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    if (typeof localStorage !== "undefined") localStorage.clear();
    vi.restoreAllMocks();
  });

  it("uses the assistant bubble classes under the default bubble layout", async () => {
    const { bubble, destroy } = await renderTypingBubble({});

    expect(bubble).not.toBeNull();
    expect(bubble.classList.contains("persona-message-assistant-bubble")).toBe(true);
    expect(bubble.classList.contains("persona-shadow-sm")).toBe(true);
    expect(bubble.classList.contains("persona-border")).toBe(true);
    expect(bubble.classList.contains("persona-px-5")).toBe(true);

    destroy();
  });

  it("drops the shadow and border under the minimal layout", async () => {
    const { bubble, destroy } = await renderTypingBubble({
      layout: { messages: { layout: "minimal" } },
    });

    expect(bubble.classList.contains("persona-message-assistant-bubble")).toBe(true);
    expect(bubble.classList.contains("persona-shadow-sm")).toBe(false);
    expect(bubble.classList.contains("persona-border")).toBe(false);
    expect(bubble.classList.contains("persona-px-3")).toBe(true);
    // Minimal keeps the surface background, matching its message bubbles.
    expect(bubble.style.backgroundColor).toContain("--persona-message-assistant-bg");

    destroy();
  });

  it("drops the background entirely under the flat layout", async () => {
    const { bubble, destroy } = await renderTypingBubble({
      layout: { messages: { layout: "flat" } },
    });

    expect(bubble.classList.contains("persona-shadow-sm")).toBe(false);
    expect(bubble.classList.contains("persona-border")).toBe(false);
    expect(bubble.style.backgroundColor).toBe("");
    expect(bubble.style.color).toBe(
      "var(--persona-message-assistant-text, var(--persona-text))"
    );

    destroy();
  });

  it("renders bare text classes when loadingIndicator.showBubble is false", async () => {
    const { bubble, destroy } = await renderTypingBubble({
      loadingIndicator: { showBubble: false },
    });

    expect(bubble.classList.contains("persona-message-assistant-bubble")).toBe(false);
    expect(bubble.classList.contains("persona-shadow-sm")).toBe(false);
    expect(bubble.classList.contains("persona-border")).toBe(false);
    expect(bubble.classList.contains("persona-text-persona-text")).toBe(true);
    expect(bubble.classList.contains("persona-text-persona-primary")).toBe(false);
    expect(bubble.style.backgroundColor).toBe("");

    destroy();
  });

  it("honors the assistant bubble theme background token", async () => {
    const { bubble, destroy } = await renderTypingBubble({
      layout: { messages: { layout: "minimal" } },
      theme: {
        semantic: {
          colors: {
            container: "#112233",
            text: "#ddeeff",
            border: "#445566",
          },
        },
      },
    });

    // The bubble reads the same variable the assistant message bubbles read,
    // so `theme.components.message.assistant.background` covers both.
    expect(bubble.style.backgroundColor).toBe(
      "var(--persona-message-assistant-bg, var(--persona-container))"
    );
    const root = bubble.closest<HTMLElement>("[data-persona-root]");
    expect(root?.style.getPropertyValue("--persona-message-assistant-bg")).toBe(
      "#112233"
    );
    expect(root?.style.getPropertyValue("--persona-message-assistant-text")).toBe(
      "#ddeeff"
    );
    expect(root?.style.getPropertyValue("--persona-message-assistant-border")).toBe(
      "#445566"
    );

    destroy();
  });
});

/**
 * Regression coverage for hidden tool/reasoning rows. With
 * `features.showToolCalls: false` the tool row never renders, so it must not
 * count as "the assistant is already responding" and hide the standalone dots
 * for the whole tool phase.
 */
describe("standalone typing indicator with hidden activity rows", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    if (typeof localStorage !== "undefined") localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // Streaming transcript updates render once per animation frame; queue the
  // frames so each injection can be rendered synchronously.
  let frames = new Map<number, (time: number) => void>();
  let nextFrameId = 1;
  const renderFrame = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
  };

  const mountStreaming = async (config: Record<string, unknown>) => {
    frames = new Map();
    vi.stubGlobal("requestAnimationFrame", (callback: (time: number) => void) => {
      const id = nextFrameId++;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    global.fetch = vi.fn().mockImplementation(
      () => new Promise(() => {})
    ) as unknown as typeof fetch;

    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      ...config,
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    controller.submitMessage("hello");
    await Promise.resolve();
    await Promise.resolve();
    return { mount, controller };
  };

  // The session orders by createdAt first, then by its Date.now()-based
  // sequence, so injected rows need both stamped in the future to sort after
  // the user message the way real stream rows do.
  const seq = (n: number) => Date.now() + 60_000 + n;
  const at = (n: number) => new Date(seq(n)).toISOString();

  const injectTool = (
    controller: ReturnType<typeof createAgentExperience>,
    id: string,
    status: "running" | "complete",
    sequence: number
  ) => {
    controller.injectTestMessage({
      type: "message",
      message: {
        id,
        role: "assistant",
        content: "",
        createdAt: new Date(sequence).toISOString(),
        sequence,
        streaming: status !== "complete",
        variant: "tool",
        toolCall: { id, name: "lookup", status },
      },
    });
    renderFrame();
  };

  const injectReasoning = (
    controller: ReturnType<typeof createAgentExperience>,
    id: string,
    status: "streaming" | "complete",
    sequence: number
  ) => {
    controller.injectTestMessage({
      type: "message",
      message: {
        id,
        role: "assistant",
        content: "",
        createdAt: new Date(sequence).toISOString(),
        sequence,
        streaming: status !== "complete",
        variant: "reasoning",
        reasoning: { id, status, chunks: ["thinking"] },
      },
    });
    renderFrame();
  };

  const typingIndicator = (mount: HTMLElement) =>
    mount.querySelector<HTMLElement>('[data-typing-indicator="true"]');


  it("keeps the dots while a hidden tool call is running", async () => {
    const { mount, controller } = await mountStreaming({
      features: { showToolCalls: false },
    });
    expect(typingIndicator(mount)).not.toBeNull();

    injectTool(controller, "tool-1", "running", seq(1));
    expect(mount.querySelector(".persona-tool-bubble")).toBeNull();
    expect(typingIndicator(mount)).not.toBeNull();

    controller.destroy();
  });

  it("keeps the dots after a hidden tool call completes, before the next text", async () => {
    const { mount, controller } = await mountStreaming({
      features: { showToolCalls: false },
    });

    injectTool(controller, "tool-1", "running", seq(1));
    injectTool(controller, "tool-1", "complete", seq(1));
    expect(mount.querySelector(".persona-tool-bubble")).toBeNull();
    expect(typingIndicator(mount)).not.toBeNull();

    controller.destroy();
  });

  it("keeps the dots when a hidden tool call follows an intermediate assistant text", async () => {
    const { mount, controller } = await mountStreaming({
      features: { showToolCalls: false },
    });

    controller.injectTestMessage({
      type: "message",
      message: {
        id: "text-1",
        role: "assistant",
        content: "Let me look that up.",
        createdAt: at(1),
        sequence: seq(1),
        streaming: false,
      },
    });
    injectTool(controller, "tool-1", "complete", seq(2));
    expect(typingIndicator(mount)).not.toBeNull();

    controller.destroy();
  });

  it("still hides the dots while a visible tool call renders its own bubble", async () => {
    const { mount, controller } = await mountStreaming({
      features: { showToolCalls: true },
    });

    injectTool(controller, "tool-1", "running", seq(1));
    expect(mount.querySelector(".persona-tool-bubble")).not.toBeNull();
    expect(typingIndicator(mount)).toBeNull();

    controller.destroy();
  });

  it("keeps the dots while hidden reasoning streams", async () => {
    const { mount, controller } = await mountStreaming({
      features: { showReasoning: false },
    });

    injectReasoning(controller, "reason-1", "streaming", seq(1));
    expect(typingIndicator(mount)).not.toBeNull();

    injectReasoning(controller, "reason-1", "complete", seq(1));
    expect(typingIndicator(mount)).not.toBeNull();

    controller.destroy();
  });

  it("keeps the dots after a visible tool call is removed by completedVisibility", async () => {
    const { mount, controller } = await mountStreaming({
      features: {
        showToolCalls: true,
        toolCallDisplay: { completedVisibility: "removed" },
      },
    });

    injectTool(controller, "tool-1", "running", seq(1));
    expect(mount.querySelector(".persona-tool-bubble")).not.toBeNull();
    expect(typingIndicator(mount)).toBeNull();

    injectTool(controller, "tool-1", "complete", seq(1));
    expect(mount.querySelector(".persona-tool-bubble")).toBeNull();
    expect(typingIndicator(mount)).not.toBeNull();

    controller.destroy();
  });

  it("keeps the dots after visible reasoning is removed by completedVisibility", async () => {
    const { mount, controller } = await mountStreaming({
      features: {
        showReasoning: true,
        reasoningDisplay: { completedVisibility: "removed" },
      },
    });

    injectReasoning(controller, "reason-1", "streaming", seq(1));
    expect(typingIndicator(mount)).toBeNull();

    injectReasoning(controller, "reason-1", "complete", seq(1));
    expect(typingIndicator(mount)).not.toBeNull();

    controller.destroy();
  });

  it("hides the dots once a real assistant message is streaming", async () => {
    const { mount, controller } = await mountStreaming({
      features: { showToolCalls: false },
    });

    injectTool(controller, "tool-1", "complete", seq(1));
    controller.injectTestMessage({
      type: "message",
      message: {
        id: "text-1",
        role: "assistant",
        content: "Here you go",
        createdAt: at(2),
        sequence: seq(2),
        streaming: true,
      },
    });
    renderFrame();
    expect(typingIndicator(mount)).toBeNull();

    controller.destroy();
  });
});
