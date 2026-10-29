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
  let now = performance.now();
  vi.stubGlobal("requestAnimationFrame", (cb: RafCallback) => {
    const id = nextId++;
    callbacks.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    callbacks.delete(id);
  });
  const run = (maxFrames: number) => {
    let frames = 0;
    while (callbacks.size > 0 && frames < maxFrames) {
      const pending = [...callbacks.values()];
      callbacks.clear();
      frames += 1;
      now += 16;
      pending.forEach((cb) => cb(now));
    }
  };
  return {
    step(frameCount = 1) {
      run(frameCount);
    },
    flush(maxFrames = 80) {
      run(maxFrames);
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

describe("anchor-top scroll-to-bottom affordance ignores spacer air", () => {
  let raf: ReturnType<typeof installRafMock>;
  beforeEach(() => {
    raf = installRafMock();
  });

  it("stays hidden while the whole transcript is in view above the spacer, then shows once content grows past the viewport", () => {
    const mount = createMount();
    const controller = createAgentExperience(
      mount,
      baseConfig({ features: { scrollBehavior: { mode: "anchor-top" } } })
    );
    const sc = getScrollContainer(mount);
    // Short transcript (300px of content) in a 400px viewport.
    const metrics = installScrollMetrics(sc, { scrollHeight: 300, clientHeight: 400 });

    anchorUserTurn(controller);
    // Give the anchored user bubble a real offset so the anchor computation
    // produces a spacer (jsdom offsets are otherwise all 0).
    const bubble = sc.querySelector<HTMLElement>('[data-message-id="u1"]')!;
    Object.defineProperty(bubble, "offsetTop", { configurable: true, get: () => 200 });
    raf.flush();

    // Reflect the spacer in the mocked scroll metrics, as a browser would.
    const spacer = sc.querySelector<HTMLElement>("[data-persona-anchor-spacer]")!;
    const spacerHeight = parseFloat(spacer.style.height);
    expect(spacerHeight).toBeGreaterThan(0);
    metrics.setScrollHeight(300 + spacerHeight);

    emitStreamingAssistant(controller, "a1", "Streaming reply");

    // All 300px of real content fit in the [60, 460] viewport; the only
    // scrollable space below is spacer air, so no jump affordance.
    metrics.setScrollTop(60);
    sc.dispatchEvent(new Event("scroll"));
    expect(getScrollToBottomButton(mount).style.display).toBe("none");

    // Content streams past the viewport bottom (300px -> 900px): now there is
    // real content below the fold and the affordance appears.
    metrics.setScrollHeight(900 + spacerHeight);
    sc.dispatchEvent(new Event("scroll"));
    expect(getScrollToBottomButton(mount).style.display).toBe("");

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


// Anchor-top pins the sent user message for the whole reply. It never hands
// off to the reply because the reply starts below the fold: tool runs,
// artifacts, multi-block answers, and tall questions all stream in beneath
// the anchor, and the jump-to-latest control is how the reader gets there.
describe("anchor-top holds the sent message for the whole reply", () => {
  beforeEach(() => {
    installRafMock();
  });

  const anchorTopConfig = () =>
    baseConfig({
      features: { scrollBehavior: { mode: "anchor-top", anchorTopOffset: 16 } },
    });

  const emitToolMessage = (
    controller: ReturnType<typeof createAgentExperience>,
    id: string,
    status: "running" | "complete" = "complete"
  ) => {
    controller.injectTestMessage({
      type: "message",
      message: {
        id,
        role: "assistant",
        content: "",
        createdAt: CREATED_AT,
        variant: "tool",
        streaming: status === "running",
        toolCall: { id, name: "search", status },
      },
    });
  };

  // An artifact / component block: substance lives in rawContent, `content`
  // is empty.
  const emitArtifactMessage = (
    controller: ReturnType<typeof createAgentExperience>,
    id: string
  ) => {
    controller.injectTestMessage({
      type: "message",
      message: {
        id,
        role: "assistant",
        content: "",
        createdAt: CREATED_AT,
        rawContent: JSON.stringify({
          text: "",
          component: "PersonaArtifactInline",
          props: { artifactId: "art-1", title: "Report" },
        }),
      },
    });
  };

  const setBubbleOffsetTop = (mount: HTMLElement, id: string, value: number) => {
    const bubble = getScrollContainer(mount).querySelector<HTMLElement>(
      `[data-message-id="${id}"]`
    );
    expect(bubble).not.toBeNull();
    Object.defineProperty(bubble!, "offsetTop", { configurable: true, value });
  };

  const getSpacer = (mount: HTMLElement) =>
    getScrollContainer(mount).querySelector<HTMLElement>("[data-persona-anchor-spacer]")!;

  const startTurn = (
    controller: ReturnType<typeof createAgentExperience>,
    mount: HTMLElement,
    raf: ReturnType<typeof installRafMock>
  ) => {
    emitAssistantMessage(controller, "seed", "Earlier reply");
    emitUserMessage(controller, "u1", "Where is my order?");
    setBubbleOffsetTop(mount, "u1", 300);
    raf.flush();
  };

  it("keeps the sent message anchored through a tool run and an answer below the fold", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, anchorTopConfig());
    const metrics = installScrollMetrics(getScrollContainer(mount), {
      scrollHeight: 1000,
      clientHeight: 400,
    });

    startTurn(controller, mount, raf);
    expect(metrics.getScrollTop()).toBe(284); // parked on the sent message

    for (let i = 0; i < 6; i += 1) {
      emitToolMessage(controller, `t${i}`, "running");
      setBubbleOffsetTop(mount, `t${i}`, 360 + i * 60);
      emitToolMessage(controller, `t${i}`);
    }
    metrics.setScrollHeight(1500);
    raf.flush();
    expect(metrics.getScrollTop()).toBe(284);

    // The answer starts 400px below the pinned question, past the fold at a
    // 400px viewport. A second render lets any render-time probe see the
    // mocked offset; the anchor still stays on the question.
    emitStreamingAssistant(controller, "a1", "Good news — your order is on track.");
    setBubbleOffsetTop(mount, "a1", 700);
    metrics.setScrollHeight(1700);
    emitStreamingAssistant(controller, "a1", "Good news — your order is on track!");
    raf.flush();
    expect(metrics.getScrollTop()).toBe(284);

    // The jump control advertises the offscreen answer.
    expect(getScrollToBottomButton(mount).style.display).toBe("");
    controller.destroy();
  });

  it("keeps the anchor when an artifact block lands below the fold", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, anchorTopConfig());
    const metrics = installScrollMetrics(getScrollContainer(mount), {
      scrollHeight: 1000,
      clientHeight: 400,
    });

    startTurn(controller, mount, raf);
    for (let i = 0; i < 3; i += 1) emitToolMessage(controller, `t${i}`);
    metrics.setScrollHeight(1500);
    raf.flush();

    emitArtifactMessage(controller, "art-msg");
    setBubbleOffsetTop(mount, "art-msg", 620);
    emitToolMessage(controller, "t-after");
    raf.flush();

    expect(metrics.getScrollTop()).toBe(284);
    controller.destroy();
  });

  it("holds the anchor across multiple assistant blocks, streaming updates, and completion", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, anchorTopConfig());
    const metrics = installScrollMetrics(getScrollContainer(mount), {
      scrollHeight: 1000,
      clientHeight: 400,
    });

    startTurn(controller, mount, raf);
    emitStreamingAssistant(controller, "a1", "First segment.");
    setBubbleOffsetTop(mount, "a1", 700);
    metrics.setScrollHeight(1400);
    emitStreamingAssistant(controller, "a1", "First segment, still streaming.");
    raf.flush();
    expect(metrics.getScrollTop()).toBe(284);

    // Interleaved: tool, then a second text segment.
    emitToolMessage(controller, "t0");
    emitStreamingAssistant(controller, "a2", "Second segment.");
    setBubbleOffsetTop(mount, "a2", 1100);
    metrics.setScrollHeight(1800);
    emitStreamingAssistant(controller, "a2", "Second segment, longer.");
    raf.flush();
    expect(metrics.getScrollTop()).toBe(284);

    emitAssistantMessage(controller, "a2", "Second segment, complete.");
    controller.injectTestMessage({ type: "status", status: "idle" });
    raf.flush();
    expect(metrics.getScrollTop()).toBe(284);
    controller.destroy();
  });

  it("stands down once the reader scrolls", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, anchorTopConfig());
    const sc = getScrollContainer(mount);
    const metrics = installScrollMetrics(sc, { scrollHeight: 1000, clientHeight: 400 });

    startTurn(controller, mount, raf);
    for (let i = 0; i < 6; i += 1) emitToolMessage(controller, `t${i}`);
    metrics.setScrollHeight(1500);
    raf.flush();

    // The reader takes over: wheels to watch the tools run. Engagement is
    // keyed on real input, NOT on the scroll event (streaming content
    // clamps and restores scrollTop on its own; see the regression test
    // below), so the wheel is what must register here.
    metrics.setScrollTop(520);
    sc.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true }));
    sc.dispatchEvent(new Event("scroll"));

    emitStreamingAssistant(controller, "a1", "Good news — your order is on track.");
    setBubbleOffsetTop(mount, "a1", 700);
    emitStreamingAssistant(controller, "a1", "Good news — your order is on track!");
    metrics.setScrollHeight(1700);
    raf.flush();

    // Their position wins: no re-anchor under them.
    expect(metrics.getScrollTop()).toBe(520);
    controller.destroy();
  });

  it("does not move a reader who is selecting transcript text", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, anchorTopConfig());
    const sc = getScrollContainer(mount);
    const metrics = installScrollMetrics(sc, { scrollHeight: 1000, clientHeight: 400 });

    startTurn(controller, mount, raf);
    emitStreamingAssistant(controller, "a1", "Tracking shows the parcel left the depot.");
    setBubbleOffsetTop(mount, "a1", 420);
    raf.flush();

    // Press and drag-select the answer, scrolling a little in the process.
    const answer = sc.querySelector<HTMLElement>('[data-message-id="a1"]')!;
    answer.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    const range = document.createRange();
    range.selectNodeContents(answer);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    metrics.setScrollTop(360);
    sc.dispatchEvent(new Event("scroll"));

    for (let i = 0; i < 3; i += 1) emitToolMessage(controller, `t${i}`);
    emitStreamingAssistant(controller, "a2", "It arrives tomorrow.");
    setBubbleOffsetTop(mount, "a2", 900);
    metrics.setScrollHeight(1600);
    emitStreamingAssistant(controller, "a2", "It arrives tomorrow morning.");
    raf.flush();

    expect(metrics.getScrollTop()).toBe(360);
    expect(document.getSelection()!.toString()).toContain("parcel left the depot");
    controller.destroy();
  });

  it("re-arms on the next send after the reader scrolled away", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, anchorTopConfig());
    const sc = getScrollContainer(mount);
    const metrics = installScrollMetrics(sc, { scrollHeight: 1000, clientHeight: 400 });

    startTurn(controller, mount, raf);
    metrics.setScrollTop(520);
    sc.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true }));
    sc.dispatchEvent(new Event("scroll"));

    // A new send is an explicit "take me along": the new user message
    // anchors (600 - 16 = 584) and holds while the reply streams beneath,
    // including once the reply grows past the fold.
    emitUserMessage(controller, "u2", "And the second order?");
    setBubbleOffsetTop(mount, "u2", 600);
    metrics.setScrollHeight(1400);
    raf.flush();
    expect(metrics.getScrollTop()).toBe(584);

    emitStreamingAssistant(controller, "a2", "That one shipped Tuesday.");
    setBubbleOffsetTop(mount, "a2", 1100);
    metrics.setScrollHeight(1600);
    emitStreamingAssistant(controller, "a2", "That one shipped Tuesday!");
    raf.flush();

    expect(metrics.getScrollTop()).toBe(584);
    controller.destroy();
  });

  it("releases the anchor for good when the reader jumps to the latest", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, anchorTopConfig());
    const sc = getScrollContainer(mount);
    const metrics = installScrollMetrics(sc, { scrollHeight: 500, clientHeight: 400 });

    // Short history: the anchor needs a spacer to rest the question at the
    // top (284 + 400 - 500 + 24 slack = 208).
    emitAssistantMessage(controller, "seed", "Earlier reply");
    emitUserMessage(controller, "u1", "Where is my order?");
    setBubbleOffsetTop(mount, "u1", 300);
    raf.step(1);
    expect(getSpacer(mount).style.height).toBe("208px");
    // The mocked metrics don't see the spacer: apply it as a browser would.
    metrics.setScrollHeight(708);
    raf.flush();
    expect(metrics.getScrollTop()).toBe(284);

    for (let i = 0; i < 4; i += 1) emitToolMessage(controller, `t${i}`);
    emitStreamingAssistant(controller, "a1", "Answer below the tools.");
    setBubbleOffsetTop(mount, "a1", 760);
    metrics.setScrollHeight(1400);
    emitStreamingAssistant(controller, "a1", "Answer below the tools, longer.");
    raf.flush();
    expect(metrics.getScrollTop()).toBe(284);

    const jump = getScrollToBottomButton(mount);
    expect(jump.style.display).toBe("");
    jump.click();
    raf.flush();
    expect(getSpacer(mount).style.display).toBe("none");
    expect(metrics.getScrollTop()).toBe(metrics.getBottom());
    const releasedAt = metrics.getScrollTop();

    // More blocks, tool updates, and completion never reinstate the anchor.
    emitToolMessage(controller, "t-late");
    emitStreamingAssistant(controller, "a2", "One more thing.");
    setBubbleOffsetTop(mount, "a2", 1300);
    metrics.setScrollHeight(1600);
    emitAssistantMessage(controller, "a2", "One more thing, done.");
    raf.flush();
    expect(getSpacer(mount).style.display).toBe("none");
    expect(metrics.getScrollTop()).toBe(releasedAt);
    controller.destroy();
  });
});

