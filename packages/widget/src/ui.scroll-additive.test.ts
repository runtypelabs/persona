// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import type { AgentWidgetConfig, AgentWidgetMessage } from "./types";

type RafCallback = (time: number) => void;

const CREATED_AT = "2026-03-29T00:00:00.000Z";

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

const getScrollContainer = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>("#persona-scroll-container")!;

const getScrollToBottomButton = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>("[data-persona-scroll-to-bottom]")!;

const getCountBadge = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>("[data-persona-scroll-to-bottom-count]")!;

const getLiveRegion = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>("[data-persona-live-region]");

const installRafMock = () => {
  let nextId = 1;
  const callbacks = new Map<number, RafCallback>();
  let now = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: RafCallback) => {
    const id = nextId++;
    callbacks.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    callbacks.delete(id);
  });
  return {
    flush(maxFrames = 80) {
      let frames = 0;
      while (callbacks.size > 0 && frames < maxFrames) {
        const pending = [...callbacks.values()];
        callbacks.clear();
        frames += 1;
        now += 16;
        pending.forEach((cb) => cb(now));
      }
    },
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
        scrollTop = Math.max(0, Math.min(value, Math.max(0, scrollHeight - clientHeight)));
      },
    },
    scrollHeight: { configurable: true, get: () => scrollHeight },
    clientHeight: { configurable: true, get: () => clientHeight },
  });
  return {
    getScrollTop: () => scrollTop,
    getBottom: () => Math.max(0, scrollHeight - clientHeight),
    setScrollTop: (v: number) => {
      element.scrollTop = v;
    },
    setScrollHeight: (v: number) => {
      scrollHeight = v;
      if (scrollTop > scrollHeight - clientHeight) {
        scrollTop = Math.max(0, scrollHeight - clientHeight);
      }
    },
  };
};

const emitStreamingMessage = (
  controller: ReturnType<typeof createAgentExperience>,
  id: string,
  content: string
) => {
  controller.injectTestMessage({
    type: "message",
    message: { id, role: "assistant", content, createdAt: CREATED_AT, streaming: true },
  });
};

const emitAssistantMessage = (
  controller: ReturnType<typeof createAgentExperience>,
  id: string,
  content: string
) => {
  controller.injectTestMessage({
    type: "message",
    message: { id, role: "assistant", content, createdAt: CREATED_AT },
  });
};

const emitUserMessage = (
  controller: ReturnType<typeof createAgentExperience>,
  id: string,
  content: string
) => {
  controller.injectTestMessage({
    type: "message",
    message: { id, role: "user", content, createdAt: CREATED_AT },
  });
};

const emitStreamingAssistant = (
  controller: ReturnType<typeof createAgentExperience>,
  id: string,
  content: string
) => {
  controller.injectTestMessage({
    type: "message",
    message: { id, role: "assistant", content, createdAt: CREATED_AT, streaming: true },
  });
};

// Establish a real anchor-top turn: a prior assistant message seeds
// send-detection, then a user send anchors. The next assistant message is the
// anchored response (so it does NOT hit the no-anchor follow fallback) — the
// scenario `showActivityWhilePinned` is about: the answer streaming in below a
// pinned question the reader is still reading from the top.
const anchorUserTurn = (
  controller: ReturnType<typeof createAgentExperience>
) => {
  emitAssistantMessage(controller, "seed", "Earlier reply");
  emitUserMessage(controller, "u1", "Question");
};

const baseConfig = (overrides: AgentWidgetConfig): AgentWidgetConfig => ({
  apiUrl: "https://api.example.com/chat",
  launcher: { enabled: false },
  // Hermetic: never restore persisted history at construction. Otherwise a
  // prior test's transcript (sharing message ids like "u1") leaks via
  // localStorage and a user send reads as already-seen, so the anchor never
  // takes and the assertion sees a follow-to-bottom instead.
  persistState: false,
  ...overrides,
});

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("scrollBehavior.pauseOnInteraction (Principle 3)", () => {
  beforeEach(() => {
    installRafMock();
  });

  it("pauses auto-follow on a transcript navigation keypress when enabled", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(
      mount,
      baseConfig({ features: { scrollBehavior: { mode: "follow", pauseOnInteraction: true } } })
    );
    const sc = getScrollContainer(mount);
    const metrics = installScrollMetrics(sc, { scrollHeight: 1000, clientHeight: 400 });

    emitStreamingMessage(controller, "a1", "First chunk");
    raf.flush();
    expect(metrics.getScrollTop()).toBe(metrics.getBottom());

    sc.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp", bubbles: true }));

    metrics.setScrollHeight(1080);
    emitStreamingMessage(controller, "a1", "First chunk + more");
    raf.flush();

    // Paused: the stream no longer chases the bottom.
    expect(metrics.getScrollTop()).toBe(600);
    controller.destroy();
  });

  it("does NOT pause on keypress when the option is off (default)", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(
      mount,
      baseConfig({ features: { scrollBehavior: { mode: "follow" } } })
    );
    const sc = getScrollContainer(mount);
    const metrics = installScrollMetrics(sc, { scrollHeight: 1000, clientHeight: 400 });

    emitStreamingMessage(controller, "a1", "First chunk");
    raf.flush();

    sc.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp", bubbles: true }));

    metrics.setScrollHeight(1080);
    emitStreamingMessage(controller, "a1", "First chunk + more");
    raf.flush();

    // Still following: chases the new bottom.
    expect(metrics.getScrollTop()).toBe(metrics.getBottom());
    controller.destroy();
  });
});

