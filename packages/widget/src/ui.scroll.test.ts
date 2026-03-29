// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";

type RafCallback = FrameRequestCallback;

const STREAM_MESSAGE_ID = "ast-stream";
const STREAM_CREATED_AT = "2026-03-29T00:00:00.000Z";

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

const getScrollToBottomButton = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>("[data-persona-scroll-to-bottom]");

const installRafMock = () => {
  let nextId = 1;
  let now = performance.now();
  const callbacks = new Map<number, RafCallback>();

  vi.stubGlobal("requestAnimationFrame", (callback: RafCallback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  });

  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    callbacks.delete(id);
  });

  return {
    flush(maxFrames = 80) {
      let frames = 0;
      while (callbacks.size > 0 && frames < maxFrames) {
        const pending = [...callbacks.entries()];
        callbacks.clear();
        frames += 1;
        now += 16;
        pending.forEach(([, callback]) => callback(now));
      }

      if (callbacks.size > 0) {
        throw new Error("requestAnimationFrame queue did not settle");
      }
    }
  };
};

const installScrollMetrics = (
  element: HTMLElement,
  initial: { scrollHeight: number; clientHeight: number }
) => {
  let scrollTop = 0;
  let scrollHeight = initial.scrollHeight;
  const clientHeight = initial.clientHeight;

  Object.defineProperties(element, {
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
        scrollTop = Math.max(0, Math.min(value, maxScrollTop));
      }
    },
    scrollHeight: {
      configurable: true,
      get: () => scrollHeight
    },
    clientHeight: {
      configurable: true,
      get: () => clientHeight
    }
  });

  return {
    getScrollTop: () => scrollTop,
    getBottomScrollTop: () => Math.max(0, scrollHeight - clientHeight),
    setScrollTop: (value: number) => {
      element.scrollTop = value;
    },
    setScrollHeight: (value: number) => {
      scrollHeight = value;
      if (scrollTop > scrollHeight - clientHeight) {
        scrollTop = Math.max(0, scrollHeight - clientHeight);
      }
    }
  };
};

const emitStreamingStatus = (controller: ReturnType<typeof createAgentExperience>) => {
  controller.injectTestMessage({ type: "status", status: "connecting" });
};

const emitStreamingMessage = (
  controller: ReturnType<typeof createAgentExperience>,
  content: string
) => {
  controller.injectTestMessage({
    type: "message",
    message: {
      id: STREAM_MESSAGE_ID,
      role: "assistant",
      content,
      createdAt: STREAM_CREATED_AT,
      streaming: true
    }
  });
};

const emitReasoningMessage = (
  controller: ReturnType<typeof createAgentExperience>,
  chunks: string[]
) => {
  controller.injectTestMessage({
    type: "message",
    message: {
      id: STREAM_MESSAGE_ID,
      role: "assistant",
      content: "",
      createdAt: STREAM_CREATED_AT,
      streaming: true,
      variant: "reasoning",
      reasoning: {
        id: "reason-1",
        status: "streaming",
        chunks
      }
    }
  });
};