// Voice: the recognized user transcript grows in place under one message id
// (interim → final). It is one send: it anchors once and its updates never
// re-anchor or chase the reply.
describe("anchor-top voice transcript updates", () => {
  beforeEach(() => {
    installRafMock();
  });

  const emitVoiceUser = (
    controller: ReturnType<typeof createAgentExperience>,
    content: string,
    isFinal: boolean
  ) => {
    controller.injectTestMessage({
      type: "message",
      message: {
        id: "voice-u1",
        role: "user",
        content,
        createdAt: CREATED_AT,
        streaming: false,
        viaVoice: true,
        voiceProcessing: !isFinal,
      },
    });
  };

  const setTop = (mount: HTMLElement, id: string, value: number) => {
    const bubble = getScrollContainer(mount).querySelector<HTMLElement>(
      `[data-message-id="${id}"]`
    )!;
    Object.defineProperty(bubble, "offsetTop", { configurable: true, value });
  };

  const start = (mount: HTMLElement) => {
    const controller = createAgentExperience(
      mount,
      baseConfig({ features: { scrollBehavior: { mode: "anchor-top", anchorTopOffset: 16 } } })
    );
    emitAssistantMessage(controller, "seed", "Earlier reply");
    return controller;
  };

  it("keeps a growing transcript anchored from interim through final and the reply", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = start(mount);
    const sc = getScrollContainer(mount);
    const metrics = installScrollMetrics(sc, { scrollHeight: 1000, clientHeight: 400 });

    emitVoiceUser(controller, "Book a", false);
    setTop(mount, "voice-u1", 300);
    raf.flush();
    expect(metrics.getScrollTop()).toBe(284);

    // Interim text grows the same bubble past the viewport.
    const words = "table for four near the station on Friday evening ".repeat(20);
    emitVoiceUser(controller, `Book a ${words}`, false);
    metrics.setScrollHeight(1600);
    raf.flush();
    emitVoiceUser(controller, `Book a ${words}please.`, true);
    raf.flush();
    expect(metrics.getScrollTop()).toBe(284);

    // The reply lands entirely below the long transcript.
    emitStreamingAssistant(controller, "voice-a1", "");
    emitStreamingAssistant(controller, "voice-a1", "Done — four seats at 7pm.");
    setTop(mount, "voice-a1", 1500);
    metrics.setScrollHeight(1900);
    emitAssistantMessage(controller, "voice-a1", "Done — four seats at 7pm on Friday.");
    raf.flush();
    expect(metrics.getScrollTop()).toBe(284);
    controller.destroy();
  });

  it("does not pull a reader back when the transcript updates after they scroll", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = start(mount);
    const sc = getScrollContainer(mount);
    const metrics = installScrollMetrics(sc, { scrollHeight: 1000, clientHeight: 400 });

    emitVoiceUser(controller, "What's the", false);
    setTop(mount, "voice-u1", 300);
    raf.flush();
    expect(metrics.getScrollTop()).toBe(284);

    // The reader scrolls up to re-read the earlier reply mid-utterance.
    metrics.setScrollTop(40);
    sc.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true }));
    sc.dispatchEvent(new Event("scroll"));

    emitVoiceUser(controller, "What's the weather", false);
    raf.flush();
    emitVoiceUser(controller, "What's the weather tomorrow?", true);
    emitStreamingAssistant(controller, "voice-a1", "Sunny, 21°C.");
    metrics.setScrollHeight(1200);
    raf.flush();

    expect(metrics.getScrollTop()).toBe(40);
    controller.destroy();
  });
});

