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


// Anchor-top pins the sent user message (market pattern) and hands off to
// the turn's first UNREAD attention-worthy block only when that block starts
// below the fold: tool calls and reasoning are chrome and never targeted, so
// a response that opens with them scrolls them past rather than stranding
// the answer. A block starting within view keeps the user message anchored.
describe("anchor-top first-unread positioning", () => {
  beforeEach(() => {
    installRafMock();
  });

  const anchorTopConfig = () =>
    baseConfig({
      features: { scrollBehavior: { mode: "anchor-top", anchorTopOffset: 16 } },
    });

  const emitToolMessage = (
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
        variant: "tool",
        toolCall: { id, name: "search", status: "complete" },
      },
    });
  };

  // An artifact / component block: substance lives in rawContent, `content`
  // is empty. Testing text alone would silently skip these.
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

  it("skips a run of tool calls and anchors the answer", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, anchorTopConfig());
    const metrics = installScrollMetrics(getScrollContainer(mount), {
      scrollHeight: 1000,
      clientHeight: 400,
    });

    startTurn(controller, mount, raf);
    expect(metrics.getScrollTop()).toBe(284); // parked on the sent message

    for (let i = 0; i < 6; i += 1) emitToolMessage(controller, `t${i}`);
    metrics.setScrollHeight(1500);
    raf.flush();
    // Tool calls are chrome: they never move the anchor.
    expect(metrics.getScrollTop()).toBe(284);

    // The answer starts 400px below the pinned question — past the fold at a
    // 400px viewport — so the anchor hands off to it. (The strandedness probe
    // reads layout at render time, so the mocked offset needs one more
    // render to be seen.)
    emitStreamingAssistant(controller, "a1", "Good news — your order is on track.");
    setBubbleOffsetTop(mount, "a1", 700);
    emitStreamingAssistant(controller, "a1", "Good news — your order is on track!");
    raf.flush();
    expect(metrics.getScrollTop()).toBe(684);

    controller.destroy();
  });

  it("anchors an artifact block, whose content lives in rawContent", () => {
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
    // 320px below the question: stranded past the 400 - 96 visibility floor,
    // so the anchor hands off. The trailing tool render lets the probe see
    // the mocked offset.
    setBubbleOffsetTop(mount, "art-msg", 620);
    emitToolMessage(controller, "t-after");
    raf.flush();

    expect(metrics.getScrollTop()).toBe(604);
    controller.destroy();
  });

  it("holds the FIRST unread block when more text streams in after it", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, anchorTopConfig());
    const metrics = installScrollMetrics(getScrollContainer(mount), {
      scrollHeight: 1000,
      clientHeight: 400,
    });

    startTurn(controller, mount, raf);
    // First segment starts past the fold (delta 400 at a 400px viewport):
    // the anchor hands off to it.
    emitStreamingAssistant(controller, "a1", "First segment.");
    setBubbleOffsetTop(mount, "a1", 700);
    metrics.setScrollHeight(1400);
    emitStreamingAssistant(controller, "a1", "First segment!");
    raf.flush();
    expect(metrics.getScrollTop()).toBe(684);

    // Interleaved: tool, then a second text segment. The anchor stays on the
    // first unread block — later blocks stream in below it.
    emitToolMessage(controller, "t0");
    emitStreamingAssistant(controller, "a2", "Second segment.");
    setBubbleOffsetTop(mount, "a2", 1100);
    metrics.setScrollHeight(1800);
    raf.flush();

    expect(metrics.getScrollTop()).toBe(684);
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

    // The reader takes over: wheels down to watch the tools run. Engagement
    // is keyed on real input, NOT on the scroll event (streaming content
    // clamps and restores scrollTop on its own — see the regression test
    // below), so the wheel is what must register here.
    metrics.setScrollTop(520);
    sc.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true }));
    sc.dispatchEvent(new Event("scroll"));

    emitStreamingAssistant(controller, "a1", "Good news — your order is on track.");
    setBubbleOffsetTop(mount, "a1", 700);
    raf.flush();

    // Their position wins: no re-anchor under them.
    expect(metrics.getScrollTop()).toBe(520);
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
    // anchors (600 - 16 = 584) and, with the reply starting only 200px below
    // it — within view — stays anchored while the reply streams beneath.
    emitUserMessage(controller, "u2", "And the second order?");
    setBubbleOffsetTop(mount, "u2", 600);
    metrics.setScrollHeight(1400);
    raf.flush();

    emitStreamingAssistant(controller, "a2", "That one shipped Tuesday.");
    setBubbleOffsetTop(mount, "a2", 800);
    metrics.setScrollHeight(1600);
    emitStreamingAssistant(controller, "a2", "That one shipped Tuesday!");
    raf.flush();

    expect(metrics.getScrollTop()).toBe(584);
    controller.destroy();
  });
});