describe("createAgentExperience streaming scroll", () => {
  beforeEach(() => {
    installRafMock();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("stops auto-follow after a small upward scroll during streaming", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false }
    });

    const scrollContainer = mount.querySelector<HTMLElement>("#persona-scroll-container");
    expect(scrollContainer).not.toBeNull();

    const metrics = installScrollMetrics(scrollContainer!, {
      scrollHeight: 1000,
      clientHeight: 400
    });

    emitStreamingStatus(controller);
    emitStreamingMessage(controller, "First chunk");
    raf.flush();

    expect(metrics.getScrollTop()).toBe(metrics.getBottomScrollTop());

    metrics.setScrollTop(metrics.getBottomScrollTop() - 3);
    scrollContainer!.dispatchEvent(new Event("scroll"));

    metrics.setScrollHeight(1040);
    emitStreamingMessage(controller, "Second chunk");
    raf.flush();

    expect(metrics.getScrollTop()).toBe(597);

    controller.destroy();
  });

  it("pauses auto-follow on upward wheel intent before the next streamed update", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false }
    });

    const scrollContainer = mount.querySelector<HTMLElement>("#persona-scroll-container");
    expect(scrollContainer).not.toBeNull();

    const metrics = installScrollMetrics(scrollContainer!, {
      scrollHeight: 1000,
      clientHeight: 400
    });

    emitStreamingStatus(controller);
    emitStreamingMessage(controller, "First chunk");
    raf.flush();

    scrollContainer!.dispatchEvent(new WheelEvent("wheel", { deltaY: -24 }));
    metrics.setScrollTop(580);
    metrics.setScrollHeight(1060);

    emitStreamingMessage(controller, "Second chunk");
    raf.flush();

    expect(metrics.getScrollTop()).toBe(580);

    controller.destroy();
  });

  it("resumes auto-follow when the user scrolls back to the bottom", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false }
    });

    const scrollContainer = mount.querySelector<HTMLElement>("#persona-scroll-container");
    expect(scrollContainer).not.toBeNull();

    const metrics = installScrollMetrics(scrollContainer!, {
      scrollHeight: 1000,
      clientHeight: 400
    });

    emitStreamingStatus(controller);
    emitStreamingMessage(controller, "First chunk");
    raf.flush();

    scrollContainer!.dispatchEvent(new WheelEvent("wheel", { deltaY: -24 }));
    metrics.setScrollTop(560);
    metrics.setScrollHeight(1060);
    emitStreamingMessage(controller, "Second chunk");
    raf.flush();

    expect(metrics.getScrollTop()).toBe(560);

    metrics.setScrollTop(metrics.getBottomScrollTop() - 2);
    scrollContainer!.dispatchEvent(new Event("scroll"));

    metrics.setScrollHeight(1100);
    emitStreamingMessage(controller, "Third chunk");
    raf.flush();

    expect(metrics.getScrollTop()).toBe(metrics.getBottomScrollTop());

    controller.destroy();
  });

  it("keeps following the stream when the user does not scroll", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false }
    });

    const scrollContainer = mount.querySelector<HTMLElement>("#persona-scroll-container");
    expect(scrollContainer).not.toBeNull();

    const metrics = installScrollMetrics(scrollContainer!, {
      scrollHeight: 900,
      clientHeight: 400
    });

    emitStreamingStatus(controller);
    emitStreamingMessage(controller, "Chunk one");
    raf.flush();

    expect(metrics.getScrollTop()).toBe(metrics.getBottomScrollTop());

    metrics.setScrollHeight(980);
    emitStreamingMessage(controller, "Chunk two");
    raf.flush();

    expect(metrics.getScrollTop()).toBe(metrics.getBottomScrollTop());

    controller.destroy();
  });

  it("lets the user break away during reasoning streaming", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false }
    });

    const scrollContainer = mount.querySelector<HTMLElement>("#persona-scroll-container");
    expect(scrollContainer).not.toBeNull();

    const metrics = installScrollMetrics(scrollContainer!, {
      scrollHeight: 960,
      clientHeight: 400
    });

    emitStreamingStatus(controller);
    emitReasoningMessage(controller, ["Thinking"]);
    raf.flush();

    expect(metrics.getScrollTop()).toBe(metrics.getBottomScrollTop());

    scrollContainer!.dispatchEvent(new WheelEvent("wheel", { deltaY: -18 }));
    metrics.setScrollTop(metrics.getBottomScrollTop() - 4);
    metrics.setScrollHeight(1010);

    emitReasoningMessage(controller, ["Thinking", " harder"]);
    raf.flush();

    expect(metrics.getScrollTop()).toBe(556);

    controller.destroy();
  });

  it("uses icon-only arrow-down defaults for the transcript affordance", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false }
    });

    const scrollContainer = mount.querySelector<HTMLElement>("#persona-scroll-container");
    expect(scrollContainer).not.toBeNull();

    const metrics = installScrollMetrics(scrollContainer!, {
      scrollHeight: 1000,
      clientHeight: 400
    });

    emitStreamingStatus(controller);
    emitStreamingMessage(controller, "First chunk");
    raf.flush();

    scrollContainer!.dispatchEvent(new WheelEvent("wheel", { deltaY: -18 }));
    metrics.setScrollTop(560);
    metrics.setScrollHeight(1060);
    emitStreamingMessage(controller, "Second chunk");
    raf.flush();

    const button = getScrollToBottomButton(mount);
    expect(button).not.toBeNull();
    expect(button?.textContent?.trim()).toBe("");
    expect(button?.querySelector("svg")).not.toBeNull();

    controller.destroy();
  });

  it("hides the transcript affordance when scroll-to-bottom is disabled", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: {
        scrollToBottom: {
          enabled: false
        }
      }
    } as any);

    const scrollContainer = mount.querySelector<HTMLElement>("#persona-scroll-container");
    expect(scrollContainer).not.toBeNull();

    const metrics = installScrollMetrics(scrollContainer!, {
      scrollHeight: 1000,
      clientHeight: 400
    });

    emitStreamingStatus(controller);
    emitStreamingMessage(controller, "First chunk");
    raf.flush();

    scrollContainer!.dispatchEvent(new WheelEvent("wheel", { deltaY: -18 }));
    metrics.setScrollTop(560);
    metrics.setScrollHeight(1060);
    emitStreamingMessage(controller, "Second chunk");
    raf.flush();

    expect(getScrollToBottomButton(mount)).toBeNull();

    controller.destroy();
  });

  it("renders the transcript affordance as icon-only when label is empty", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: {
        scrollToBottom: {
          enabled: true,
          iconName: "arrow-down",
          label: ""
        }
      }
    } as any);

    const scrollContainer = mount.querySelector<HTMLElement>("#persona-scroll-container");
    expect(scrollContainer).not.toBeNull();

    const metrics = installScrollMetrics(scrollContainer!, {
      scrollHeight: 1000,
      clientHeight: 400
    });

    emitStreamingStatus(controller);
    emitStreamingMessage(controller, "First chunk");
    raf.flush();

    scrollContainer!.dispatchEvent(new WheelEvent("wheel", { deltaY: -18 }));
    metrics.setScrollTop(560);
    metrics.setScrollHeight(1060);
    emitStreamingMessage(controller, "Second chunk");
    raf.flush();

    const button = getScrollToBottomButton(mount);
    expect(button).not.toBeNull();
    expect(button?.textContent?.trim()).toBe("");
    expect(button?.querySelector("svg")).not.toBeNull();

    controller.destroy();
  });

});