// Regression: streaming content under a pinned anchor makes the browser clamp
// scrollTop and then restore it: a matched pair of real scroll events with no
// user involved (observed live as -12 then +12 during a tool run). Those must
// not read as the reader taking over, or a later layout re-pin (host move)
// would stand down.
describe("anchor-top — layout scroll is not reader intent", () => {
  beforeEach(() => {
    installRafMock();
  });

  it("keeps the anchor and its spacer through a clamp/restore scroll pair", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(
      mount,
      baseConfig({
        features: { scrollBehavior: { mode: "anchor-top", anchorTopOffset: 16 } },
      })
    );
    const sc = getScrollContainer(mount);
    const metrics = installScrollMetrics(sc, { scrollHeight: 600, clientHeight: 400 });

    emitAssistantMessage(controller, "seed", "Earlier reply");
    emitUserMessage(controller, "u1", "Where is my order?");
    const userBubble = sc.querySelector<HTMLElement>('[data-message-id="u1"]');
    Object.defineProperty(userBubble!, "offsetTop", { configurable: true, value: 300 });
    raf.step(1);
    const spacer = sc.querySelector<HTMLElement>("[data-persona-anchor-spacer]")!;
    // 284 + 400 - 600 + 24 slack.
    expect(spacer.style.height).toBe("108px");
    metrics.setScrollHeight(708);
    raf.flush();
    expect(metrics.getScrollTop()).toBe(284);

    // Tool run: scrollTop is clamped down, then the growing transcript
    // restores it. Both are layout, not the reader.
    for (let i = 0; i < 6; i += 1) {
      controller.injectTestMessage({
        type: "message",
        message: {
          id: `t${i}`,
          role: "assistant",
          content: "",
          createdAt: CREATED_AT,
          variant: "tool",
          toolCall: { id: `t${i}`, name: "search", status: "complete" },
        },
      });
    }
    metrics.setScrollTop(272);
    sc.dispatchEvent(new Event("scroll"));
    metrics.setScrollTop(284);
    sc.dispatchEvent(new Event("scroll"));

    emitStreamingAssistant(controller, "a1", "Good news — your order is on track.");
    const answer = sc.querySelector<HTMLElement>('[data-message-id="a1"]');
    Object.defineProperty(answer!, "offsetTop", { configurable: true, value: 700 });
    emitStreamingAssistant(controller, "a1", "Good news — your order is on track!");
    raf.flush();

    expect(metrics.getScrollTop()).toBe(284);
    expect(spacer.style.display).toBe("");
    controller.destroy();
  });
});