describe("scrollBehavior.showActivityWhilePinned (Principle 8)", () => {
  beforeEach(() => {
    installRafMock();
  });

  it("counts the anchored response arriving below the pinned turn by default", () => {
    const mount = createMount();
    // showActivityWhilePinned now defaults on (alongside the anchor-top default).
    const controller = createAgentExperience(
      mount,
      baseConfig({ features: { scrollBehavior: { mode: "anchor-top" } } })
    );
    const sc = getScrollContainer(mount);
    const metrics = installScrollMetrics(sc, { scrollHeight: 1000, clientHeight: 400 });
    anchorUserTurn(controller);
    metrics.setScrollTop(0); // reading the pinned question, away from the bottom

    emitAssistantMessage(controller, "a1", "Arrived below");

    expect(getCountBadge(mount).textContent).toBe("1");
    expect(getScrollToBottomButton(mount).getAttribute("aria-label")).toContain("1 new");
    controller.destroy();
  });

  it("stays silent when showActivityWhilePinned is disabled", () => {
    const mount = createMount();
    const controller = createAgentExperience(
      mount,
      baseConfig({
        features: {
          scrollBehavior: { mode: "anchor-top", showActivityWhilePinned: false },
        },
      })
    );
    const sc = getScrollContainer(mount);
    const metrics = installScrollMetrics(sc, { scrollHeight: 1000, clientHeight: 400 });
    anchorUserTurn(controller);
    metrics.setScrollTop(0);

    emitAssistantMessage(controller, "a1", "Arrived below");

    expect(getCountBadge(mount).textContent).toBe("");
    controller.destroy();
  });
});

describe("scrollBehavior anchor-top no-anchor fallback", () => {
  let raf: ReturnType<typeof installRafMock>;
  beforeEach(() => {
    raf = installRafMock();
  });

  const makeAnchorTop = (mount: HTMLElement) =>
    createAgentExperience(
      mount,
      baseConfig({ features: { scrollBehavior: { mode: "anchor-top" } } })
    );

  it("follows to the bottom for an assistant turn with no user anchor", () => {
    const mount = createMount();
    const controller = makeAnchorTop(mount);
    const sc = getScrollContainer(mount);
    const metrics = installScrollMetrics(sc, { scrollHeight: 1000, clientHeight: 400 });

    // A proactive/first-load assistant stream with no preceding user send: it
    // has no anchor, so it falls back to follow-to-bottom rather than streaming
    // in off-screen.
    emitStreamingAssistant(controller, "a1", "Proactive reply");
    raf.flush();

    expect(metrics.getScrollTop()).toBe(metrics.getBottom());
    controller.destroy();
  });

  it("anchors near the top (does not follow) when the turn follows a user send", () => {
    const mount = createMount();
    const controller = makeAnchorTop(mount);
    const sc = getScrollContainer(mount);
    const metrics = installScrollMetrics(sc, { scrollHeight: 1000, clientHeight: 400 });

    anchorUserTurn(controller); // seed + user send → real anchor
    raf.flush();
    emitStreamingAssistant(controller, "a1", "Answer below the pinned question");
    raf.flush();

    // The anchored response is pinned near the top (jsdom offsetTop 0 → 0), not
    // chased to the bottom.
    expect(metrics.getScrollTop()).toBe(0);
    controller.destroy();
  });

  it("keeps follow-on assistant content in an anchored turn pinned (no late-embed yank)", () => {
    const mount = createMount();
    const controller = makeAnchorTop(mount);
    const sc = getScrollContainer(mount);
    const metrics = installScrollMetrics(sc, { scrollHeight: 1000, clientHeight: 400 });

    anchorUserTurn(controller); // user send → anchor
    raf.flush();
    emitAssistantMessage(controller, "a1", "Anchored answer");
    raf.flush();
    metrics.setScrollTop(0); // reading the pinned question from the top

    // A second assistant message in the same anchored conversation — a
    // multi-part reply or a late-injected embed (tweet/image/tool result) — must
    // NOT re-arm the fallback or yank the viewport to the bottom.
    emitStreamingAssistant(controller, "a2", "Late-injected embed content");
    raf.flush();

    expect(metrics.getScrollTop()).toBe(0);
    controller.destroy();
  });
});