// Two shapes the browser testbed covers but that are worth pinning down here,
// since they are where the policy's judgement calls actually bite.
describe("anchor-top first-unread — edge shapes", () => {
  beforeEach(() => {
    installRafMock();
  });

  const anchorTopConfig = () =>
    baseConfig({
      features: { scrollBehavior: { mode: "anchor-top", anchorTopOffset: 16 } },
    });

  const emitTool = (
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
        variant: "tool",
        toolCall: { id, name: "search", status: "complete" },
      },
    });
  };

  const setTop = (mount: HTMLElement, id: string, value: number) => {
    const bubble = getScrollContainer(mount).querySelector<HTMLElement>(
      `[data-message-id="${id}"]`
    );
    expect(bubble).not.toBeNull();
    Object.defineProperty(bubble!, "offsetTop", { configurable: true, value });
  };

  // KNOWN TRADEOFF: a chatty preamble ("Let me look that up…") is itself the
  // first unread block, so when a long question strands it the anchor lands
  // there — and the tool run still pushes the real answer toward the fold.
  // That is the policy behaving as specified — chronological, honest about
  // what arrived first — but it is the case most likely to want revisiting.
  // (A preamble starting within view never moves the anchor at all: the user
  // message keeps it.)
  it("anchors a stranded preamble, not the answer that follows the tool run", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, anchorTopConfig());
    const metrics = installScrollMetrics(getScrollContainer(mount), {
      scrollHeight: 1200,
      clientHeight: 400,
    });

    emitAssistantMessage(controller, "seed", "Earlier reply");
    emitUserMessage(controller, "u1", "Look into my order");
    setTop(mount, "u1", 300);
    raf.flush();

    // A tall question strands the preamble (delta 400 > 400 - 96): handoff.
    emitStreamingAssistant(controller, "pre", "Sure — let me pull that up.");
    setTop(mount, "pre", 700);
    emitStreamingAssistant(controller, "pre", "Sure — let me pull that up!");
    raf.flush();
    expect(metrics.getScrollTop()).toBe(684);

    for (let i = 0; i < 6; i += 1) emitTool(controller, `t${i}`);
    emitStreamingAssistant(controller, "answer", "Good news — it is on track.");
    setTop(mount, "answer", 1300);
    metrics.setScrollHeight(1800);
    raf.flush();

    // Still parked on the preamble: the answer is NOT re-targeted.
    expect(metrics.getScrollTop()).toBe(684);
    controller.destroy();
  });

  it("holds the sent message when a turn produces only tool calls", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(mount, anchorTopConfig());
    const metrics = installScrollMetrics(getScrollContainer(mount), {
      scrollHeight: 1000,
      clientHeight: 400,
    });

    emitAssistantMessage(controller, "seed", "Earlier reply");
    emitUserMessage(controller, "u1", "Just refresh the tracking data");
    setTop(mount, "u1", 300);
    raf.flush();
    expect(metrics.getScrollTop()).toBe(284);

    for (let i = 0; i < 6; i += 1) emitTool(controller, `t${i}`);
    metrics.setScrollHeight(1600);
    raf.flush();

    // Nothing attention-worthy ever arrived: never chase the tool bubbles.
    expect(metrics.getScrollTop()).toBe(284);
    controller.destroy();
  });
});

// Regression: streaming content under a pinned anchor makes the browser clamp
// scrollTop and then restore it — a matched pair of real scroll events with no
// user involved (observed live as -12 then +12 during a tool run). Treating
// those as reader intent silently disabled every later re-anchor, so a
// response that opened with tool calls stayed stuck on the sent message.
describe("anchor-top first-unread — layout scroll is not reader intent", () => {
  beforeEach(() => {
    installRafMock();
  });

  it("still anchors the answer after a clamp/restore scroll pair", () => {
    const raf = installRafMock();
    const mount = createMount();
    const controller = createAgentExperience(
      mount,
      baseConfig({
        features: { scrollBehavior: { mode: "anchor-top", anchorTopOffset: 16 } },
      })
    );
    const sc = getScrollContainer(mount);
    const metrics = installScrollMetrics(sc, { scrollHeight: 1000, clientHeight: 400 });

    emitAssistantMessage(controller, "seed", "Earlier reply");
    emitUserMessage(controller, "u1", "Where is my order?");
    const userBubble = sc.querySelector<HTMLElement>('[data-message-id="u1"]');
    Object.defineProperty(userBubble!, "offsetTop", { configurable: true, value: 300 });
    raf.flush();
    expect(metrics.getScrollTop()).toBe(284);

    // Tool run: the spacer shrinks, scrollTop is clamped down, then the
    // growing transcript restores it. Both are layout, not the reader.
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
    metrics.setScrollHeight(1500);
    metrics.setScrollTop(284);
    sc.dispatchEvent(new Event("scroll"));
    raf.flush();

    // Stranded answer (delta 400): the clamp/restore pair must not have been
    // read as reader intent, so the handoff still fires. One more render so
    // the strandedness probe sees the mocked offset.
    emitStreamingAssistant(controller, "a1", "Good news — your order is on track.");
    const answer = sc.querySelector<HTMLElement>('[data-message-id="a1"]');
    Object.defineProperty(answer!, "offsetTop", { configurable: true, value: 700 });
    emitStreamingAssistant(controller, "a1", "Good news — your order is on track!");
    raf.flush();

    expect(metrics.getScrollTop()).toBe(684);
    controller.destroy();
  });
});
