// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentExperience, type AgentWidgetController } from "./ui";

let controller: AgentWidgetController;
let mount: HTMLElement;

const injectTool = (id: string, sequence: number, status: "running" | "complete" = "complete", chunks = ["Tool details"]) =>
  controller.injectTestMessage({
    type: "message",
    message: {
      id: `msg-${id}`,
      role: "assistant",
      content: "",
      createdAt: "2026-01-01T00:00:00Z",
      sequence,
      streaming: status === "running",
      variant: "tool",
      toolCall: { id, name: "Search", status, chunks },
    },
  });

const setup = (grouped: boolean, v5Defaults = true) => {
  controller = createAgentExperience(mount, {
    apiUrl: "/test",
    persistState: false,
    future: { v5Defaults },
    launcher: { enabled: false },
    features: {
      toolCallDisplay: { grouped, groupedMode: "collapsible", autoExpand: false, autoCollapseDelay: false },
    },
  });
  injectTool("call-1", 1);
  injectTool("call-2", 2);
};

const toolBubble = (toolCallId: string) =>
  mount.querySelector<HTMLElement>(`.persona-tool-bubble[data-tool-call-id="${toolCallId}"]`);
const ownHeader = (bubble: HTMLElement) =>
  Array.from(bubble.querySelectorAll<HTMLElement>('button[data-expand-header="true"]'))
    .find((header) => header.closest(".persona-tool-bubble") === bubble)!;

const installScrollMetrics = () => {
  const body = mount.querySelector<HTMLElement>(".persona-widget-body")!;
  let height = 1000;
  Object.defineProperties(body, {
    clientHeight: { configurable: true, get: () => 400 },
    scrollHeight: { configurable: true, get: () => height },
  });
  body.scrollTo = (options?: ScrollToOptions | number) => {
    if (options && typeof options === "object") body.scrollTop = options.top ?? 0;
  };
  for (const [id, top] of [["call-1", 100], ["call-2", 900]] as const) {
    Object.defineProperties(ownHeader(toolBubble(id)!), {
      offsetTop: { configurable: true, get: () => top },
      offsetParent: { configurable: true, get: () => body },
    });
  }
  return { body, grow: () => { height += 400; } };
};

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  window.scrollTo = vi.fn();
  mount = document.createElement("div");
  document.body.appendChild(mount);
});