describe("scrollBehavior.restorePosition (Principle 11)", () => {
  beforeEach(() => {
    installRafMock();
  });

  const history: AgentWidgetMessage[] = [
    { id: "u1", role: "user", content: "First question", createdAt: CREATED_AT },
    { id: "a1", role: "assistant", content: "First answer", createdAt: CREATED_AT },
    { id: "u2", role: "user", content: "Second question", createdAt: CREATED_AT },
    { id: "a2", role: "assistant", content: "Second answer", createdAt: CREATED_AT },
  ];

  it("pins the last user message near the top on open when set to last-user-turn", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(
      mount,
      baseConfig({
        launcher: { enabled: true, autoExpand: false },
        initialMessages: history,
        features: { scrollBehavior: { mode: "follow", restorePosition: "last-user-turn" } },
      })
    );
    const sc = getScrollContainer(mount);
    const metrics = installScrollMetrics(sc, { scrollHeight: 1000, clientHeight: 400 });

    // jsdom computes no layout; give the last user bubble a known offsetTop so
    // the anchor geometry has something to target.
    const lastUserBubble = sc.querySelector<HTMLElement>('[data-message-id="u2"]')!;
    Object.defineProperty(lastUserBubble, "offsetTop", { configurable: true, get: () => 320 });

    controller.open();
    raf.flush();

    // 320 - 16 (anchorTopOffset) = 304, above the bottom (600).
    expect(metrics.getScrollTop()).toBe(304);
    controller.destroy();
  });

  it("jumps to the bottom on open by default", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(
      mount,
      baseConfig({
        launcher: { enabled: true, autoExpand: false },
        initialMessages: history,
        features: { scrollBehavior: { mode: "follow" } },
      })
    );
    const sc = getScrollContainer(mount);
    const metrics = installScrollMetrics(sc, { scrollHeight: 1000, clientHeight: 400 });

    controller.open();
    raf.flush();

    expect(metrics.getScrollTop()).toBe(metrics.getBottom());
    controller.destroy();
  });
});

describe("scrollBehavior.announce (Principle 15)", () => {
  it("always creates a polite live region", () => {
    installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, baseConfig({}));
    const region = getLiveRegion(mount);
    expect(region).not.toBeNull();
    expect(region!.getAttribute("aria-live")).toBe("polite");
    controller.destroy();
  });

  it("announces new-content arrival at a debounced cadence when enabled", () => {
    vi.useFakeTimers();
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(
      mount,
      baseConfig({ features: { scrollBehavior: { mode: "follow", announce: true } } })
    );
    const sc = getScrollContainer(mount);
    const metrics = installScrollMetrics(sc, { scrollHeight: 1000, clientHeight: 400 });

    emitStreamingMessage(controller, "seed", "hi");
    raf.flush();
    // Scroll up so the next message counts as "below".
    metrics.setScrollTop(100);
    sc.dispatchEvent(new Event("scroll"));

    emitAssistantMessage(controller, "a1", "Arrived below");
    vi.advanceTimersByTime(400);

    expect(getLiveRegion(mount)!.textContent).toContain("new message");
    controller.destroy();
  });

  it("stays silent when announce is off (default)", () => {
    vi.useFakeTimers();
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(
      mount,
      baseConfig({ features: { scrollBehavior: { mode: "follow" } } })
    );
    const sc = getScrollContainer(mount);
    const metrics = installScrollMetrics(sc, { scrollHeight: 1000, clientHeight: 400 });

    emitStreamingMessage(controller, "seed", "hi");
    raf.flush();
    metrics.setScrollTop(100);
    sc.dispatchEvent(new Event("scroll"));

    emitAssistantMessage(controller, "a1", "Arrived below");
    vi.advanceTimersByTime(400);

    expect(getLiveRegion(mount)!.textContent).toBe("");
    controller.destroy();
  });
});
