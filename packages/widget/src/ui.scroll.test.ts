// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";

type RafCallback = (time: number) => void;

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
    step(frameCount = 1) {
      let frames = 0;
      while (callbacks.size > 0 && frames < frameCount) {
        const pending = [...callbacks.entries()];
        callbacks.clear();
        frames += 1;
        now += 16;
        pending.forEach(([, callback]) => callback(now));
      }
    },
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

const installResizeObserverMock = () => {
  const triggers: Array<() => void> = [];

  class ResizeObserverMock {
    constructor(callback: (entries: unknown[], observer: unknown) => void) {
      triggers.push(() => callback([], this));
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock);

  return {
    trigger() {
      triggers.forEach((fire) => fire());
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

const emitUserMessage = (
  controller: ReturnType<typeof createAgentExperience>,
  id: string,
  content = "Hello"
) => {
  controller.injectTestMessage({
    type: "message",
    message: {
      id,
      role: "user",
      content,
      createdAt: STREAM_CREATED_AT
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

const emitToolMessage = (
  controller: ReturnType<typeof createAgentExperience>,
  {
    id = STREAM_MESSAGE_ID,
    status = "running",
    chunks,
  }: {
    id?: string;
    status?: "pending" | "running" | "complete";
    chunks: string[];
  }
) => {
  controller.injectTestMessage({
    type: "message",
    message: {
      id,
      role: "assistant",
      content: "",
      createdAt: STREAM_CREATED_AT,
      streaming: status !== "complete",
      variant: "tool",
      toolCall: {
        id,
        status,
        chunks,
      }
    }
  });
};

const createCustomComposer = () => {
  const footer = document.createElement("div");
  footer.className = "persona-widget-footer";

  const form = document.createElement("form");
  form.setAttribute("data-persona-composer-form", "");

  const textarea = document.createElement("textarea");
  textarea.setAttribute("data-persona-composer-input", "");

  const status = document.createElement("div");
  status.setAttribute("data-persona-composer-status", "");

  form.appendChild(textarea);
  footer.append(form, status);
  return footer;
};

describe("createAgentExperience streaming scroll", () => {
  beforeEach(() => {
    installRafMock();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    // Widgets persist chat history to localStorage by default; without
    // clearing it, a later widget restores an earlier test's messages at
    // construction and "new message" assertions see stale ids.
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

    metrics.setScrollTop(metrics.getBottomScrollTop() - 6);
    scrollContainer!.dispatchEvent(new Event("scroll"));

    metrics.setScrollHeight(1040);
    emitStreamingMessage(controller, "Second chunk");
    raf.flush();

    expect(metrics.getScrollTop()).toBe(594);

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

  it("does not immediately resume after an upward scroll while still near the bottom", () => {
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
    metrics.setScrollTop(metrics.getBottomScrollTop() - 3);
    scrollContainer!.dispatchEvent(new Event("scroll"));

    metrics.setScrollHeight(1040);
    emitStreamingMessage(controller, "Second chunk");
    raf.flush();

    expect(metrics.getScrollTop()).toBe(597);
    expect(getScrollToBottomButton(mount)?.style.display).not.toBe("none");

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

  it("catches up immediately when a streamed update lands far behind", () => {
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

    metrics.setScrollHeight(1080);
    emitStreamingMessage(controller, "Chunk two");

    // Only run the scheduled auto-scroll frame, not the whole animation.
    raf.step(1);

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

  it("keeps following collapsed tool preview updates while active", () => {
    const raf = installRafMock();
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

    const scrollContainer = mount.querySelector<HTMLElement>("#persona-scroll-container");
    expect(scrollContainer).not.toBeNull();

    const metrics = installScrollMetrics(scrollContainer!, {
      scrollHeight: 980,
      clientHeight: 400
    });

    emitStreamingStatus(controller);
    emitToolMessage(controller, { chunks: ["Loaded tools"] });
    raf.flush();

    expect(metrics.getScrollTop()).toBe(metrics.getBottomScrollTop());

    metrics.setScrollHeight(1045);
    emitToolMessage(controller, {
      chunks: ["Loaded tools", "\nFetched platform documentation"]
    });
    raf.flush();

    expect(metrics.getScrollTop()).toBe(metrics.getBottomScrollTop());

    controller.destroy();
  });

  it("keeps following grouped tool sequences as new tool rows arrive", () => {
    const raf = installRafMock();
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

    const scrollContainer = mount.querySelector<HTMLElement>("#persona-scroll-container");
    expect(scrollContainer).not.toBeNull();

    const metrics = installScrollMetrics(scrollContainer!, {
      scrollHeight: 960,
      clientHeight: 400
    });

    emitStreamingStatus(controller);
    emitToolMessage(controller, { id: "tool-1", chunks: ["Loaded tools"] });
    raf.flush();

    expect(metrics.getScrollTop()).toBe(metrics.getBottomScrollTop());

    metrics.setScrollHeight(1030);
    emitToolMessage(controller, { id: "tool-2", chunks: ["Fetched platform documentation"] });
    raf.flush();

    expect(metrics.getScrollTop()).toBe(metrics.getBottomScrollTop());

    controller.destroy();
  });

  it("ignores layout-driven scroll events before a scheduled auto-scroll starts", () => {
    const raf = installRafMock();
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

    const scrollContainer = mount.querySelector<HTMLElement>("#persona-scroll-container");
    expect(scrollContainer).not.toBeNull();

    const metrics = installScrollMetrics(scrollContainer!, {
      scrollHeight: 960,
      clientHeight: 400,
    });

    emitStreamingStatus(controller);
    emitToolMessage(controller, { id: "tool-1", chunks: ["Loaded tools"] });
    emitToolMessage(controller, { id: "tool-2", chunks: ["Fetched docs"] });
    raf.flush();

    expect(metrics.getScrollTop()).toBe(metrics.getBottomScrollTop());

    metrics.setScrollHeight(1035);
    emitToolMessage(controller, {
      id: "tool-3",
      chunks: ["Compared layouts and noted launcher sizing"],
    });

    // Simulate the browser emitting a scroll event caused by layout/scroll
    // anchoring before the scheduled auto-scroll rAF has started.
    metrics.setScrollTop(metrics.getScrollTop() - 2);
    scrollContainer!.dispatchEvent(new Event("scroll"));

    raf.flush();

    expect(metrics.getScrollTop()).toBe(metrics.getBottomScrollTop());

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

  it("anchors the transcript affordance outside the scroll container", () => {
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
    expect(button?.parentElement).not.toBe(scrollContainer);

    controller.destroy();
  });

  it("keeps the transcript affordance outside the scroll container with a custom composer", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      plugins: [
        {
          id: "custom-composer",
          renderComposer: () => createCustomComposer()
        }
      ]
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
    expect(button?.parentElement).not.toBe(scrollContainer);

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

  it("re-pins to the bottom when content grows without a render event", () => {
    const raf = installRafMock();
    const resize = installResizeObserverMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false }
    });

    const scrollContainer = mount.querySelector<HTMLElement>("#persona-scroll-container");
    const metrics = installScrollMetrics(scrollContainer!, {
      scrollHeight: 1000,
      clientHeight: 400
    });

    emitStreamingStatus(controller);
    emitStreamingMessage(controller, "First chunk");
    raf.flush();

    expect(metrics.getScrollTop()).toBe(metrics.getBottomScrollTop());

    // Content grows with no render event (e.g. an image finishing loading
    // mid-stream): only the ResizeObserver sees it.
    metrics.setScrollHeight(1200);
    resize.trigger();
    raf.flush();

    expect(metrics.getScrollTop()).toBe(metrics.getBottomScrollTop());

    controller.destroy();
  });

  it("does not yank a paused reader when content grows without a render event", () => {
    const raf = installRafMock();
    const resize = installResizeObserverMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false }
    });

    const scrollContainer = mount.querySelector<HTMLElement>("#persona-scroll-container");
    const metrics = installScrollMetrics(scrollContainer!, {
      scrollHeight: 1000,
      clientHeight: 400
    });

    emitStreamingStatus(controller);
    emitStreamingMessage(controller, "First chunk");
    raf.flush();

    scrollContainer!.dispatchEvent(new WheelEvent("wheel", { deltaY: -24 }));
    metrics.setScrollTop(420);

    metrics.setScrollHeight(1200);
    resize.trigger();
    raf.flush();

    expect(metrics.getScrollTop()).toBe(420);

    controller.destroy();
  });

  it("pauses auto-follow while the user selects transcript text during streaming", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false }
    });

    const scrollContainer = mount.querySelector<HTMLElement>("#persona-scroll-container");
    const metrics = installScrollMetrics(scrollContainer!, {
      scrollHeight: 1000,
      clientHeight: 400
    });

    emitStreamingStatus(controller);
    emitStreamingMessage(controller, "First chunk");
    raf.flush();

    expect(metrics.getScrollTop()).toBe(metrics.getBottomScrollTop());

    // A selection forms inside the transcript (mouse drag or keyboard:    // both surface as selectionchange).
    let currentSelection: Partial<Selection> | null = {
      isCollapsed: false,
      anchorNode: scrollContainer,
      focusNode: scrollContainer
    };
    vi.spyOn(document, "getSelection").mockImplementation(
      () => currentSelection as Selection | null
    );
    document.dispatchEvent(new Event("selectionchange"));

    metrics.setScrollHeight(1100);
    emitStreamingMessage(controller, "Second chunk");
    raf.flush();

    // Auto-follow paused: the selection isn't dragged out from under the user.
    expect(metrics.getScrollTop()).toBe(600);

    // Drag-selecting toward the bottom edge auto-scrolls down: that must
    // not read as a resume gesture while the selection is still active.
    metrics.setScrollTop(metrics.getBottomScrollTop());
    scrollContainer!.dispatchEvent(new Event("scroll"));
    const heldPosition = metrics.getScrollTop();
    metrics.setScrollHeight(1200);
    emitStreamingMessage(controller, "Third chunk");
    raf.flush();
    expect(metrics.getScrollTop()).toBe(heldPosition);

    // Once the selection clears, scrolling down near the bottom resumes.
    currentSelection = null;
    metrics.setScrollTop(metrics.getBottomScrollTop());
    scrollContainer!.dispatchEvent(new Event("scroll"));
    metrics.setScrollHeight(1300);
    emitStreamingMessage(controller, "Fourth chunk");
    raf.flush();
    expect(metrics.getScrollTop()).toBe(metrics.getBottomScrollTop());

    controller.destroy();
  });

  it("re-sticks to the bottom when the user sends a message after scrolling up", () => {
    const raf = installRafMock();
    const mount = createMount();
    // Follow-specific: a user send re-sticks to the bottom (anchor-top, the
    // default, would pin the sent message near the top instead).
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: { scrollBehavior: { mode: "follow" } }
    });

    const scrollContainer = mount.querySelector<HTMLElement>("#persona-scroll-container");
    const metrics = installScrollMetrics(scrollContainer!, {
      scrollHeight: 1000,
      clientHeight: 400
    });

    emitStreamingStatus(controller);
    emitStreamingMessage(controller, "First chunk");
    raf.flush();

    scrollContainer!.dispatchEvent(new WheelEvent("wheel", { deltaY: -24 }));
    metrics.setScrollTop(300);

    emitUserMessage(controller, "user-resend", "Follow-up question");
    raf.flush();

    expect(metrics.getScrollTop()).toBe(metrics.getBottomScrollTop());

    controller.destroy();
  });

  it("shows a count badge for messages that arrive while paused", () => {
    const raf = installRafMock();
    const mount = createMount();
    // Follow-specific paused-badge semantics (wheel-up pauses auto-follow, then
    // a message arrives while paused and below the fold).
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: { scrollBehavior: { mode: "follow" } }
    });

    const scrollContainer = mount.querySelector<HTMLElement>("#persona-scroll-container");
    const metrics = installScrollMetrics(scrollContainer!, {
      scrollHeight: 1000,
      clientHeight: 400
    });

    emitStreamingStatus(controller);
    emitStreamingMessage(controller, "First chunk");
    raf.flush();

    scrollContainer!.dispatchEvent(new WheelEvent("wheel", { deltaY: -24 }));
    metrics.setScrollTop(300);

    controller.injectTestMessage({
      type: "message",
      message: {
        id: "ast-while-paused",
        role: "assistant",
        content: "Another answer",
        createdAt: STREAM_CREATED_AT
      }
    });
    raf.flush();

    const badge = mount.querySelector<HTMLElement>(
      "[data-persona-scroll-to-bottom-count]"
    );
    expect(badge?.textContent).toBe("1");
    expect(badge?.style.display).not.toBe("none");

    // Jumping back to the latest clears the count.
    getScrollToBottomButton(mount)!.click();
    raf.flush();
    expect(badge?.textContent).toBe("");
    expect(badge?.style.display).toBe("none");

    controller.destroy();
  });

  it("anchor-top mode pins the sent user message near the viewport top and never follows the stream", () => {
    const raf = installRafMock();
    const resize = installResizeObserverMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: {
        scrollBehavior: { mode: "anchor-top", anchorTopOffset: 16 }
      }
    } as any);

    const scrollContainer = mount.querySelector<HTMLElement>("#persona-scroll-container");
    const metrics = installScrollMetrics(scrollContainer!, {
      scrollHeight: 1000,
      clientHeight: 400
    });

    emitStreamingStatus(controller);
    emitUserMessage(controller, "user-anchor", "Long question");

    // Give the rendered bubble layout geometry before the anchor rAF runs.
    const bubble = scrollContainer!.querySelector<HTMLElement>(
      '[data-message-id="user-anchor"]'
    );
    expect(bubble).not.toBeNull();
    Object.defineProperty(bubble!, "offsetTop", { value: 700 });

    // Run just the anchor frame: it sizes the spacer and starts the scroll.
    raf.step(1);

    // target = 700 - 16 = 684; spacer = 684 + 400 - 1000 = 84.
    const spacer = scrollContainer!.querySelector<HTMLElement>(
      "[data-persona-anchor-spacer]"
    );
    expect(spacer?.style.height).toBe("84px");

    // The spacer's height is invisible to the mocked scroll metrics: apply
    // it manually so the anchor target is reachable, as in a real browser.
    metrics.setScrollHeight(1084);
    raf.flush();
    expect(metrics.getScrollTop()).toBe(684);

    // Streaming below the anchor never moves the viewport.
    metrics.setScrollHeight(1150);
    emitStreamingMessage(controller, "Streaming response");
    raf.flush();
    expect(metrics.getScrollTop()).toBe(684);

    // As real content grows, the spacer gives room back (shrink-only):
    // content grew from 1000 to 1150 - 84 = 1066, so spacer 84 - 66 = 18.
    resize.trigger();
    expect(spacer?.style.height).toBe("18px");

    // Jumping to the latest abandons the anchor: the spacer is dropped so
    // "bottom" is the real end of content.
    getScrollToBottomButton(mount)!.click();
    raf.flush();
    expect(spacer?.style.height).toBe("0px");
    expect(metrics.getScrollTop()).toBe(metrics.getBottomScrollTop());

    controller.destroy();
  });

  it("jump-to-latest cancels an in-flight anchor scroll animation", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: {
        scrollBehavior: { mode: "anchor-top", anchorTopOffset: 16 }
      }
    } as any);

    const scrollContainer = mount.querySelector<HTMLElement>("#persona-scroll-container");
    const metrics = installScrollMetrics(scrollContainer!, {
      scrollHeight: 1000,
      clientHeight: 400
    });

    emitStreamingStatus(controller);
    emitUserMessage(controller, "user-anchor-cancel", "Question");

    // Anchor target (484) is reachable without a spacer, and differs from
    // the bottom (600) so a stale animation is distinguishable.
    const bubble = scrollContainer!.querySelector<HTMLElement>(
      '[data-message-id="user-anchor-cancel"]'
    );
    Object.defineProperty(bubble!, "offsetTop", { value: 500 });

    raf.step(1); // anchor frame: starts the scroll animation
    raf.step(1); // first animation frame: animation now in flight

    // Jump to the latest mid-animation: the stale anchor animation must not
    // keep easing scrollTop back toward the old target.
    getScrollToBottomButton(mount)!.click();
    raf.flush();

    expect(metrics.getScrollTop()).toBe(metrics.getBottomScrollTop());

    controller.destroy();
  });

  it("scroll mode none never auto-scrolls during streaming", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      features: {
        scrollBehavior: { mode: "none" }
      }
    } as any);

    const scrollContainer = mount.querySelector<HTMLElement>("#persona-scroll-container");
    const metrics = installScrollMetrics(scrollContainer!, {
      scrollHeight: 1000,
      clientHeight: 400
    });

    emitStreamingStatus(controller);
    emitStreamingMessage(controller, "First chunk");
    metrics.setScrollHeight(1200);
    emitStreamingMessage(controller, "Second chunk");
    raf.flush();

    expect(metrics.getScrollTop()).toBe(0);

    // The affordance is still available to get back to the latest content,
    // and messages that arrived while away from the bottom are counted.
    scrollContainer!.dispatchEvent(new Event("scroll"));
    expect(getScrollToBottomButton(mount)?.style.display).not.toBe("none");
    const badge = mount.querySelector<HTMLElement>(
      "[data-persona-scroll-to-bottom-count]"
    );
    expect(badge?.textContent).toBe("1");

    controller.destroy();
  });

});
