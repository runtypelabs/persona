// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentExperience, type AgentWidgetController } from "./ui";

let controller: AgentWidgetController;
let mount: HTMLElement;

const injectTool = (id: string, sequence: number) =>
  controller.injectTestMessage({
    type: "message",
    message: {
      id: `msg-${id}`,
      role: "assistant",
      content: "",
      createdAt: "2026-01-01T00:00:00Z",
      sequence,
      variant: "tool",
      toolCall: { id, name: "Search", status: "complete", chunks: ["Tool details"] },
    },
  });

const setup = (grouped: boolean) => {
  controller = createAgentExperience(mount, {
    apiUrl: "/test",
    persistState: false,
    future: { v5Defaults: true },
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