afterEach(() => {
  controller?.destroy();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("revealToolCall", () => {
  it("stamps each tool bubble with its tool call id", () => {
    setup(false);
    expect(toolBubble("call-1")?.dataset.messageId).toBe("msg-call-1");
    expect(toolBubble("call-2")?.dataset.messageId).toBe("msg-call-2");
  });

  it("expands a standalone tool and marks it until the highlight expires", () => {
    setup(false);
    const bubble = toolBubble("call-2")!;
    expect(ownHeader(bubble).getAttribute("aria-expanded")).toBe("false");

    expect(controller.revealToolCall("call-2")).toBe(true);
    expect(ownHeader(toolBubble("call-2")!).getAttribute("aria-expanded")).toBe("true");
    expect(toolBubble("call-2")!.hasAttribute("data-persona-revealed")).toBe(true);
    expect(ownHeader(toolBubble("call-1")!).getAttribute("aria-expanded")).toBe("false");

    vi.advanceTimersByTime(2000);
    expect(toolBubble("call-2")!.hasAttribute("data-persona-revealed")).toBe(false);
  });

  it("opens the collapsed group that holds the tool before expanding it", () => {
    setup(true);
    const group = mount.querySelector<HTMLElement>('[data-message-id="tool-group-msg-call-1"]')!;
    expect(ownHeader(group).getAttribute("aria-expanded")).toBe("false");

    expect(controller.revealToolCall("call-2")).toBe(true);
    expect(ownHeader(group).getAttribute("aria-expanded")).toBe("true");
    expect(ownHeader(toolBubble("call-2")!).getAttribute("aria-expanded")).toBe("true");
  });

  it.each([[false, false], [false, true], [true, false], [true, true]])(
    "keeps the highlight through streaming renders (V5: %s, grouped: %s)",
    (v5Defaults, grouped) => {
      setup(grouped, v5Defaults);
      injectTool("call-2", 2, "running", ["Searching"]);
      controller.revealToolCall("call-2");

      vi.advanceTimersByTime(1000);
      injectTool("call-2", 2, "running", ["Searching", "Found a page"]);
      expect(toolBubble("call-2")!.textContent).toContain("Found a page");
      expect(toolBubble("call-2")!.hasAttribute("data-persona-revealed")).toBe(true);

      injectTool("call-2", 2, "complete", ["Search complete"]);
      expect(toolBubble("call-2")!.hasAttribute("data-persona-revealed")).toBe(true);
      vi.advanceTimersByTime(999);
      expect(toolBubble("call-2")!.hasAttribute("data-persona-revealed")).toBe(true);
      vi.advanceTimersByTime(1);
      expect(toolBubble("call-2")!.hasAttribute("data-persona-revealed")).toBe(false);
      injectTool("call-2", 2, "complete", ["Updated result"]);
      expect(toolBubble("call-2")!.hasAttribute("data-persona-revealed")).toBe(false);
    },
  );

  it("restarts the highlight duration when revealing the same tool again", () => {
    setup(false);
    controller.revealToolCall("call-2");
    vi.advanceTimersByTime(1000);
    controller.revealToolCall("call-2");
    vi.advanceTimersByTime(1000);
    expect(toolBubble("call-2")!.hasAttribute("data-persona-revealed")).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(toolBubble("call-2")!.hasAttribute("data-persona-revealed")).toBe(false);
  });

  it("keeps the highlight when regrouping the transcript", () => {
    setup(false);
    controller.revealToolCall("call-2");
    controller.update({ features: { toolCallDisplay: { grouped: true } } });
    expect(toolBubble("call-2")!.parentElement?.closest("[data-persona-tool-group]")).not.toBeNull();
    expect(toolBubble("call-2")!.hasAttribute("data-persona-revealed")).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(toolBubble("call-2")!.hasAttribute("data-persona-revealed")).toBe(false);
  });

  it("does not carry a highlight into a cleared conversation with the same tool ids", () => {
    setup(false);
    controller.revealToolCall("call-2");
    controller.clearChat();
    injectTool("call-2", 2);
    expect(toolBubble("call-2")!.hasAttribute("data-persona-revealed")).toBe(false);
  });

  it.each([false, true])("keeps following paused when centering reaches the bottom (reduced motion: %s)", (reduced) => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    setup(false);
    controller.update({ features: { scrollBehavior: { mode: "follow" } } });
    const { body, grow } = installScrollMetrics();
    controller.revealToolCall("call-2", { expand: false, highlightMs: 0 });
    vi.advanceTimersByTime(500);
    expect(body.scrollTop).toBe(600);
    body.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(200);
    body.dispatchEvent(new Event("scroll"));
    grow();
    injectTool("call-2", 2, "running", ["More streamed output"]);
    vi.advanceTimersByTime(500);
    expect(body.scrollTop).toBe(600);
  });

  it("cancels an earlier jump to latest and keeps following paused", () => {
    setup(false);
    controller.update({ features: {
      scrollBehavior: { mode: "follow" },
      scrollToBottom: { scrollBehavior: "smooth", scrollDurationMs: 800 },
    } });
    vi.advanceTimersByTime(1000);
    const { body, grow } = installScrollMetrics();
    body.scrollTop = 0;
    body.dispatchEvent(new Event("scroll"));
    mount.querySelector<HTMLElement>("[data-persona-scroll-to-bottom]")!.dispatchEvent(new MouseEvent("click"));
    vi.advanceTimersByTime(80);
    expect(body.scrollTop).toBeGreaterThan(0);
    controller.revealToolCall("call-1", { expand: false });
    vi.advanceTimersByTime(1000);
    expect(body.scrollTop).toBe(0);
    grow();
    injectTool("call-2", 2, "running", ["More streamed output"]);
    vi.advanceTimersByTime(500);
    expect(body.scrollTop).toBe(0);
  });

  it.each([
    ["wheel", 80, false],
    ["wheel", 250, false],
    ["keydown", 80, false],
    ["touchmove", 80, false],
    ["pointerdown", 80, false],
    ["wheel", 80, true],
  ] as const)("yields to %s at %sms (reduced motion: %s)", (input, elapsed, reduced) => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    setup(false);
    controller.update({ features: { scrollBehavior: { mode: "follow" } } });
    const { body } = installScrollMetrics();
    controller.revealToolCall("call-2", { expand: false });
    if (elapsed > 200) {
      vi.advanceTimersByTime(180);
      // A disclosure transition moves the target before the settle pass.
      Object.defineProperty(ownHeader(toolBubble("call-2")!), "offsetTop", { configurable: true, get: () => 750 });
      vi.advanceTimersByTime(elapsed - 180);
    } else vi.advanceTimersByTime(elapsed);
    body.dispatchEvent(input === "wheel" ? new WheelEvent("wheel", { deltaY: -100 })
      : input === "keydown" ? new KeyboardEvent("keydown", { key: "ArrowUp" }) : new Event(input));
    body.scrollTop = 123;
    body.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(20);
    expect(body.scrollTop).toBe(123);
    vi.advanceTimersByTime(480);
    expect(body.scrollTop).toBe(123);
    expect(toolBubble("call-2")!.hasAttribute("data-persona-revealed")).toBe(true);
    controller.revealToolCall("call-2", { expand: false });
    vi.advanceTimersByTime(500);
    expect(body.scrollTop).toBe(elapsed > 200 ? 550 : 600);
  });

  it("cancels the previous reveal's delayed centering", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    setup(false);
    const { body } = installScrollMetrics();
    controller.revealToolCall("call-1", { expand: false, highlightMs: 0 });
    vi.advanceTimersByTime(100);
    controller.revealToolCall("call-2", { expand: false, highlightMs: 0 });
    expect(body.scrollTop).toBe(600);
    vi.advanceTimersByTime(150);
    expect(body.scrollTop).toBe(600);
    vi.advanceTimersByTime(50);
    expect(body.scrollTop).toBe(600);
  });

  it("leaves details closed and skips the mark when asked", () => {
    setup(false);
    expect(controller.revealToolCall("call-1", { expand: false, highlightMs: 0 })).toBe(true);
    expect(ownHeader(toolBubble("call-1")!).getAttribute("aria-expanded")).toBe("false");
    expect(toolBubble("call-1")!.hasAttribute("data-persona-revealed")).toBe(false);
  });

  it("returns false for an unknown tool call id", () => {
    setup(false);
    expect(controller.revealToolCall("missing")).toBe(false);
  });
});
